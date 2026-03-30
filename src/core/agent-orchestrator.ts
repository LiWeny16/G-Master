import type { GeminiModelId, ISiteAdapter } from '../adapters/site-adapter';
import { buildToolsSystemPrompt, allSkills } from '../skills/index';
import { getIntentSystemPrompt } from './intent-prompt';
import { DeepThinkEngine } from './deep-think-engine';
import type { StateStore } from '../stores/state-store';
import type { LoopModel } from '../types';
import { parseIntentJson, parseClarifyBlock } from './parsers';
import { runInAction } from 'mobx';

export type UserWorkflowPhase = 'none' | 'intent' | 'deep' | 'clarify';

export interface ParsedIntent {
  route: 'direct' | 'deep' | 'clarify';
  deep_loops: number;
  needs_web: boolean;
  needs_files: boolean;
  needs_code: boolean;
  summary: string;
}

/**
 * 全能 Agent：快速模型意图 →（进入深度后由 DeepThinkEngine 处理 TOOL_CALL）→ Pro 主任务。
 */
export class AgentOrchestrator {
  constructor(
    private adapter: ISiteAdapter,
    private store: StateStore,
    private engine: DeepThinkEngine,
  ) { }

  private async switchModel(model: GeminiModelId): Promise<void> {
    if (this.adapter.switchGeminiModel) {
      await this.adapter.switchGeminiModel(model);
    }
  }

  private loopModelToGeminiModel(loopModel: LoopModel): GeminiModelId {
    if (loopModel === 'fast') return 'fast';
    if (loopModel === 'think') return 'thinking';
    return 'pro';
  }

  private getLoopModelLabel(model: GeminiModelId): string {
    if (model === 'fast') return 'FAST';
    if (model === 'thinking') return 'THINK';
    return 'PRO';
  }

  private buildEnabledToolsPrompt(): string {
    const enabledSkills = allSkills.filter((s) => {
      if (s.id === 'web_search') return this.store.config.tavilyEnabled;
      if (s.id === 'local_files') return this.store.config.localFolderEnabled;
      return true;
    });

    if (enabledSkills.length === 0) {
      return this.store.config.language === 'en'
        ? '[Tool Calling] No tools are currently enabled, DO NOT output TOOL_CALL.'
        : '【工具调用】当前未启用任何工具，请勿输出 TOOL_CALL。';
    }

    return buildToolsSystemPrompt(enabledSkills, this.store.config.language);
  }

  /** 用户首次发送后：切到「快速」并发意图分类提示（不含深度思考模板）。 */
  async beginIntentPhase(userPlainText: string): Promise<void> {
    const t = userPlainText.trim();
    if (!t) return;

    runInAction(() => {
      this.store.userWorkflowPhase = 'intent';
      this.store.originalQuestion = t;
      this.store.currentLoop = 0;
      this.store.userAborted = false;
      this.store.isSummarizing = false;
      this.store.toolCallRoundsThisSession = 0;
      this.store.plannedDeepLoops = null;
      this.store.clarifyQuestions = [];
    });

    await this.switchModel('fast');

    // 构建记忆注入文本，让 route=direct 时 FLASH 也遵循用户的系统提示
    let memoryBlock = '';
    const activeMemories = this.store.config.pinnedMemories?.filter(m => m.enabled && m.content.trim()) || [];
    if (activeMemories.length > 0) {
      const defaultTitle = this.store.config.language === 'en' ? 'Memory' : '记忆';
      const memoriesText = activeMemories.map(m => `[${m.title || defaultTitle}]: ${m.content}`).join('\n\n');
      const userPromptPrefix = this.store.config.language === 'en'
        ? '\n\n[User Pinned Memories / Prompts — If route=direct, please follow these instructions in your final response]:\n'
        : '\n\n【用户设定的全局记忆与预设 Prompt — 若 route=direct 请在回答中遵守这些指令】:\n';
      memoryBlock = `${userPromptPrefix}${memoriesText}\n`;
    }

    const decisionPrefix = this.store.config.language === 'en' ? '[G-Master AUTO Decision]' : '[G-Master AUTO 决策]';
    const userMsgPrefix = this.store.config.language === 'en' ? 'User Message:' : '用户消息：';
    const intentPrompt = getIntentSystemPrompt(this.store.config.language);
    const body = `${decisionPrefix}\n${intentPrompt}${memoryBlock}\n\n${userMsgPrefix}\n${t}`;
    await this.adapter.insertTextAndSend(body);
  }

  /** 意图回复完成后：检测 [CLARIFY] 问卷块 → 显示问卷；否则 direct 结束 / deep 起循环。 */
  async finishIntentAndStartDeep(intentResponseText: string): Promise<void> {
    if (!this.store.isAgentEnabled || this.store.userAborted) return;
    if (this.store.userWorkflowPhase !== 'intent') return;

    const parsed = parseIntentJson(intentResponseText);
    if (!parsed) {
      // 解析失败时不强行进入深度，避免打断 FAST 的直接回答。
      runInAction(() => {
        this.store.userWorkflowPhase = 'none';
        this.store.currentLoop = 0;
        this.store.plannedDeepLoops = null;
      });
      return;
    }

    runInAction(() => {
      this.store.lastIntentSummary = parsed?.summary ?? '';
    });

    // === 检测 route ===
    // 如果路由器指定了 clarify，则它并没有生成具体问卷，我们需要通过 PRO/THINK 主动发起一次问卷生成。
    if (parsed.route === 'clarify') {
      runInAction(() => {
        // 先设为 deep，用大模型生成问题，大模型发回来的内容带有 [CLARIFY] 包裹块后再拦截显示
        this.store.userWorkflowPhase = 'deep';
        this.store.currentLoop = 1;
        this.store.isSummarizing = false;
        this.store.plannedDeepLoops = 1; // 仅一次循环用于生成问卷
        // 保存 intent，供用户提交问卷答案后 resumeAfterClarify → _startDeepOrFinish 使用
        this.store.pendingIntent = parsed;
      });

      const loopModel = this.loopModelToGeminiModel(this.store.config.loopModel);
      await this.switchModel(loopModel);

      const clarifyPrompt = this.store.config.language === 'en'
        ? `[AUTO Decision] The user query misses critical information. You need to ask clarifying questions.\n\nPlease strictly output a [CLARIFY] wrapped block with up to 3 questions (each must have options). Return ONLY the [CLARIFY] block and nothing else.\nFormat:\n[CLARIFY]\n[{"question":"Question text","options":["Option A","Option B"]}]\n[CLARIFY]\n\nUser Query: ${this.store.originalQuestion}`
        : `[AUTO 决策] 用户问题缺少关键条件。你需要向用户追问关键信息。\n\n请严格输出一个 [CLARIFY] 包裹块，包含最多 3 个问题，每个问题必须有选项供用户选择。除了 [CLARIFY] 块外，不要输出其他任何内容！\n格式示例：\n[CLARIFY]\n[{"question":"问题文本","options":["选项A","选项B"]}]\n[CLARIFY]\n\n用户原始问题：${this.store.originalQuestion}`;

      const uiTitlePrefix = this.store.config.language === 'en'
        ? `🧠 Generating Clarification Questions...`
        : `🧠 构思澄清问卷...`;

      await this.engine.sendPrompt(clarifyPrompt, uiTitlePrefix);
      return;
    }

    // 兼容旧格式与新格式的 [CLARIFY] 问卷块
    const clarifyQuestions = parseClarifyBlock(intentResponseText);
    if (clarifyQuestions && clarifyQuestions.length > 0) {
      if (!this.store.tryEnterClarifyRound()) {
        await this._startDeepOrFinish(parsed);
        return;
      }

      runInAction(() => {
        // 问卷也计入轮次：intent 直接产出问卷时至少占用第 1 轮。
        this.store.currentLoop = Math.max(1, this.store.currentLoop);
        this.store.userWorkflowPhase = 'clarify';
        this.store.clarifyQuestions = clarifyQuestions;
        // 保留 parsed 供 resumeAfterClarify 使用
        this.store.lastIntentSummary = parsed.summary;
        this.store.pendingIntent = parsed;
      });
      return; // 等待用户在 UI 中回答
    }

    // 没有 [CLARIFY] 问卷块，走原有逻辑
    await this._startDeepOrFinish(parsed);
  }

  /** 用户提交问卷答案后，携带答案继续工作流 */
  async resumeAfterClarify(answers: string[]): Promise<void> {
    if (!this.store.isAgentEnabled || this.store.userAborted) return;

    const pendingIntent = this.store.pendingIntent;

    // 构建带答案的附加 prompt
    const questions = this.store.clarifyQuestions;
    const qaLines = questions.map((q, i) => `Q: ${q.question}\nA: ${answers[i] ?? ''}`).join('\n\n');
    const prefixZh = '用户已补充以下关键信息，请基于这些信息继续完成回答：\n\n';
    const prefixEn = 'The user has provided the following supplementary information. Please continue with the response based on these inputs:\n\n';
    const prefix = this.store.config.language === 'en' ? prefixEn : prefixZh;

    const { markers } = this.store.config;
    const loopConstraintEn = `\n\n[System Constraint]: You are still in a deep thinking loop. You MUST end your response with either ${markers.continueMarker} + [NEXT_PROMPT: ...] to continue, or ${markers.finishMarker} to conclude and output the final summary.`;
    const loopConstraintZh = `\n\n【系统约束】当前仍在深度思考循环中！你的回复末尾必须包含 ${markers.continueMarker} + [NEXT_PROMPT: ...] 继续循环，或使用 ${markers.finishMarker} 结束并准备输出最终总结。`;
    const loopConstraint = this.store.config.language === 'en' ? loopConstraintEn : loopConstraintZh;

    const supplementText = prefix + qaLines + loopConstraint;

    // 更新原始问题（追加答案上下文）
    runInAction(() => {
      this.store.originalQuestion = this.store.originalQuestion + '\n\n' + supplementText;
      // 临时标记 intent，若后续走 _startDeepOrFinish 则需要
      this.store.userWorkflowPhase = 'intent';
      this.store.clarifyQuestions = [];
      this.store.pendingIntent = null;
    });

    if (pendingIntent) {
      await this._startDeepOrFinish(pendingIntent, supplementText);
    } else {
      // 走到这里说明是在深度思考阶段（ON模式或AUTO的deep模式）触发的问卷
      runInAction(() => {
        this.store.userWorkflowPhase = 'deep';
        // 问卷提交后继续深度思考，推进到下一轮。
        this.store.currentLoop = Math.max(1, this.store.currentLoop + 1);
      });
      const uiLabel = this.store.config.language === 'en' ? '📝 Supplementary Info' : '📝 用户补充信息';
      await this.engine.sendPrompt(supplementText, uiLabel);
    }
  }

  /** 内部：intent 解析完后，决定 direct 结束还是进入深度循环 */
  private async _startDeepOrFinish(parsed: ParsedIntent, supplementalText?: string): Promise<void> {
    const forceDeepByToolNeed =
      (parsed.needs_web && this.store.config.tavilyEnabled) ||
      (parsed.needs_files && this.store.config.localFolderEnabled);

    if (parsed.route === 'direct' && !forceDeepByToolNeed) {
      // simple 问题直接由 FAST 回答，不进入 LOOP。
      // 若有补充信息，需要把补充信息重新注入
      if (supplementalText) {
        await this.adapter.insertTextAndSend(supplementalText);
      }
      runInAction(() => {
        this.store.userWorkflowPhase = 'none';
        this.store.currentLoop = 0;
        this.store.isSummarizing = false;
        this.store.toolCallRoundsThisSession = 0;
        this.store.plannedDeepLoops = null;
      });
      return;
    }

    const startLoop = supplementalText
      ? Math.max(1, this.store.currentLoop + 1)
      : 1;
    const requestedLoops = Math.max(1, Math.min(parsed.deep_loops, this.store.config.maxLoops));
    const plannedLoops = Math.max(startLoop, requestedLoops);

    runInAction(() => {
      this.store.plannedDeepLoops = plannedLoops;
    });

    const loopModel = this.loopModelToGeminiModel(this.store.config.loopModel);
    await this.switchModel(loopModel);

    runInAction(() => {
      this.store.userWorkflowPhase = 'deep';
      this.store.currentLoop = startLoop;
      this.store.isSummarizing = false;
    });

    const toolsPrompt = this.buildEnabledToolsPrompt();
    const flagsLabel = this.store.config.language === 'en' ? 'AUTO Decision' : 'AUTO 决策';
    const flags = parsed
      ? `「${flagsLabel}」${parsed.summary}（needs_web=${parsed.needs_web} needs_files=${parsed.needs_files} needs_code=${parsed.needs_code}, planned_loops=${plannedLoops}）\n\n`
      : '';

    const mustUseToolHints: string[] = [];
    if (parsed.needs_web && this.store.config.tavilyEnabled) {
      mustUseToolHints.push(
        this.store.config.language === 'en'
          ? '[Requirement] You determined needs_web=true. You MUST explicitly call [TOOL_CALL: web_search({...})] first, then wait for [TOOL_RESULT: web_search] before continuing.'
          : '【强制要求】你已判定 needs_web=true，必须先显式调用一次 [TOOL_CALL: web_search({...})]，拿到 [TOOL_RESULT: web_search] 后再继续分析。'
      );
    }
    if (parsed.needs_files && this.store.config.localFolderEnabled) {
      mustUseToolHints.push(
        this.store.config.language === 'en'
          ? '[Requirement] You determined needs_files=true. You MUST call read_local_file to read local files before concluding.'
          : '【强制要求】你已判定 needs_files=true，必须先调用 read_local_file 获取文件内容后再继续结论。'
      );
    }

    const originalQueryPrefix = this.store.config.language === 'en' ? 'Original User Query:' : '用户原始问题：';
    const block =
      `${originalQueryPrefix}\n${this.store.originalQuestion}\n\n` +
      flags +
      (mustUseToolHints.length ? `${mustUseToolHints.join('\n')}\n\n` : '') +
      this.store.config.systemPromptTemplate +
      '\n\n' +
      toolsPrompt;

    const uiTitlePrefix = this.store.config.language === 'en'
      ? `🧠 ${this.getLoopModelLabel(loopModel)} Deep Think · Planned ${plannedLoops} Loops`
      : `🧠 ${this.getLoopModelLabel(loopModel)} 深度思考 · 计划${plannedLoops}轮`;

    await this.engine.sendPrompt(block, uiTitlePrefix);
  }
}
