import { makeAutoObservable, runInAction, toJS } from 'mobx';
import { DeepThinkConfig, DEFAULT_CONFIG, EnginePhase, AgentMode, getReviewPhases, getSystemPromptTemplate, ClarifyQuestion } from '../types';
import type { ParsedIntent } from '../core/agent-orchestrator';
import { PersistService } from '../services/persist-service';
import i18n from '../i18n';

export class StateStore {
  // === 运行时状态（不持久化） / Runtime State (Not Persisted) ===
  agentMode: AgentMode = 'off';
  isGenerating = false;
  currentLoop = 0;
  userAborted = false;
  originalQuestion = '';
  isSummarizing = false;
  lastRawText = '';
  isPanelOpen = false;

  /** 全能工作流阶段（意图 / 主深度 / 澄清问卷） / Universal workflow phase (Intent / Deep / Clarify) */
  userWorkflowPhase: 'none' | 'intent' | 'deep' | 'clarify' = 'none';
  lastIntentSummary = '';
  /** 当前用户提问轮内，已连续工具回合次数（防刷） / Consecutive tool call rounds in current user turn (Anti-spam) */
  toolCallRoundsThisSession = 0;
  /** AUTO 模式本轮动态规划的深度轮次（null 表示使用常规配置） / Dynamically planned deep loops for the current round in AUTO mode (null means fallback to default config) */
  plannedDeepLoops: number | null = null;
  /** 当前用户提问轮内，澄清问卷触发次数（防止无限追问） */
  clarifyRoundsThisSession = 0;
  /** 单轮对话内最多允许进入问卷次数（运行时防护） */
  maxClarifyRoundsPerTurn = 2;
  /** 待澄清的问卷问题列表（当 phase === 'clarify' 时有效） */
  clarifyQuestions: ClarifyQuestion[] = [];
  /** 地構存储待处理的 intent 解析结果（问卷提交后续用） */
  pendingIntent: ParsedIntent | null = null;

  // === 用户配置（持久化） / User Config (Persisted) ===
  config: DeepThinkConfig = { ...DEFAULT_CONFIG };

  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  get enginePhase(): EnginePhase {
    if (!this.isAgentEnabled) return 'idle';
    if (this.isSummarizing) return 'summarizing';
    if (this.userWorkflowPhase === 'clarify') return 'clarifying';
    if (this.currentLoop > 0) return 'thinking';
    return 'waiting';
  }

  get isAgentEnabled(): boolean {
    return this.agentMode !== 'off';
  }

  setAgentMode(mode: 'auto' | 'on' | 'off'): void {
    this.agentMode = mode;
    void PersistService.saveAgentMode(mode);
    if (mode === 'off') {
      if (this.config.tavilyEnabled) {
        this.config = { ...this.config, tavilyEnabled: false };
        this.debouncedPersist();
      }
      this.resetState();
    }
  }

  toggleAgent(force?: boolean): void {
    let targetMode: AgentMode;
    if (force === true) {
      targetMode = 'auto'; // Default to auto when forced on
    } else if (force === false) {
      targetMode = 'off';
    } else {
      // Toggle logic: off -> auto -> off
      targetMode = this.agentMode === 'off' ? 'auto' : 'off';
    }
    this.setAgentMode(targetMode);
  }

  setGenerating(value: boolean): void {
    this.isGenerating = value;
  }

  incrementLoop(): void {
    this.currentLoop++;
  }

  resetState(): void {
    this.currentLoop = 0;
    this.userAborted = false;
    this.isSummarizing = false;
    this.lastRawText = '';
    this.originalQuestion = '';
    this.userWorkflowPhase = 'none';
    this.lastIntentSummary = '';
    this.toolCallRoundsThisSession = 0;
    this.plannedDeepLoops = null;
    this.clarifyRoundsThisSession = 0;
    this.clarifyQuestions = [];
    this.pendingIntent = null;
  }

  tryEnterClarifyRound(): boolean {
    if (this.clarifyRoundsThisSession >= this.maxClarifyRoundsPerTurn) {
      return false;
    }
    this.clarifyRoundsThisSession += 1;
    return true;
  }

  updateConfig(partial: Partial<DeepThinkConfig>): void {
    // 范围校验 / Range Validation
    if (partial.maxLoops !== undefined) {
      partial.maxLoops = Math.max(1, partial.maxLoops);
    }
    if (partial.minLoops !== undefined) {
      partial.minLoops = Math.max(1, partial.minLoops);
    }
    if (partial.loopDelay !== undefined) {
      partial.loopDelay = Math.max(0, partial.loopDelay);
    }
    if (partial.maxToolRoundsPerTurn !== undefined) {
      partial.maxToolRoundsPerTurn = Math.max(1, Math.min(50, partial.maxToolRoundsPerTurn));
    }
    // 将 partial 中可能含有的 observable 代理剥离为纯 JS 对象 / Strip observable proxies from partial into a plain JS object
    const plainPartial = toJS(partial);
    const newConfig = { ...toJS(this.config), ...plainPartial };
    // minLoops 不能超过 maxLoops / minLoops cannot exceed maxLoops
    if (newConfig.minLoops > newConfig.maxLoops) {
      newConfig.minLoops = newConfig.maxLoops;
    }
    if (newConfig.language !== this.config.language) {
      // 当语言切换时，如果系统设置是当前语言的默认值（未被用户修改），则自动切换到新语言的默认值
      // When language switches, if the system config is at the default value of the old language, automatically switch it to the default of the new language
      if (this.config.reviewPhases.join('\n') === getReviewPhases(this.config.language).join('\n')) {
        newConfig.reviewPhases = getReviewPhases(newConfig.language);
      }
      if (this.config.systemPromptTemplate === getSystemPromptTemplate(this.config.language, this.config.markers)) {
        newConfig.systemPromptTemplate = getSystemPromptTemplate(newConfig.language, newConfig.markers);
      }
      i18n.changeLanguage(newConfig.language);
    }
    this.config = newConfig;
    this.debouncedPersist();
  }

  async loadConfig(): Promise<void> {
    const [saved, savedMode] = await Promise.all([
      PersistService.load(),
      PersistService.loadAgentMode(),
    ]);
    runInAction(() => {
      if (savedMode) {
        this.agentMode = savedMode;
      }

      if (!saved) {
        this.config = { ...DEFAULT_CONFIG };
        if (this.agentMode === 'off') {
          this.config.tavilyEnabled = false;
        }
        return;
      }
      // 与默认值深度合并，防止旧存档缺字段或字段类型错误 / Deep merge with defaults to prevent missing fields or wrong types in old saves
      this.config = {
        ...DEFAULT_CONFIG,
        ...saved,
        loopModel: ['fast', 'think', 'pro'].includes(saved.loopModel as string) ? saved.loopModel : DEFAULT_CONFIG.loopModel,
        reviewPhases: Array.isArray(saved.reviewPhases)
          ? saved.reviewPhases
          : DEFAULT_CONFIG.reviewPhases,
        markers: { ...DEFAULT_CONFIG.markers, ...(saved.markers ?? {}) },
        tavilyApiKey: typeof saved.tavilyApiKey === 'string' ? saved.tavilyApiKey : DEFAULT_CONFIG.tavilyApiKey,
        tavilyEnabled: typeof saved.tavilyEnabled === 'boolean' ? saved.tavilyEnabled : DEFAULT_CONFIG.tavilyEnabled,
        localFolderEnabled: typeof saved.localFolderEnabled === 'boolean' ? saved.localFolderEnabled : DEFAULT_CONFIG.localFolderEnabled,
        // 显式校验 pinnedMemories — 确保结构正确 / Explicitly validate pinnedMemories - Ensure structure is correct
        pinnedMemories: Array.isArray(saved.pinnedMemories)
          ? saved.pinnedMemories.map((m: Record<string, unknown>) => ({
            id: typeof m.id === 'string' ? m.id : String(Date.now()),
            title: typeof m.title === 'string' ? m.title : '',
            content: typeof m.content === 'string' ? m.content : '',
            enabled: typeof m.enabled === 'boolean' ? m.enabled : true,
          }))
          : DEFAULT_CONFIG.pinnedMemories,
        // 显式校验 systemPromptTemplate / Explicitly validate systemPromptTemplate
        systemPromptTemplate: typeof saved.systemPromptTemplate === 'string' && saved.systemPromptTemplate.trim()
          ? saved.systemPromptTemplate
          : DEFAULT_CONFIG.systemPromptTemplate,
        maxToolRoundsPerTurn:
          typeof saved.maxToolRoundsPerTurn === 'number'
            ? saved.maxToolRoundsPerTurn
            : DEFAULT_CONFIG.maxToolRoundsPerTurn,
        language: ['zh', 'en'].includes(saved.language as string) ? saved.language : DEFAULT_CONFIG.language,
        siteEnabled: (saved.siteEnabled && typeof saved.siteEnabled === 'object')
          ? { ...DEFAULT_CONFIG.siteEnabled, ...saved.siteEnabled }
          : { ...DEFAULT_CONFIG.siteEnabled },
      };

      if (this.agentMode === 'off' && this.config.tavilyEnabled) {
        this.config = { ...this.config, tavilyEnabled: false };
      }

      i18n.changeLanguage(this.config.language);
    });
  }

  private debouncedPersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      // toJS 剥离 MobX proxy，确保 chrome.storage.local 能正确序列化 / toJS strips MobX proxy, ensuring chrome.storage.local serializes correctly
      PersistService.save(toJS(this.config));
    }, 500);
  }

  /** 立即持久化（用于关键字段变更如记忆编辑等，防止刷新丢失） / Immediate persist (used for critical changes like memory edits to prevent loss on refresh) */
  flushPersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    PersistService.save(toJS(this.config));
  }
}
