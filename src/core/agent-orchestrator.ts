import type { GeminiModelId, ISiteAdapter } from '../adapters/site-adapter';
import { buildToolsSystemPrompt, allSkills } from '../skills/index';
import { INTENT_SYSTEM_PROMPT } from './intent-prompt';
import { DeepThinkEngine } from './deep-think-engine';
import type { StateStore } from '../stores/state-store';
import type { LoopModel } from '../types';

export type UserWorkflowPhase = 'none' | 'intent' | 'deep';

export interface ParsedIntent {
  route: 'direct' | 'deep';
  deep_loops: number;
  needs_web: boolean;
  needs_files: boolean;
  needs_code: boolean;
  summary: string;
}

function normalizeLoopCount(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return 3;
  return Math.max(1, Math.min(12, Math.round(n)));
}

/** 从模型回复中提取一行 JSON 意图结果 */
export function parseIntentJson(text: string): ParsedIntent | null {
  const cleaned = text.replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1');
  const lines = cleaned.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line.includes('{') || !line.includes('}')) continue;
    try {
      const raw: unknown = JSON.parse(line);
      if (raw === null || typeof raw !== 'object') continue;
      const o = raw as Record<string, unknown>;
      const routeRaw = typeof o.route === 'string' ? o.route.trim().toLowerCase() : '';
      const route: 'direct' | 'deep' = routeRaw === 'deep' ? 'deep' : 'direct';
      return {
        route,
        deep_loops: normalizeLoopCount(o.deep_loops),
        needs_web: Boolean(o.needs_web),
        needs_files: Boolean(o.needs_files),
        needs_code: Boolean(o.needs_code),
        summary: typeof o.summary === 'string' ? o.summary : '',
      };
    } catch {
      /* try previous line */
    }
  }
  return null;
}

/**
 * 全能 Agent：快速模型意图 →（进入深度后由 DeepThinkEngine 处理 TOOL_CALL）→ Pro 主任务。
 */
export class AgentOrchestrator {
  constructor(
    private adapter: ISiteAdapter,
    private store: StateStore,
    private engine: DeepThinkEngine,
  ) {}

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
      return '【工具调用】当前未启用任何工具，请勿输出 TOOL_CALL。';
    }

    return buildToolsSystemPrompt(enabledSkills);
  }

  /** 用户首次发送后：切到「快速」并发意图分类提示（不含深度思考模板）。 */
  async beginIntentPhase(userPlainText: string): Promise<void> {
    const t = userPlainText.trim();
    if (!t) return;

    this.store.userWorkflowPhase = 'intent';
    this.store.originalQuestion = t;
    this.store.currentLoop = 0;
    this.store.userAborted = false;
    this.store.isSummarizing = false;
    this.store.toolCallRoundsThisSession = 0;
    this.store.plannedDeepLoops = null;

    await this.switchModel('fast');
    const body = `[G-Master AUTO 决策]\n${INTENT_SYSTEM_PROMPT}\n\n用户消息：\n${t}`;
    await this.adapter.insertTextAndSend(body);
  }

  /** 意图回复完成后：direct 直接结束；deep 切配置模型并发起循环。 */
  async finishIntentAndStartDeep(intentResponseText: string): Promise<void> {
    if (!this.store.isAgentEnabled || this.store.userAborted) return;
    if (this.store.userWorkflowPhase !== 'intent') return;

    const parsed = parseIntentJson(intentResponseText);
    if (!parsed) {
      // 解析失败时不强行进入深度，避免打断 FAST 的直接回答。
      this.store.userWorkflowPhase = 'none';
      this.store.currentLoop = 0;
      this.store.plannedDeepLoops = null;
      return;
    }

    this.store.lastIntentSummary = parsed?.summary ?? '';

    const forceDeepByToolNeed =
      (parsed.needs_web && this.store.config.tavilyEnabled) ||
      (parsed.needs_files && this.store.config.localFolderEnabled);

    if (parsed.route === 'direct' && !forceDeepByToolNeed) {
      // simple 问题直接由 FAST 回答，不进入 LOOP。
      this.store.userWorkflowPhase = 'none';
      this.store.currentLoop = 0;
      this.store.isSummarizing = false;
      this.store.toolCallRoundsThisSession = 0;
      this.store.plannedDeepLoops = null;
      return;
    }

    const plannedLoops = Math.max(1, Math.min(parsed.deep_loops, this.store.config.maxLoops));
    this.store.plannedDeepLoops = plannedLoops;

    const loopModel = this.loopModelToGeminiModel(this.store.config.loopModel);
    await this.switchModel(loopModel);

    this.store.userWorkflowPhase = 'deep';
    this.store.currentLoop = 1;
    this.store.isSummarizing = false;

    const toolsPrompt = this.buildEnabledToolsPrompt();
    const flags = parsed
      ? `「AUTO 决策」${parsed.summary}（needs_web=${parsed.needs_web} needs_files=${parsed.needs_files} needs_code=${parsed.needs_code}，planned_loops=${plannedLoops}）\n\n`
      : '';

    const mustUseToolHints: string[] = [];
    if (parsed.needs_web && this.store.config.tavilyEnabled) {
      mustUseToolHints.push(
        '【强制要求】你已判定 needs_web=true，必须先显式调用一次 [TOOL_CALL: web_search({...})]，拿到 [TOOL_RESULT: web_search] 后再继续分析。',
      );
    }
    if (parsed.needs_files && this.store.config.localFolderEnabled) {
      mustUseToolHints.push(
        '【强制要求】你已判定 needs_files=true，必须先调用 read_local_file 获取文件内容后再继续结论。',
      );
    }

    const block =
      `用户原始问题：\n${this.store.originalQuestion}\n\n` +
      flags +
      (mustUseToolHints.length ? `${mustUseToolHints.join('\n')}\n\n` : '') +
      this.store.config.systemPromptTemplate +
      '\n\n' +
      toolsPrompt;

    await this.engine.sendPrompt(
      block,
      `🧠 ${this.getLoopModelLabel(loopModel)} 深度思考 · 计划${plannedLoops}轮`,
    );
  }
}
