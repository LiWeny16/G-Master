import { ISiteAdapter } from '../adapters/site-adapter';
import { StateStore } from '../stores/state-store';
import type { AgentOrchestrator } from './agent-orchestrator';
import { DeepThinkEngine } from './deep-think-engine';
import { DOMBeautifier } from './dom-beautifier';

export class DOMObserver {
  private observer: MutationObserver | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private intentHandoffInProgress = false;
  private observedExtraTargets = new WeakSet<Node>();

  // Watchdog variables
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private lastObservedTextLength: number = 0;
  private watchdogIdleTicks: number = 0;
  private readonly WATCHDOG_ENABLED = false;
  // Maximum idle time: 6 seconds (3 ticks of 2 seconds)
  private readonly MAX_IDLE_TICKS = 3;

  constructor(
    private adapter: ISiteAdapter,
    private store: StateStore,
    private engine: DeepThinkEngine,
    private beautifier: DOMBeautifier,
    private onReinjectUI: () => void,
    private orchestrator: AgentOrchestrator,
  ) { }

  start(): void {
    const { target, options } = this.adapter.getObserverConfig();
    this.observer = new MutationObserver((mutations) => {
      this.handleMutations(mutations);
      // 每次有 mutation 时尝试补登记尚未就绪的额外目标（shadow root 可能还未就绪）
      this.tryRegisterExtraTargets(options);
    });
    this.observer.observe(target, options);
    // 立即尝试一次
    this.tryRegisterExtraTargets(options);
    // 延迟再尝试，应对 shadow root 延迟初始化
    setTimeout(() => this.tryRegisterExtraTargets(options), 1500);

    // Watchdog is temporarily disabled to avoid timeout-based forced stop.
    if (this.WATCHDOG_ENABLED) {
      this.watchdogTimer = setInterval(() => this.checkStagnation(), 2000);
    }
  }

  /** 尝试将适配器提供的额外 shadow root 节点加入 MutationObserver */
  private tryRegisterExtraTargets(options: MutationObserverInit): void {
    if (!this.observer) return;
    const extras = this.adapter.extraObserverTargets?.() ?? [];
    for (const extra of extras) {
      if (!this.observedExtraTargets.has(extra)) {
        try {
          this.observer.observe(extra, options);
          this.observedExtraTargets.add(extra);
        } catch (_e) { /* shadow root 可能尚未就绪 */ }
      }
    }
  }

  stop(): void {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    this.observer?.disconnect();
    this.observer = null;
    this.observedExtraTargets = new WeakSet<Node>();
  }

  private checkStagnation(): void {
    if (!this.WATCHDOG_ENABLED) return;

    if (!this.store.isGenerating) {
      this.watchdogIdleTicks = 0;
      this.lastObservedTextLength = 0;
      return;
    }

    const currentText = this.adapter.getLastResponseText();
    const currentLength = currentText.length;

    // 如果文本长度和两秒前一样，累加闲置时间
    if (currentLength === this.lastObservedTextLength) {
      this.watchdogIdleTicks++;
    } else {
      // 文本有更新，重置闲置计时器并记录新长度
      this.watchdogIdleTicks = 0;
      this.lastObservedTextLength = currentLength;
    }

    // 当闲置时间达到限制时，触发强制中断并执行下一轮
    if (this.watchdogIdleTicks >= this.MAX_IDLE_TICKS) {
      console.warn('[DeepThink Watchdog] Generation stalled for too long. Forcing interrupt...');

      // 程序触发 stop（与用户手动 stop 区分）
      if (this.adapter.stopGeneration) {
        this.adapter.stopGeneration();
      } else {
        const btn = this.adapter.getSendButton();
        if (btn && btn.classList.contains('stop')) {
          btn.click();
        }
      }

      this.store.setGenerating(false);
      this.store.lastRawText = currentText;
      this.beautifier.process();

      if (this.store.isAgentEnabled && !this.store.userAborted) {
        if (this.store.userWorkflowPhase === 'intent') {
          this.startIntentHandoff(this.store.lastRawText);
        } else if (this.store.userWorkflowPhase === 'clarify') {
          // Do nothing: waiting for user to answer
        } else if (this.store.currentLoop > 0 || this.store.isSummarizing) {
          void this.engine.evaluateAndActAsync(this.store.lastRawText);
        }
      }

      this.watchdogIdleTicks = 0;
    }
  }

  private handleMutations(mutations: MutationRecord[]): void {
    let wasGenerating = this.store.isGenerating;
    let shouldCheckUI = false;

    for (const mutation of mutations) {
      if (this.adapter.isGenerationComplete(mutation) && wasGenerating) {
        this.store.setGenerating(false);
        this.store.lastRawText = this.adapter.getLastResponseText();
        this.beautifier.process();
        // 若 beautifier 正忙（domBusy），则延迟重试一次确保 DOM 清理执行
        if (this.beautifier.isDomBusy()) {
          setTimeout(() => { this.beautifier.process(); }, 150);
        }
        if (this.store.isAgentEnabled && !this.store.userAborted) {
          if (this.store.userWorkflowPhase === 'intent') {
            this.startIntentHandoff(this.store.lastRawText, this.store.config.loopDelay);
          } else if (this.store.userWorkflowPhase === 'clarify') {
            // Do nothing: waiting for user to answer the questionnaire
          } else if (this.store.currentLoop > 0 || this.store.isSummarizing) {
            setTimeout(() => {
              void this.engine.evaluateAndActAsync(this.store.lastRawText);
            }, this.store.config.loopDelay);
          }
        }
        wasGenerating = false;
      } else if (this.adapter.isGenerationStarted(mutation) && !this.store.isGenerating) {
        this.store.setGenerating(true);
        wasGenerating = true;
        // 同一 mutation record 里同时包含 start + complete（如 Zhipu 整块渲染场景）
        if (this.adapter.isGenerationComplete(mutation)) {
          this.store.setGenerating(false);
          this.store.lastRawText = this.adapter.getLastResponseText();
          this.beautifier.process();
          if (this.beautifier.isDomBusy()) {
            setTimeout(() => { this.beautifier.process(); }, 150);
          }
          if (this.store.isAgentEnabled && !this.store.userAborted) {
            if (this.store.userWorkflowPhase === 'intent') {
              this.startIntentHandoff(this.store.lastRawText, this.store.config.loopDelay);
            } else if (this.store.userWorkflowPhase === 'clarify') {
              // Do nothing: waiting for user to answer the questionnaire
            } else if (this.store.currentLoop > 0 || this.store.isSummarizing) {
              setTimeout(() => {
                void this.engine.evaluateAndActAsync(this.store.lastRawText);
              }, this.store.config.loopDelay);
            }
          }
          wasGenerating = false;
        }
      }
    }

    if (this.adapter.shouldReinjectUI(mutations)) {
      shouldCheckUI = true;
    }

    if (shouldCheckUI) {
      this.onReinjectUI();
    }

    const shouldProcess =
      shouldCheckUI ||
      this.store.isGenerating ||
      this.store.userWorkflowPhase === 'intent';

    if (shouldProcess && !this.beautifier.isDomBusy()) {
      this.debouncedProcess();
    }
  }

  private debouncedProcess(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.beautifier.process();
    }, 80);
  }

  private startIntentHandoff(rawText: string, delayMs = 0): void {
    if (this.intentHandoffInProgress) return;
    this.intentHandoffInProgress = true;

    const run = () => {
      void this.orchestrator
        .finishIntentAndStartDeep(rawText)
        .finally(() => {
          this.intentHandoffInProgress = false;
        });
    };

    if (delayMs > 0) {
      setTimeout(run, delayMs);
    } else {
      run();
    }
  }
}
