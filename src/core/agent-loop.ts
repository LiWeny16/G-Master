/**
 * 统一 Agent 循环 — 同时服务 AUTO 和 ON 两种模式。
 *
 * 模型选择策略：
 * - FLASH：工具调用回合（文件读取、搜索等简单执行）+ AUTO 初始评估
 * - Loop 模型（用户选择的 PRO/THINK）：思考、反思、总结、深度回答
 * - AUTO 入口 → FLASH 快速判断走向；ON 入口 → 直接 Loop 模型
 *
 * 设计原则（参考 Anthropic "Building Effective Agents"）：
 * - Agent 本质上就是 LLM + 工具 + 环境反馈的循环
 * - AUTO 模式：模型自主决定何时结束，不强制深化 / 总结
 * - ON 模式：强制多轮深度审查，达到最低轮次后才允许结束
 */

import { runInAction } from 'mobx';
import type { GeminiModelId, ISiteAdapter } from '../adapters/site-adapter';
import { invokeBackground } from '../services/message-bus';
import { StateStore } from '../stores/state-store';
import type { ClarifyQuestion, ParsedMarkers, PendingFileOp, FileOpType } from '../types';
import { parseToolCalls } from './tool-call-parser';
import { parseClarifyBlock, extractTaggedPayload, NEXT_PROMPT_TAG } from './parsers';
import { isLocalFileTool, executeLocalTool } from '../background/tools/tool-registry';
import { hasRoot as hasWorkspaceRoot, fileExists } from '../background/tools/local-workspace';
import { allSkills, buildToolsSystemPrompt } from '../skills/index';
import { saveEdit } from '../background/tools/edit-history';
import type { FileEdit } from '../types';

export class AgentLoop {
  /** 文件操作审批 Promise resolver 映射 */
  private fileOpResolvers = new Map<string, (approved: boolean) => void>();

  constructor(
    private adapter: ISiteAdapter,
    private store: StateStore,
  ) {}

  // =============================================
  // 入口：用户发送消息（AUTO / ON 统一入口）
  // =============================================

  /**
   * 拦截用户首次发送，设置运行状态并返回需要追加到编辑器的系统提示词。
   * 调用方负责将返回值通过 `appendTextAndSend` 注入。
   * 返回 null 表示不拦截。
   */
  async start(userText: string): Promise<string | null> {
    const text = userText.trim();
    if (!text || !this.store.isAgentEnabled || this.store.currentLoop > 0) return null;

    runInAction(() => {
      this.store.originalQuestion = text;
      this.store.currentLoop = 1;
      this.store.userAborted = false;
      this.store.isSummarizing = false;
      this.store.userWorkflowPhase = 'running';
      this.store.toolCallRoundsThisSession = 0;
      this.store.clarifyRoundsThisSession = 0;
      this.store.clarifyQuestions = [];
      this.store.newEditSession();
    });

    // AUTO → FLASH 快速评估/工具调用；ON → 直接 Loop 模型深度思考
    if (this.store.agentMode === 'auto') {
      await this.switchModel('flash');
    } else {
      await this.switchModel('loop');
    }

    return this.buildFullSystemPrompt();
  }

  // =============================================
  // 核心循环：DOM Observer 检测到模型输出完毕后调用
  // =============================================

  async onModelResponse(responseText: string): Promise<void> {
    if (!this.store.isAgentEnabled || this.store.userAborted || !responseText) return;

    // 总结完成 → 重置
    if (this.store.isSummarizing) {
      this.store.resetState();
      return;
    }

    // 1. 澄清问卷（优先 UX，避免模型工具调用后又弹问卷）
    const clarifyQs = parseClarifyBlock(responseText);
    if (clarifyQs && clarifyQs.length > 0) {
      await this.handleClarify(clarifyQs);
      return;
    }

    // 2. 工具调用
    const toolCalls = parseToolCalls(responseText);
    if (toolCalls.length > 0) {
      await this.handleToolCalls(toolCalls);
      return;
    }

    // 3. 按模式做后续处理
    if (this.store.agentMode === 'auto') {
      this.handleAutoCompletion(responseText);
    } else {
      this.handleOnCompletion(responseText);
    }
  }

  // =============================================
  // AUTO 模式：自然完成
  // 模型自主决定是否继续，不强制深化，不强制总结。
  // 关键：工具阶段后自动升级到 Loop 模型进行综合分析。
  // =============================================

  private handleAutoCompletion(responseText: string): void {
    const markers = this.parseActionMarkers(responseText);

    if (markers.hasContinue) {
      // 模型明确表示希望继续 → 切到 Loop 模型做深度思考
      this.store.incrementLoop();
      if (this.store.currentLoop > this.store.config.maxLoops) {
        this.finish();
        return;
      }
      const next = markers.nextPrompt ?? this.getReviewPhase();
      const label = this.isEn()
        ? `🔄 Loop ${this.store.currentLoop}`
        : `🔄 第${this.store.currentLoop}轮`;
      void this.switchModel('loop').then(() => this.sendPrompt(this.buildContinuePrompt(next), label));
    } else if (markers.hasFinish) {
      // 显式完成标记 → 信任模型判断，自然结束
      this.finish();
    } else if (this.store.toolCallRoundsThisSession > 0) {
      // 工具阶段后无标记 → FLASH 尝试直接回答而非交棒
      // 自动升级到 Loop 模型进行综合分析
      this.store.incrementLoop();
      if (this.store.currentLoop > this.store.config.maxLoops) {
        this.finish();
        return;
      }
      const label = this.isEn()
        ? `🧠 Advanced Model Synthesis`
        : `🧠 高级模型综合分析`;
      void this.switchModel('loop').then(() => this.sendPrompt(
        this.buildPostToolSynthesisPrompt(),
        label,
      ));
    } else {
      // 无工具阶段、无标记 → 纯对话自然结束
      this.finish();
    }
  }

  // =============================================
  // ON 模式：强制深度思考
  // 必须达到 minLoops 才允许结束，到达后进入总结阶段。
  // =============================================

  private handleOnCompletion(responseText: string): void {
    const markers = this.parseActionMarkers(responseText);
    const { minLoops, maxLoops } = this.store.config;

    if (markers.hasContinue) {
      this.store.incrementLoop();
      if (this.store.currentLoop > maxLoops) {
        this.summarize();
        return;
      }
      const next = markers.nextPrompt ?? this.getReviewPhase();
      const label = this.isEn()
        ? `🔄 Loop ${this.store.currentLoop} · Self-Review`
        : `🔄 第${this.store.currentLoop}轮 · 自我审查`;
      // 思考轮 → Loop 模型
      void this.switchModel('loop').then(() => this.sendPrompt(this.buildReviewPrompt(next), label));
      return;
    }

    if (markers.hasFinish) {
      if (this.store.currentLoop < minLoops) {
        // 强制深化 → Loop 模型
        this.store.incrementLoop();
        const phase = this.getReviewPhase();
        const label = this.isEn()
          ? `🔍 Loop ${this.store.currentLoop} · Forced Deepening`
          : `🔍 第${this.store.currentLoop}轮 · 强制深化`;
        void this.switchModel('loop').then(() => this.sendPrompt(this.buildForceDeepPrompt(phase), label));
      } else {
        this.summarize();
      }
      return;
    }

    // 无标记 → 根据上下文决定：工具阶段后升级综合分析，否则纠偏
    this.store.incrementLoop();
    if (this.store.currentLoop > maxLoops) {
      this.summarize();
      return;
    }
    if (this.store.toolCallRoundsThisSession > 0) {
      // 工具阶段后无标记 → 升级到 Loop 模型进行综合分析
      const label = this.isEn()
        ? `🧠 Advanced Model Synthesis`
        : `🧠 高级模型综合分析`;
      void this.switchModel('loop').then(() => this.sendPrompt(
        this.buildPostToolSynthesisPrompt(),
        label,
      ));
    } else {
      // 纠偏 → Loop 模型
      void this.switchModel('loop').then(() => this.sendPrompt(
        this.buildCorrectionPrompt(),
        this.isEn() ? '⚠️ Correction' : '⚠️ 纠偏',
      ));
    }
  }

  // =============================================
  // 工具执行（FLASH 模型处理，节省配额）
  // =============================================

  private async handleToolCalls(
    toolCalls: Array<{ name: string; args: Record<string, unknown> }>,
  ): Promise<void> {
    if (this.store.toolCallRoundsThisSession >= this.store.config.maxToolRoundsPerTurn) {
      const msg = this.isEn()
        ? `[System Internal] Tool call limit reached (${this.store.config.maxToolRoundsPerTurn}). You must now produce your final answer using only the information already gathered. Do NOT output any more [TOOL_CALL: ...].`
        : `[系统内部] 工具调用已达上限（${this.store.config.maxToolRoundsPerTurn}），你必须使用已有信息给出最终回答，不要再输出任何 [TOOL_CALL: ...]。`;
      // 工具上限后需要思考作答 → Loop 模型
      await this.switchModel('loop');
      await this.sendPrompt(msg, '⚠️');
      return;
    }

    runInAction(() => { this.store.toolCallRoundsThisSession++; });

    // 工具结果注入 → FLASH 处理（简单的结果解析和后续判断）
    await this.switchModel('flash');

    const lines: string[] = [];
    const key = this.store.config.tavilyApiKey.trim();

    for (const tc of toolCalls) {
      if (tc.name === 'web_search' && !this.store.config.tavilyEnabled) {
        lines.push('[TOOL_RESULT: web_search]\n{"error":"Web search is disabled"}');
        continue;
      }
      if (isLocalFileTool(tc.name) && !this.store.config.localFolderEnabled) {
        lines.push(`[TOOL_RESULT: ${tc.name}]\n{"error":"Workspace access is disabled"}`);
        continue;
      }
      if (isLocalFileTool(tc.name) && !hasWorkspaceRoot()) {
        const hint = this.isEn()
          ? 'Workspace root is not set. The user has not selected a local folder yet. Tell the user: please click the G-Master floating ball → open the Workspace tab → click "Select Folder" to authorize a project directory first. Do NOT deep-think about this error; just inform the user directly.'
          : '工作区根目录未设置。用户尚未选择本地文件夹。请直接告诉用户：点击 G-Master 悬浮球 → 打开「工作区」标签页 → 点击「选择文件夹」授权一个项目目录后即可使用。不要对此错误进行深度思考，直接告知用户操作步骤即可。';
        lines.push(`[TOOL_RESULT: ${tc.name}]\n{"error":${JSON.stringify(hint)}}`);
        continue;
      }

      try {
        if (isLocalFileTool(tc.name)) {
          // ── edit_file 已硬性禁用 ──
          if (tc.name === 'edit_file') {
            lines.push(`[TOOL_RESULT: ${tc.name}]\n{"error":"不支持编辑已有文件。请改用 create_file 创建新文件，或使用 rename_file/move_file 重命名和移动文件。"}`);
            continue;
          }

          // ── 写操作需要用户审批 ──
          const WRITE_OPS = new Set(['create_file', 'write_local_file', 'rename_file', 'move_file', 'delete_file', 'create_directory', 'batch_rename']);
          if (WRITE_OPS.has(tc.name)) {
            // create_file: 不允许覆盖已存在文件
            if ((tc.name === 'create_file' || tc.name === 'write_local_file') && typeof tc.args.path === 'string') {
              const exists = await fileExists(tc.args.path);
              if (exists) {
                lines.push(`[TOOL_RESULT: ${tc.name}]\n{"error":"文件已存在，禁止覆盖已有文件（${tc.args.path}）。只能创建全新的文件。"}`);
                continue;
              }
            }
            // 等待用户审批
            const approved = await this.awaitFileOpApproval(tc.name, tc.args);
            if (!approved) {
              lines.push(`[TOOL_RESULT: ${tc.name}]\n{"error":"用户拒绝了此操作"}`);
              continue;
            }
          }

          const result = await executeLocalTool(tc.name, tc.args);
          // 对 create_file / write_local_file 保存编辑历史（新建文件 diff：空 → 新内容）
          if ((tc.name === 'create_file' || tc.name === 'write_local_file') && result && typeof result === 'object') {
            const path = typeof tc.args.path === 'string' ? tc.args.path : '';
            const content = typeof tc.args.content === 'string' ? tc.args.content : '';
            if (content) {
              const { generateUnifiedDiff } = await import('../background/tools/diff-engine');
              const diff = generateUnifiedDiff(path, '', content);
              const fileEdit: FileEdit = {
                sessionId: this.store.editSessionId,
                path,
                originalContent: '',
                newContent: content,
                diff,
                timestamp: Date.now(),
                status: 'applied',
              };
              try {
                const editId = await saveEdit(fileEdit);
                fileEdit.id = editId;
                runInAction(() => { this.store.addPendingEdit(fileEdit); });
              } catch { /* 历史保存失败不阻断工具链 */ }
            }
          }
          lines.push(`[TOOL_RESULT: ${tc.name}]\n${JSON.stringify(result)}`);
        } else {
          const res = await invokeBackground({
            type: 'EXECUTE_TOOL',
            tool: tc.name,
            args: tc.args,
            tavilyApiKey: this.store.config.tavilyEnabled ? key || undefined : undefined,
          });
          lines.push(
            res.ok
              ? `[TOOL_RESULT: ${tc.name}]\n${JSON.stringify(res.result)}`
              : `[TOOL_RESULT: ${tc.name}]\n{"error":${JSON.stringify(res.error)}}`,
          );
        }
      } catch (e) {
        lines.push(
          `[TOOL_RESULT: ${tc.name}]\n{"error":${JSON.stringify(
            e instanceof Error ? e.message : String(e),
          )}}`,
        );
      }
    }

    const { markers } = this.store.config;
    const prefix = this.isEn()
      ? '[System Internal — Tool Execution Results]\n' +
        'The host has executed your tool calls. Results are below.\n\n' +
        'IMPORTANT: You are currently the fast/lightweight model handling the information-gathering phase.\n' +
        'You MUST NOT generate lengthy code, write comprehensive answers, or produce creative content. That is the advanced model\'s job.\n' +
        'After reviewing these results, you MUST choose exactly ONE of these actions:\n' +
        `1. Need more information → Output additional [TOOL_CALL: ...] to gather it. Nothing else.\n` +
        `2. Information gathered OR task requires code generation/file editing/analysis → Output ${markers.continueMarker} at the end, followed by [NEXT_PROMPT]\n[brief summary of gathered info + what the user needs]\n[NEXT_PROMPT]. The system will switch to the advanced model.\n` +
        `3. Trivially simple factual lookup (e.g. "what version?", "does file X exist?") → Output your brief answer followed by ${markers.finishMarker}.\n\n` +
        'CRITICAL: If the user asked to edit, create, optimize, or modify files/code, you MUST choose option 2 to hand off to the advanced model. Do NOT attempt code generation yourself.\n' +
        'Reminder: Do NOT reproduce [TOOL_CALL: ...] as examples or illustrations. Only output it for genuine tool invocations.\n\n'
      : '[系统内部 — 工具执行结果]\n' +
        '宿主已执行你的工具调用，结果如下。\n\n' +
        '重要：你当前是快速/轻量模型，负责信息收集阶段。\n' +
        '你绝不能生成大段代码、撰写全面的回答或创作内容，那是高级模型的工作。\n' +
        '审查这些结果后，你必须选择以下动作之一：\n' +
        `1. 还需要更多信息 → 继续输出 [TOOL_CALL: ...] 获取，不要输出其他内容。\n` +
        `2. 信息已收集完毕，或任务需要代码生成/文件编辑/深度分析 → 在末尾输出 ${markers.continueMarker}，然后附上 [NEXT_PROMPT]\n[已收集信息的摘要 + 用户需要什么]\n[NEXT_PROMPT]。系统将切换到高级模型。\n` +
        `3. 极其简单的事实查询（如"版本号是多少？""文件X是否存在？"）→ 输出简短回答并附上 ${markers.finishMarker}。\n\n` +
        '关键规则：如果用户要求编辑、创建、优化或修改文件/代码，你必须选择选项 2 交给高级模型处理。绝不要自己尝试生成代码。\n' +
        '提醒：不要将 [TOOL_CALL: ...] 作为示例输出，仅在真正需要调用时使用。\n\n';

    await this.sendPrompt(prefix + lines.join('\n\n'), this.isEn() ? 'File Context' : '补充文件内容');
  }

  // =============================================
  // 澄清问卷
  // =============================================

  private async handleClarify(questions: ClarifyQuestion[]): Promise<void> {
    if (!this.store.tryEnterClarifyRound()) {
      this.store.incrementLoop();
      if (this.store.currentLoop > this.store.config.maxLoops) {
        this.summarize();
        return;
      }
      // 澄清上限后需要思考 → Loop 模型
      await this.switchModel('loop');
      await this.sendPrompt(
        this.buildClarifyLimitPrompt(),
        this.isEn() ? '⚠️ Clarify Limit' : '⚠️ 澄清上限',
      );
      return;
    }

    runInAction(() => {
      this.store.currentLoop = Math.max(1, this.store.currentLoop);
      this.store.userWorkflowPhase = 'clarify';
      this.store.clarifyQuestions = questions;
    });
  }

  /** 用户提交问卷答案后继续对话 */
  async resumeAfterClarify(answers: string[]): Promise<void> {
    if (!this.store.isAgentEnabled || this.store.userAborted) return;

    // 问卷答案后继续思考 → Loop 模型
    await this.switchModel('loop');

    const questions = this.store.clarifyQuestions;
    const qaLines = questions.map((q, i) => `Q: ${q.question}\nA: ${answers[i] ?? ''}`).join('\n\n');
    const prefix = this.isEn()
      ? '[System Internal — User Clarification Response]\nThe user has provided the following supplementary information. Continue with the response based on these inputs:\n\n'
      : '[系统内部 — 用户澄清回复]\n用户已补充以下关键信息，请基于这些信息继续完成回答：\n\n';

    const { markers } = this.store.config;
    const constraint = this.isEn()
      ? `\n\n[System Internal] Continue based on the info above. You are still inside the Agent Loop. End with ${markers.continueMarker} + [NEXT_PROMPT]...[NEXT_PROMPT] or ${markers.finishMarker}.`
      : `\n\n[系统内部] 请基于以上信息继续回答。你仍处于 Agent 循环中。结尾附 ${markers.continueMarker} + [NEXT_PROMPT]...[NEXT_PROMPT] 或 ${markers.finishMarker}。`;

    const supplementText = prefix + qaLines + constraint;

    runInAction(() => {
      this.store.originalQuestion += '\n\n' + supplementText;
      this.store.userWorkflowPhase = 'running';
      this.store.clarifyQuestions = [];
      this.store.currentLoop = Math.max(1, this.store.currentLoop + 1);
    });

    await this.sendPrompt(
      supplementText,
      this.isEn() ? '📝 Supplementary Info' : '📝 补充信息',
    );
  }

  // =============================================
  // 文件操作审批（暂停 Agent 循环，等待用户确认）
  // =============================================

  /**
   * 向用户展示审批弹窗，等待用户批准或拒绝。
   * 内部使用 Promise + resolver 映射，供 UI 调用 resolveFileOp 来 resolve。
   */
  private awaitFileOpApproval(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<boolean> {
    const opId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const op: PendingFileOp = {
      id: opId,
      type: toolName as FileOpType,
      args,
      timestamp: Date.now(),
    };
    return new Promise<boolean>((resolve) => {
      this.fileOpResolvers.set(opId, resolve);
      runInAction(() => {
        this.store.addPendingFileOp(op);
        this.store.userWorkflowPhase = 'awaiting_file_op';
      });
    });
  }

  /**
   * UI 调用：用户批准或拒绝一个待审批文件操作。
   */
  resolveFileOp(opId: string, approved: boolean): void {
    const resolver = this.fileOpResolvers.get(opId);
    if (!resolver) return;
    this.fileOpResolvers.delete(opId);
    runInAction(() => { this.store.removePendingFileOp(opId); });
    resolver(approved);
  }

  // =============================================
  // 终止与总结
  // =============================================

  private finish(): void {
    this.store.resetState();
  }

  private summarize(): void {
    runInAction(() => { this.store.isSummarizing = true; });
    // 总结 → Loop 模型
    void this.switchModel('loop').then(() => this.sendPrompt(
      this.buildSummaryPrompt(),
      this.isEn() ? '📋 Final Summary' : '📋 最终总结',
    ));
  }

  abort(): void {
    runInAction(() => { this.store.userAborted = true; });
    // 拒绝所有等待审批的文件操作
    for (const [, resolver] of this.fileOpResolvers) {
      resolver(false);
    }
    this.fileOpResolvers.clear();
    runInAction(() => { this.store.pendingFileOps = []; });
    this.store.resetState();
  }

  // =============================================
  // Prompt 构造器
  // =============================================

  private buildFullSystemPrompt(): string {
    let prompt = '';

    // 1. 记忆
    const mems = this.store.config.pinnedMemories?.filter(m => m.enabled && m.content.trim()) || [];
    if (mems.length > 0) {
      const defTitle = this.isEn() ? 'Memory' : '记忆';
      const text = mems.map(m => `[${m.title || defTitle}]: ${m.content}`).join('\n\n');
      const header = this.isEn() ? '[User Pinned Memories & Presets]' : '[用户设定的全局记忆与预设 Prompt]';
      prompt += `\n\n${header}:\n${text}`;
    }

    // 2. 模式系统提示词
    prompt += '\n\n' + (this.store.agentMode === 'on'
      ? this.store.config.systemPromptTemplate
      : this.buildAutoSystemPrompt());

    // 3. 工具描述
    const tools = this.buildToolsPrompt();
    if (tools) prompt += '\n\n' + tools;

    return prompt;
  }

  private buildAutoSystemPrompt(): string {
    const { markers } = this.store.config;
    if (this.isEn()) {
      return (
        `⟪DT: Agent Mode⟫\n` +
        `[Execution Environment — READ CAREFULLY]\n` +
        `You are running inside an automated Agent Loop system. Understand this architecture:\n` +
        `- You are NOT directly chatting with the user. A host system intercepts and processes every response you produce.\n` +
        `- Your intermediate outputs (tool calls, continuation markers) are consumed by the host, NOT shown to the user.\n` +
        `- Only your final answer (containing no markers or tool calls) will be presented to the user.\n` +
        `- The host injects tool results via [TOOL_RESULT: ...] — these are system messages, not user messages.\n\n` +
        `[Tool Call Protocol — CRITICAL]\n` +
        `- [TOOL_CALL: name({...})] is a LIVE EXECUTION PRIMITIVE. The moment you output it, the host executes it immediately.\n` +
        `- NEVER output [TOOL_CALL: ...] as an example, illustration, or explanation. Output = Execution. No exceptions.\n` +
        `- If you need to describe tool capabilities to reason about them, use natural language (e.g. "I can search the web" or "I can read files"). NEVER reproduce the bracket syntax outside of an actual invocation.\n` +
        `- When you truly need a tool, output the call on its own line with nothing else around it. Do not wrap it in code blocks or quotes.\n` +
        `- After outputting a tool call, STOP. Do not guess or fabricate the result. Wait for [TOOL_RESULT: ...] in the next turn.\n\n` +
        `[Response Rules]\n` +
        `1. Simple questions → answer directly and concisely. Do NOT over-analyze.\n` +
        `2. Complex questions → think step by step, use tools if genuinely needed.\n` +
        `3. After answering completely, end your response naturally. No special markers needed.\n` +
        `4. If you need more analysis rounds, output ${markers.continueMarker} at the very end, then [NEXT_PROMPT]\n[direction]\n[NEXT_PROMPT].\n` +
        `5. If critical info is missing, output [CLARIFY]\n[{"question":"...","options":["A","B"]}]\n[CLARIFY]. Max 3 questions.\n` +
        `6. Never fabricate facts. Say "I'm not sure" when uncertain. Claims must cite sources.`
      );
    }
    return (
      `⟪DT: Agent 模式⟫\n` +
      `[执行环境 — 务必理解]\n` +
      `你正运行在一个自动化 Agent 循环系统中。请理解以下架构：\n` +
      `- 你并非直接与用户对话。宿主系统会拦截并处理你的每一条输出。\n` +
      `- 你的中间输出（工具调用、继续标记等）由宿主消费，不会展示给用户。\n` +
      `- 只有你的最终回答（不含任何标记或工具调用）才会呈现给用户。\n` +
      `- 宿主通过 [TOOL_RESULT: ...] 注入工具执行结果——这是系统消息，不是用户说的话。\n\n` +
      `[工具调用协议 — 极其重要]\n` +
      `- [TOOL_CALL: name({...})] 是实时执行原语。你输出它的瞬间，宿主就会立刻执行。\n` +
      `- 绝不要把 [TOOL_CALL: ...] 当作示例、说明或解释输出。输出 = 执行，没有例外。\n` +
      `- 如需描述工具能力来辅助推理，请用自然语言（如"我可以搜索网页"或"我可以读取文件"）。绝不要在非真实调用场景下重现括号语法。\n` +
      `- 真正需要工具时，将调用独占一行输出，不要包裹在代码块或引号中。\n` +
      `- 输出工具调用后立即停止。不要猜测或编造结果，等待下一轮的 [TOOL_RESULT: ...]。\n\n` +
      `[回答规则]\n` +
      `1. 简单问题 → 直接简洁回答，不要过度分析。\n` +
      `2. 复杂问题 → 逐步思考，在真正需要时使用工具。\n` +
      `3. 完全回答后自然结束即可，无需特殊标记。\n` +
      `4. 若需继续分析，在最末尾输出 ${markers.continueMarker}，并附上 [NEXT_PROMPT]\n[分析方向]\n[NEXT_PROMPT]。\n` +
      `5. 若缺少关键信息，可输出 [CLARIFY]\n[{"question":"...","options":["A","B"]}]\n[CLARIFY]，最多3题。\n` +
      `6. 严禁编造事实，不确定时请说明。论点须提供可信数据来源或参考 URL。`
    );
  }

  private buildToolsPrompt(): string {
    const enabled = allSkills.filter(s => {
      if (s.id === 'web_search') return this.store.config.tavilyEnabled;
      if (s.id === 'local_workspace') return this.store.config.localFolderEnabled;
      return true;
    });
    if (enabled.length === 0) return '';
    return buildToolsSystemPrompt(enabled, this.store.config.language);
  }

  private buildContinuePrompt(nextQuestion: string): string {
    if (this.isEn()) {
      return (
        `[System Internal — Continue Analysis]\n` +
        `Continue your analysis on: ${nextQuestion}\n\n` +
        `Remember the original question: "${this.store.originalQuestion}".\n` +
        `You are still inside the Agent Loop — your output is processed by the host, not shown to the user directly.`
      );
    }
    return (
      `[系统内部 — 继续分析]\n` +
      `请继续分析：${nextQuestion}\n\n` +
      `请围绕原始问题展开："${this.store.originalQuestion}"。\n` +
      `你仍处于 Agent 循环中——你的输出由宿主处理，不会直接展示给用户。`
    );
  }

  /**
   * 工具收集阶段完成后，切换到 Loop 模型进行综合分析的提示词。
   * 当 FLASH 完成信息收集但未正确发出 THINK_MORE 信号时，作为自动升级的后备触发。
   */
  private buildPostToolSynthesisPrompt(): string {
    const { markers } = this.store.config;
    if (this.isEn()) {
      return (
        `[System Internal — Model Upgrade: Synthesis Phase]\n` +
        `The information-gathering phase (tool calls) is complete. You are now running as the ADVANCED model.\n` +
        `All tool results from previous rounds are available in the conversation history above.\n\n` +
        `Original question: "${this.store.originalQuestion}"\n\n` +
        `Your task:\n` +
        `- If the user asked to edit/optimize/create code or files → Use [TOOL_CALL: edit_file(...)] or [TOOL_CALL: create_file(...)] to EXECUTE the changes directly. Do NOT just describe what to change — actually do it.\n` +
        `- If the user asked for analysis/explanation → Provide a thorough, well-structured answer based on ALL gathered information.\n` +
        `- Synthesize all tool results into a coherent response\n` +
        `- Use clear structure (headings, lists, code blocks) as appropriate\n` +
        `- If you need even deeper analysis, output ${markers.continueMarker} + [NEXT_PROMPT]\\n[direction]\\n[NEXT_PROMPT]\n` +
        `- When fully done, end naturally or output ${markers.finishMarker}`
      );
    }
    return (
      `[系统内部 — 模型升级：综合分析阶段]\n` +
      `信息收集阶段（工具调用）已完成。你现在运行的是高级模型。\n` +
      `之前各轮的工具执行结果均在上方对话历史中。\n\n` +
      `原始问题："${this.store.originalQuestion}"\n\n` +
      `你的任务：\n` +
      `- 如果用户要求编辑/优化/创建代码或文件 → 使用 [TOOL_CALL: edit_file(...)] 或 [TOOL_CALL: create_file(...)] 直接执行修改。不要只描述要改什么——直接动手做。\n` +
      `- 如果用户要求分析/解释 → 基于所有已收集的信息，提供详尽、结构清晰的回答。\n` +
      `- 将所有工具结果综合为连贯、全面的回答\n` +
      `- 适当使用清晰的结构（标题、列表、代码块）\n` +
      `- 如需更深入分析，可输出 ${markers.continueMarker} + [NEXT_PROMPT]\\n[方向]\\n[NEXT_PROMPT]\n` +
      `- 完成后自然结束，或输出 ${markers.finishMarker}`
    );
  }

  private buildReviewPrompt(nextQuestion: string): string {
    const { markers } = this.store.config;
    if (this.isEn()) {
      return (
        `[System Internal — Self-Review Task]: ${nextQuestion}\n\n` +
        `[Anchor Reminder] All reflections MUST revolve around the original question: "${this.store.originalQuestion}".\n` +
        `You are inside the Agent Loop — this output is for self-review, not shown to the user.\n\n` +
        `Be strictly critical of your own reasoning. Provide factual sources and URLs. If you don't know, say so.\n` +
        `You may ONLY output ${markers.finishMarker} to finish if: (a) arguments have evidence, (b) counterarguments have been checked, and (c) edge cases are covered.\n` +
        `Otherwise, you MUST output ${markers.continueMarker} + [NEXT_PROMPT]\n[question]\n[NEXT_PROMPT] to continue.`
      );
    }
    return (
      `[系统内部 — 自我审查任务]：${nextQuestion}\n\n` +
      `[锚定提醒]所有反思必须围绕原始问题展开："${this.store.originalQuestion}"。\n` +
      `你处于 Agent 循环中——本次输出用于自我审查，不会展示给用户。\n\n` +
      `请严格批判自己的推理，提供事实依据和 URL。不确定时请直说。\n` +
      `只有满足以下全部条件才能输出 ${markers.finishMarker}：(a) 论点有证据支撑；(b) 已检验反驳论点；(c) 边界情况已覆盖。\n` +
      `否则必须输出 ${markers.continueMarker} + [NEXT_PROMPT]\n[具体质疑问题]\n[NEXT_PROMPT] 继续。`
    );
  }

  private buildForceDeepPrompt(reviewPhase: string): string {
    const { markers } = this.store.config;
    const min = this.store.config.minLoops;
    if (this.isEn()) {
      return (
        `[System Internal — Forced Deep Review]: You concluded too early. The system requires at least ${min} review rounds (currently at round ${this.store.currentLoop}).\n\n` +
        `Mandatory review perspective for this round: ${reviewPhase}\n\n` +
        `[Anchor Reminder] All reflections MUST revolve around the original question: "${this.store.originalQuestion}".\n` +
        `You are inside the Agent Loop — this is an internal self-review, not shown to the user.\n\n` +
        `After reviewing, if new issues are found, output ${markers.continueMarker} + [NEXT_PROMPT]\n[question]\n[NEXT_PROMPT]; if all exit conditions are met, output ${markers.finishMarker}.`
      );
    }
    return (
      `[系统内部 — 强制深度审查]：你结束得太早了。系统要求至少 ${min} 轮审查（当前第 ${this.store.currentLoop} 轮）。\n\n` +
      `本轮强制审查视角：${reviewPhase}\n\n` +
      `[锚定提醒]所有反思必须围绕原始问题展开："${this.store.originalQuestion}"。\n` +
      `你处于 Agent 循环中——这是内部自我审查，不会展示给用户。\n\n` +
      `审查后：若发现新问题，输出 ${markers.continueMarker} + [NEXT_PROMPT]\n[问题]\n[NEXT_PROMPT]；若全部退出条件均已满足，输出 ${markers.finishMarker}。`
    );
  }

  private buildSummaryPrompt(): string {
    if (this.isEn()) {
      return (
        `[System Internal — Final Summary Command]: Deep thinking has concluded. This is the LAST round — your output will be shown directly to the user.\n\n` +
        `Review all thoughts and corrections from the original question until now regarding:\n` +
        `"${this.store.originalQuestion}"\n\n` +
        `Provide a comprehensive final summary. Requirements:\n` +
        `1. Clear structure, utilizing headings, tables, etc.\n` +
        `2. Consolidate verified core conclusions and exclude overturned errors.\n` +
        `3. Mark uncertain parts explicitly.\n` +
        `4. Include citation sources and links.\n` +
        `5. Provide a direct and complete response to the original question.\n\n` +
        `Output the summary directly, without any ACTION markers, [TOOL_CALL: ...], or internal system tags.`
      );
    }
    return (
      `[系统内部 — 最终总结指令]：深度思考已完成。这是最后一轮——你的输出将直接展示给用户。\n\n` +
      `请回顾从原始问题至今的所有思考与纠正：\n` +
      `"${this.store.originalQuestion}"\n\n` +
      `提供一份全面的最终总结。要求：\n` +
      `1. 结构清晰，使用标题、表格等格式。\n` +
      `2. 汇总已验证的核心结论，排除已被推翻的错误。\n` +
      `3. 明确标注不确定的部分。\n` +
      `4. 包含引用来源和链接。\n` +
      `5. 对原始问题提供直接、完整的回应。\n\n` +
      `直接输出总结，不要附加任何 ACTION 标记、[TOOL_CALL: ...] 或系统内部标签。`
    );
  }

  private buildCorrectionPrompt(): string {
    const { markers } = this.store.config;
    if (this.isEn()) {
      return (
        `[System Internal — Correction]: No action markers detected in your last output. You are still inside the Agent Loop — the user cannot see your intermediate outputs.\n` +
        `Continue reasoning around the original question: "${this.store.originalQuestion}".\n` +
        `You MUST append ${markers.continueMarker} + [NEXT_PROMPT]\n[question]\n[NEXT_PROMPT] to continue, or ${markers.finishMarker} to finish at the very end.\n` +
        `Do NOT output [TOOL_CALL: ...] as examples — only for genuine tool invocations.`
      );
    }
    return (
      `[系统内部 — 纠偏]：你的上一轮输出未检测到动作标记。你仍处于 Agent 循环中——用户无法看到你的中间输出。\n` +
      `请围绕原始问题继续推理："${this.store.originalQuestion}"。\n` +
      `你必须在最末尾附上 ${markers.continueMarker} + [NEXT_PROMPT]\n[问题]\n[NEXT_PROMPT] 继续，或 ${markers.finishMarker} 结束。\n` +
      `不要将 [TOOL_CALL: ...] 作为示例输出——仅在真正需要调用工具时使用。`
    );
  }

  private buildClarifyLimitPrompt(): string {
    const { markers } = this.store.config;
    if (this.isEn()) {
      return (
        `[System Internal — Constraint]: Clarification round limit reached. Do NOT output [CLARIFY] anymore.\n` +
        `You are still inside the Agent Loop. Proceed with explicit assumptions based on available information.\n` +
        `Keep reasoning anchored to: "${this.store.originalQuestion}".\n` +
        `You MUST end with either ${markers.continueMarker} + [NEXT_PROMPT]\n[question]\n[NEXT_PROMPT] or ${markers.finishMarker}.`
      );
    }
    return (
      `[系统内部 — 约束]：本轮对话的澄清问卷次数已达上限，请不要再输出 [CLARIFY]。\n` +
      `你仍处于 Agent 循环中。请基于现有信息明确写出你的假设，并围绕原问题继续推理。\n` +
      `原始问题："${this.store.originalQuestion}"。\n` +
      `你的回复末尾必须包含 ${markers.continueMarker} + [NEXT_PROMPT]\n[问题]\n[NEXT_PROMPT]，或 ${markers.finishMarker}。`
    );
  }

  // =============================================
  // 解析工具
  // =============================================

  parseActionMarkers(text: string): ParsedMarkers {
    const { markers } = this.store.config;
    const hasContinue = text.includes(markers.continueMarker) || text.includes('[ACTION: THINK_MORE]');
    const hasFinish = text.includes(markers.finishMarker) || text.includes('[ACTION: GOAL_REACHED]');

    let nextPrompt = extractTaggedPayload(text, NEXT_PROMPT_TAG);
    if (!nextPrompt) {
      const re = new RegExp(markers.nextPromptPattern);
      const m = text.match(re);
      if (m?.[1]) {
        nextPrompt = m[1].trim();
      } else {
        const m2 = text.match(/\[NEXT_PROMPT:\s*([\s\S]*?)\]/);
        if (m2?.[1]) nextPrompt = m2[1].trim();
      }
    }

    return { hasContinue, hasFinish, nextPrompt: nextPrompt ?? null };
  }

  private getReviewPhase(): string {
    const phases = this.store.config.reviewPhases;
    const idx = (this.store.currentLoop - 2) % phases.length;
    return phases[Math.max(0, idx)];
  }

  // =============================================
  // 通用工具方法
  // =============================================

  async sendPrompt(text: string, dtLabel?: string): Promise<void> {
    if (this.store.userAborted) return;
    const finalText = dtLabel ? `⟪DT:${dtLabel}⟫\n${text}` : text;
    await this.adapter.insertTextAndSend(finalText);
  }

  /** 切换模型：flash=工具执行, loop=用户选择的思考模型 */
  private async switchModel(target: 'flash' | 'loop'): Promise<void> {
    if (!this.adapter.switchGeminiModel) return;
    const id: GeminiModelId = target === 'flash' ? 'fast' : this.loopModelToGeminiId();
    await this.adapter.switchGeminiModel(id);
  }

  private loopModelToGeminiId(): GeminiModelId {
    const m = this.store.config.loopModel;
    if (m === 'fast') return 'fast';
    if (m === 'think') return 'thinking';
    return 'pro';
  }

  private isEn(): boolean {
    return this.store.config.language === 'en';
  }
}
