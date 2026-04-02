import { ISiteAdapter } from '../adapters/site-adapter';
import { StateStore } from '../stores/state-store';
import type { AgentLoop } from './agent-loop';
import { DOMBeautifier } from './dom-beautifier';

export class DOMObserver {
  private observer: MutationObserver | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
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
    private agentLoop: AgentLoop,
    private beautifier: DOMBeautifier,
    private onReinjectUI: () => void,
  ) { }

  start(): void {
    const { target, options } = this.adapter.getObserverConfig();
    this.observer = new MutationObserver((mutations) => {
      this.handleMutations(mutations);
      this.tryRegisterExtraTargets(options);
    });
    this.observer.observe(target, options);
    this.tryRegisterExtraTargets(options);
    setTimeout(() => this.tryRegisterExtraTargets(options), 1500);

    if (this.WATCHDOG_ENABLED) {
      this.watchdogTimer = setInterval(() => this.checkStagnation(), 2000);
    }
  }

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

    if (currentLength === this.lastObservedTextLength) {
      this.watchdogIdleTicks++;
    } else {
      this.watchdogIdleTicks = 0;
      this.lastObservedTextLength = currentLength;
    }

    if (this.watchdogIdleTicks >= this.MAX_IDLE_TICKS) {
      console.warn('[G-Master Watchdog] Generation stalled for too long. Forcing interrupt...');

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

      this.dispatchAgentResponse();
      this.watchdogIdleTicks = 0;
    }
  }

  /**
   * 模型输出完毕后的统一分发：交给 AgentLoop.onModelResponse。
   * 简化后不再区分 intent / deep 阶段，统一走同一入口。
   */
  private dispatchAgentResponse(): void {
    if (!this.store.isAgentEnabled || this.store.userAborted) return;
    if (this.store.userWorkflowPhase === 'clarify') return; // 等待用户答问卷
    if (this.store.currentLoop > 0 || this.store.isSummarizing) {
      setTimeout(() => {
        void this.agentLoop.onModelResponse(this.store.lastRawText);
      }, this.store.config.loopDelay);
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
        if (this.beautifier.isDomBusy()) {
          setTimeout(() => { this.beautifier.process(); }, 150);
        }
        this.dispatchAgentResponse();
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
          this.dispatchAgentResponse();
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
      this.store.isGenerating;

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
}
