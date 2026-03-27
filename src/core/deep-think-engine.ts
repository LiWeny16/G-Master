import { GeminiModelId, ISiteAdapter } from '../adapters/site-adapter';
import { invokeBackground } from '../services/message-bus';
import { StateStore } from '../stores/state-store';
import { ParsedMarkers } from '../types';
import { parseToolCalls } from './tool-call-parser';

export class DeepThinkEngine {
  constructor(
    private adapter: ISiteAdapter,
    private store: StateStore,
  ) {}

  // === 解析 Action Markers ===
  parseActionMarkers(text: string): ParsedMarkers {
    const { markers } = this.store.config;
    const hasContinue = text.includes(markers.continueMarker);
    const hasFinish = text.includes(markers.finishMarker);
    const re = new RegExp(markers.nextPromptPattern);
    const m = text.match(re);
    return { hasContinue, hasFinish, nextPrompt: m?.[1]?.trim() ?? null };
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
      `[自我审查任务]：${nextQuestion}\n\n` +
      `【锚定提醒】所有反思必须围绕原始问题「${this.store.originalQuestion}」展开。\n\n` +
      `请严苛自我挑刺与修正。补充事实来源和URL。不懂就说不懂。\n` +
      `只有同时满足：(a)论点有依据 (b)反驳角度已检验 (c)边界情况已覆盖，才可输出 ${markers.finishMarker} 结束。\n` +
      `否则输出 ${markers.continueMarker} + [NEXT_PROMPT: ...] 继续。`
    );
  }

  buildForceDeepReviewPrompt(reviewPhase: string): string {
    const { markers } = this.store.config;
    const minLoops = this.getEffectiveMinLoops();
    return (
      `[强制深化审查]：你过早得出结论，系统要求至少完成 ${minLoops} 轮审查（当前第 ${this.store.currentLoop} 轮）。\n\n` +
      `本轮强制审查视角：${reviewPhase}\n\n` +
      `【锚定提醒】所有反思必须围绕原始问题「${this.store.originalQuestion}」展开。\n\n` +
      `完成后，若发现新问题输出 ${markers.continueMarker} + [NEXT_PROMPT: ...]；若已满足全部结束条件则输出 ${markers.finishMarker}。`
    );
  }

  buildSummaryPrompt(): string {
    return (
      `[最终总结指令]：深度思考已结束。回顾从原始问题到现在的全部思考与修正，针对：\n\n` +
      `「${this.store.originalQuestion}」\n\n` +
      `给出全面最终总结。要求：\n` +
      `1. 结构清晰，善用标题、表格等排版。\n` +
      `2. 整合已验证的核心结论，剔除已推翻的错误。\n` +
      `3. 标注不确定部分。\n` +
      `4. 附上引用来源和链接。\n` +
      `5. 直接完整回应原始问题。\n\n` +
      `直接输出总结，无需附加任何 ACTION 标记。`
    );
  }

  buildCorrectionPrompt(): string {
    const { markers } = this.store.config;
    return (
      `[系统警告]：未检测到动作标记。请围绕原始问题「${this.store.originalQuestion}」思考。\n` +
      `必须在末尾加上 ${markers.continueMarker} + [NEXT_PROMPT: ...] 继续，或 ${markers.finishMarker} 结束。`
    );
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

    const toolCalls = parseToolCalls(responseText);
    if (toolCalls.length > 0) {
      if (this.store.toolCallRoundsThisSession >= this.store.config.maxToolRoundsPerTurn) {
        await this.sendPrompt(
          `[系统] 本轮工具调用次数已达上限（${this.store.config.maxToolRoundsPerTurn}）。请直接用已有信息作答，勿再输出 TOOL_CALL。`,
          '⚠️ 工具上限',
        );
        return;
      }
      this.store.toolCallRoundsThisSession++;
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
        lines.push('[TOOL_RESULT: web_search]\n{"error":"Tavily 搜索开关已关闭"}');
        continue;
      }
      if ((tc.name === 'read_local_file' || tc.name === 'write_local_file') && !this.store.config.localFolderEnabled) {
        lines.push(`[TOOL_RESULT: ${tc.name}]\n{"error":"文件夹读取开关已关闭"}`);
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

    const payload =
      `以下为宿主工具返回，请据此继续（可再次输出 [TOOL_CALL: ...] 或按深度思考规则输出 ACTION）：\n\n` +
      lines.join('\n\n');
    await this.sendPrompt(payload, '🔧 工具结果');
  }

  private evaluateMarkersOnly(responseText: string): void {
    const parsed = this.parseActionMarkers(responseText);

    if (parsed.hasContinue) {
      this.store.incrementLoop();
      if (this.store.currentLoop > this.getEffectiveMaxLoops()) {
        this.store.isSummarizing = true;
        this.sendPrompt(this.buildSummaryPrompt(), '📋 生成最终总结（达到上限）');
        return;
      }
      const next = parsed.nextPrompt ?? this.getReviewPhase();
      this.sendPrompt(
        this.buildReviewPrompt(next),
        `🔄 第${this.store.currentLoop}轮 · 自我审查`,
      );
    } else if (parsed.hasFinish) {
      if (this.store.currentLoop < this.getEffectiveMinLoops()) {
        this.store.incrementLoop();
        const phase = this.getReviewPhase();
        this.sendPrompt(
          this.buildForceDeepReviewPrompt(phase),
          `🔍 第${this.store.currentLoop}轮 · 强制深化`,
        );
        return;
      }
      this.store.isSummarizing = true;
      this.sendPrompt(this.buildSummaryPrompt(), '📋 生成最终总结');
    } else {
      this.sendPrompt(this.buildCorrectionPrompt(), '⚠️ 系统纠偏');
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

    this.store.originalQuestion = userText.trim();
    this.store.currentLoop = 1;
    this.store.userAborted = false;
    this.store.isSummarizing = false;
    this.store.userWorkflowPhase = 'deep';
    this.store.toolCallRoundsThisSession = 0;
    this.store.plannedDeepLoops = null;

    return userText + this.store.config.systemPromptTemplate;
  }

  // === 中止 ===
  abort(): void {
    this.store.userAborted = true;
    this.store.setAgentMode('off');
    this.store.resetState();
  }
}
