import { makeAutoObservable, runInAction } from 'mobx';
import { DeepThinkConfig, DEFAULT_CONFIG, EnginePhase, AgentMode } from '../types';
import { PersistService } from '../services/persist-service';

export class StateStore {
  // === 运行时状态（不持久化） ===
  agentMode: AgentMode = 'off';
  isGenerating = false;
  currentLoop = 0;
  userAborted = false;
  originalQuestion = '';
  isSummarizing = false;
  lastRawText = '';
  isPanelOpen = false;

  /** 全能工作流阶段（意图 / 主深度） */
  userWorkflowPhase: 'none' | 'intent' | 'deep' = 'none';
  lastIntentSummary = '';
  /** 当前用户提问轮内，已连续工具回合次数（防刷） */
  toolCallRoundsThisSession = 0;
  /** AUTO 模式本轮动态规划的深度轮次（null 表示使用常规配置） */
  plannedDeepLoops: number | null = null;

  // === 用户配置（持久化） ===
  config: DeepThinkConfig = { ...DEFAULT_CONFIG };

  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  get enginePhase(): EnginePhase {
    if (!this.isAgentEnabled) return 'idle';
    if (this.isSummarizing) return 'summarizing';
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
  }

  updateConfig(partial: Partial<DeepThinkConfig>): void {
    // 范围校验
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
    // minLoops 不能超过 maxLoops
    const newConfig = { ...this.config, ...partial };
    if (newConfig.minLoops > newConfig.maxLoops) {
      newConfig.minLoops = newConfig.maxLoops;
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
      // 与默认值深度合并，防止旧存档缺字段或字段类型错误
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
        maxToolRoundsPerTurn:
          typeof saved.maxToolRoundsPerTurn === 'number'
            ? saved.maxToolRoundsPerTurn
            : DEFAULT_CONFIG.maxToolRoundsPerTurn,
      };

      if (this.agentMode === 'off' && this.config.tavilyEnabled) {
        this.config = { ...this.config, tavilyEnabled: false };
      }
    });
  }

  private debouncedPersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      PersistService.save(this.config);
    }, 500);
  }
}
