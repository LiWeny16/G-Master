import { ISiteAdapter } from '../adapters/site-adapter';
import { StateStore } from '../stores/state-store';
import type { AgentOrchestrator } from './agent-orchestrator';
import { DeepThinkEngine } from './deep-think-engine';
import { DOMBeautifier } from './dom-beautifier';

export class DOMObserver {
  private observer: MutationObserver | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private adapter: ISiteAdapter,
    private store: StateStore,
    private engine: DeepThinkEngine,
    private beautifier: DOMBeautifier,
    private onReinjectUI: () => void,
    private orchestrator: AgentOrchestrator,
  ) {}

  start(): void {
    const { target, options } = this.adapter.getObserverConfig();
    this.observer = new MutationObserver((mutations) => this.handleMutations(mutations));
    this.observer.observe(target, options);
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  private handleMutations(mutations: MutationRecord[]): void {
    let wasGenerating = this.store.isGenerating;
    let shouldCheckUI = false;

    for (const mutation of mutations) {
      if (this.adapter.isGenerationComplete(mutation) && wasGenerating) {
        this.store.setGenerating(false);
        this.store.lastRawText = this.adapter.getLastResponseText();
        this.beautifier.process();
        if (this.store.isAgentEnabled && !this.store.userAborted) {
          if (this.store.userWorkflowPhase === 'intent') {
            setTimeout(() => {
              void this.orchestrator.finishIntentAndStartDeep(this.store.lastRawText);
            }, this.store.config.loopDelay);
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
      }
    }

    if (this.adapter.shouldReinjectUI(mutations)) {
      shouldCheckUI = true;
    }

    if (shouldCheckUI) {
      this.onReinjectUI();
      if (!this.beautifier.isDomBusy()) {
        this.debouncedProcess();
      }
    }
  }

  private debouncedProcess(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.beautifier.process();
    }, 80);
  }
}
