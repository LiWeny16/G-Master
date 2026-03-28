import { runInAction } from 'mobx';
import { GeminiModelId, ISiteAdapter } from '../adapters/site-adapter';
import { invokeBackground } from '../services/message-bus';
import { StateStore } from '../stores/state-store';
import { ParsedMarkers } from '../types';
import { parseToolCalls } from './tool-call-parser';
import { parseClarifyBlock, extractTaggedPayload, NEXT_PROMPT_TAG } from './parsers';

export class DeepThinkEngine {
  constructor(
    private adapter: ISiteAdapter,
    private store: StateStore,
  ) { }

  // === 解析 Action Markers ===
  parseActionMarkers(text: string): ParsedMarkers {
    const { markers } = this.store.config;
    const hasContinue = text.includes(markers.continueMarker) || text.includes('[ACTION: THINK_MORE]');
    const hasFinish = text.includes(markers.finishMarker) || text.includes('[ACTION: GOAL_REACHED]');
    
    // 优先尝试使用标准统一的格式 [NEXT_PROMPT]...[NEXT_PROMPT]
    let nextPrompt = extractTaggedPayload(text, NEXT_PROMPT_TAG);

    if (!nextPrompt) {
      // 回退：尝试从自适应/旧的正则匹配
      const re = new RegExp(markers.nextPromptPattern);
      const m = text.match(re);
      if (m && m[1]) {
        nextPrompt = m[1].trim();
      } else {
        // 再硬回退：旧版硬编码模式
        const oldRe = /\[NEXT_PROMPT:\s*([\s\S]*?)\]/;
        const m2 = text.match(oldRe);
        if (m2 && m2[1]) {
          nextPrompt = m2[1].trim();
        }
      }
    }
    
    return { hasContinue, hasFinish, nextPrompt: nextPrompt ?? null };
  }

  // === 获取当前轮次对应的审查视角 ===
  getReviewPhase(): string {
    const phases = this.store.config.reviewPhases;
    const idx = (this.store.currentLoop - 2) % phases.length;
    return phases[Math.max(0, idx)];
  }

  // === Prompt 构造 ===
  private getEffectiveMinLoops(): number {
    if (this.store.agentMode === 'auto' && this.store.userWorkflowPhase === 'deep') {
      return this.store.plannedDeepLoops ?? this.store.config.minLoops;
    }
    return this.store.config.minLoops;
  }

  private getEffectiveMaxLoops(): number {
    if (this.store.agentMode === 'auto' && this.store.userWorkflowPhase === 'deep') {
      return this.store.plannedDeepLoops ?? this.store.config.maxLoops;
    }
    return this.store.config.maxLoops;
  }

  private getAutoLoopModelForDeepPhase(): GeminiModelId {
    if (this.store.config.loopModel === 'fast') return 'fast';
    if (this.store.config.loopModel === 'think') return 'thinking';
    return 'pro';
  }

  buildReviewPrompt(nextQuestion: string): string {
    const { markers } = this.store.config;
    return (
      `[Self-Review Task]: ${nextQuestion}\n\n` +
      `[Anchor Reminder] All reflections MUST revolve around the original question: "${this.store.originalQuestion}".\n\n` +
      `Be strictly critical of your own reasoning. Provide factual sources and URLs. If you don't know, say so.\n` +
      `You may ONLY output ${markers.finishMarker} to finish if: (a) arguments have evidence, (b) counterarguments have been checked, and (c) edge cases are covered.\n` +
      `Otherwise, you MUST output ${markers.continueMarker} + [NEXT_PROMPT: ...] to continue.`
    );
  }

  buildForceDeepReviewPrompt(reviewPhase: string): string {
    const { markers } = this.store.config;
    const minLoops = this.getEffectiveMinLoops();
    return (
      `[Forced Deep Review]: You concluded too early. The system requires at least ${minLoops} review rounds (currently at round ${this.store.currentLoop}).\n\n` +
      `Mandatory review perspective for this round: ${reviewPhase}\n\n` +
      `[Anchor Reminder] All reflections MUST revolve around the original question: "${this.store.originalQuestion}".\n\n` +
      `After reviewing, if new issues are found, output ${markers.continueMarker} + [NEXT_PROMPT: ...]; if all exit conditions are met, output ${markers.finishMarker}.`
    );
  }

  buildSummaryPrompt(): string {
    return (
      `[Final Summary Command]: Deep thinking has concluded. Review all thoughts and corrections from the original question until now regarding:\n\n` +
      `"${this.store.originalQuestion}"\n\n` +
      `Provide a comprehensive final summary. Requirements:\n` +
      `1. Clear structure, utilizing headings, tables, etc.\n` +
      `2. Consolidate verified core conclusions and exclude overturned errors.\n` +
      `3. Mark uncertain parts explicitly.\n` +
      `4. Include citation sources and links.\n` +
      `5. Provide a direct and complete response to the original question.\n\n` +
      `Output the summary directly, without any additional ACTION markers.`
    );
  }

  buildCorrectionPrompt(): string {
    const { markers } = this.store.config;
    return (
      `[System Warning]: No action markers detected. Please think around the original question "${this.store.originalQuestion}".\n` +
      `You MUST append ${markers.continueMarker} + [NEXT_PROMPT: ...] to continue, or ${markers.finishMarker} to finish at the very end.`
    );
  }

  buildClarifyLimitPrompt(): string {
    const { markers } = this.store.config;
    return this.store.config.language === 'en'
      ? `[System Constraint]: Clarification round limit reached in this user turn. Do NOT output [CLARIFY] anymore.\n` +
        `Proceed with explicit assumptions based on available information and keep reasoning anchored to: "${this.store.originalQuestion}".\n` +
        `You MUST end with either ${markers.continueMarker} + [NEXT_PROMPT: ...] or ${markers.finishMarker}.`
      : `【系统约束】本轮对话的澄清问卷次数已达上限，请不要再输出 [CLARIFY]。\n` +
        `请基于现有信息明确写出你的假设，并围绕原问题继续推理："${this.store.originalQuestion}"。\n` +
        `你的回复末尾必须包含 ${markers.continueMarker} + [NEXT_PROMPT: ...]，或 ${markers.finishMarker}。`;
  }

  // === 发送带 DT 标签的 Prompt ===
  async sendPrompt(text: string, dtLabel?: string): Promise<void> {
    if (this.store.userAborted) return;

    if (
      this.store.agentMode === 'auto' &&
      this.store.userWorkflowPhase === 'deep' &&
      this.adapter.switchGeminiModel
    ) {
      await this.adapter.switchGeminiModel(this.getAutoLoopModelForDeepPhase());
    }

    const finalText = dtLabel ? `⟪DT:${dtLabel}⟫\n${text}` : text;
    await this.adapter.insertTextAndSend(finalText);
  }

  /** 异步：先处理 TOOL_CALL，否则走原有 ACTION 状态机 */
  async evaluateAndActAsync(responseText: string): Promise<void> {
    if (!this.store.isAgentEnabled || this.store.userAborted) return;
    if (!responseText) return;

    if (this.store.isSummarizing) {
      // 总结完成后仅重置本轮运行态，保留用户手动选择的 mode（ON/AUTO）。
      this.store.resetState();
      return;
    }

    // === 检测澄清问卷块（ON 模式中 DeepThinkEngine 也可能产生 [CLARIFY]）===
    const clarifyQuestions = parseClarifyBlock(responseText);
    if (clarifyQuestions && clarifyQuestions.length > 0) {
      if (!this.store.tryEnterClarifyRound()) {
        this.store.incrementLoop();
        if (this.store.currentLoop > this.getEffectiveMaxLoops()) {
          runInAction(() => {
            this.store.isSummarizing = true;
          });
          const sumLabelMax = this.store.config.language === 'en' ? '📋 Generate Final Summary (Limit Reached)' : '📋 生成最终总结（达到上限）';
          await this.sendPrompt(this.buildSummaryPrompt(), sumLabelMax);
          return;
        }
        const limitLabel = this.store.config.language === 'en' ? '⚠️ Clarify Limit Reached' : '⚠️ 澄清次数达到上限';
        await this.sendPrompt(this.buildClarifyLimitPrompt(), limitLabel);
        return;
      }

      runInAction(() => {
        this.store.currentLoop = Math.max(1, this.store.currentLoop);
        this.store.userWorkflowPhase = 'clarify';
        this.store.clarifyQuestions = clarifyQuestions;
      });
      return;
    }

    const toolCalls = parseToolCalls(responseText);
    if (toolCalls.length > 0) {
      if (this.store.toolCallRoundsThisSession >= this.store.config.maxToolRoundsPerTurn) {
        const warnMsg = this.store.config.language === 'en'
          ? `[System] Tool call limit reached for this round (${this.store.config.maxToolRoundsPerTurn}). Please answer directly using existing information without outputting TOOL_CALL.`
          : `[系统] 本轮工具调用次数已达上限（${this.store.config.maxToolRoundsPerTurn}）。请直接用已有信息作答，勿再输出 TOOL_CALL。`;
        const warnLabel = this.store.config.language === 'en' ? '⚠️ Tool Limit' : '⚠️ 工具上限';
        await this.sendPrompt(warnMsg, warnLabel);
        return;
      }
      runInAction(() => {
        this.store.toolCallRoundsThisSession++;
      });
      await this.executeToolCallsAndFollowUp(toolCalls);
      return;
    }

    this.evaluateMarkersOnly(responseText);
  }

  private async executeToolCallsAndFollowUp(
    toolCalls: Array<{ name: string; args: Record<string, unknown> }>,
  ): Promise<void> {
    const lines: string[] = [];
    const key = this.store.config.tavilyApiKey.trim();

    for (const tc of toolCalls) {
      if (tc.name === 'web_search' && !this.store.config.tavilyEnabled) {
        lines.push('[TOOL_RESULT: web_search]\n{"error":"Web search is disabled"}');
        continue;
      }
      if ((tc.name === 'read_local_file' || tc.name === 'write_local_file') && !this.store.config.localFolderEnabled) {
        lines.push(`[TOOL_RESULT: ${tc.name}]\n{"error":"Local folder access is disabled"}`);
        continue;
      }

      const res = await invokeBackground({
        type: 'EXECUTE_TOOL',
        tool: tc.name,
        args: tc.args,
        tavilyApiKey: this.store.config.tavilyEnabled ? key || undefined : undefined,
      });
      if (res.ok) {
        lines.push(`[TOOL_RESULT: ${tc.name}]\n${JSON.stringify(res.result)}`);
      } else {
        lines.push(`[TOOL_RESULT: ${tc.name}]\n{"error":${JSON.stringify(res.error)}}`);
      }
    }

    const payloadMsg = this.store.config.language === 'en'
      ? `The following are the tool results from the host. Please continue based on these (you may output [TOOL_CALL: ...] again or continue thinking and outputting ACTIONs):\n\n`
      : `以下为宿主工具返回，请据此继续（可再次输出 [TOOL_CALL: ...] 或按深度思考规则输出 ACTION）：\n\n`;
    const payload = payloadMsg + lines.join('\n\n');
    const payloadLabel = this.store.config.language === 'en' ? '🔧 Tool Result' : '🔧 工具结果';
    await this.sendPrompt(payload, payloadLabel);
  }

  private evaluateMarkersOnly(responseText: string): void {
    const parsed = this.parseActionMarkers(responseText);

    if (parsed.hasContinue) {
      this.store.incrementLoop();
      if (this.store.currentLoop > this.getEffectiveMaxLoops()) {
        runInAction(() => {
          this.store.isSummarizing = true;
        });
        const sumLabelMax = this.store.config.language === 'en' ? '📋 Generate Final Summary (Limit Reached)' : '📋 生成最终总结（达到上限）';
        this.sendPrompt(this.buildSummaryPrompt(), sumLabelMax);
        return;
      }
      const next = parsed.nextPrompt ?? this.getReviewPhase();
      const reviewLabel = this.store.config.language === 'en'
        ? `🔄 Loop ${this.store.currentLoop} · Self-Review`
        : `🔄 第${this.store.currentLoop}轮 · 自我审查`;
      this.sendPrompt(this.buildReviewPrompt(next), reviewLabel);
    } else if (parsed.hasFinish) {
      if (this.store.currentLoop < this.getEffectiveMinLoops()) {
        this.store.incrementLoop();
        const phase = this.getReviewPhase();
        const forceLabel = this.store.config.language === 'en'
          ? `🔍 Loop ${this.store.currentLoop} · Forced Deepening`
          : `🔍 第${this.store.currentLoop}轮 · 强制深化`;
        this.sendPrompt(this.buildForceDeepReviewPrompt(phase), forceLabel);
        return;
      }
      runInAction(() => {
        this.store.isSummarizing = true;
      });
      const sumLabel = this.store.config.language === 'en' ? '📋 Generate Final Summary' : '📋 生成最终总结';
      this.sendPrompt(this.buildSummaryPrompt(), sumLabel);
    } else {
      this.store.incrementLoop();
      if (this.store.currentLoop > this.getEffectiveMaxLoops()) {
        runInAction(() => {
          this.store.isSummarizing = true;
        });
        const sumLabelMax = this.store.config.language === 'en' ? '📋 Generate Final Summary (Limit Reached)' : '📋 生成最终总结（达到上限）';
        this.sendPrompt(this.buildSummaryPrompt(), sumLabelMax);
        return;
      }
      const corrLabel = this.store.config.language === 'en' ? '⚠️ System Correction' : '⚠️ 系统纠偏';
      this.sendPrompt(this.buildCorrectionPrompt(), corrLabel);
    }
  }

  /** @deprecated 同步入口保留给旧调用方；请用 evaluateAndActAsync */
  evaluateAndAct(responseText: string): void {
    void this.evaluateAndActAsync(responseText);
  }

  // === 拦截首次发送 ===
  interceptFirstSend(userText: string): string | null {
    if (!this.store.isAgentEnabled || this.store.currentLoop > 0) return null;
    if (!userText.trim()) return null;

    runInAction(() => {
      this.store.originalQuestion = userText.trim();
      this.store.currentLoop = 1;
      this.store.userAborted = false;
      this.store.isSummarizing = false;
      this.store.userWorkflowPhase = 'deep';
      this.store.toolCallRoundsThisSession = 0;
      this.store.plannedDeepLoops = null;
    });

    let systemPrompt = this.store.config.systemPromptTemplate;
    const activeMemories = this.store.config.pinnedMemories?.filter(m => m.enabled && m.content.trim()) || [];
    if (activeMemories.length > 0) {
      const defaultTitle = this.store.config.language === 'en' ? 'Memory' : '记忆';
      const memoriesText = activeMemories.map(m => `[${m.title || defaultTitle}]: ${m.content}`).join('\n\n');
      const memoryHeader = this.store.config.language === 'en' ? '[User Pinned Memories & Presets]' : '【用户设定的全局记忆与预设 Prompt】';
      systemPrompt = `\n\n${memoryHeader}:\n${memoriesText}\n\n` + systemPrompt;
    }

    return userText + systemPrompt;
  }

  // === 中止 ===
  abort(): void {
    runInAction(() => {
      this.store.userAborted = true;
    });
    this.store.resetState();
  }
}
