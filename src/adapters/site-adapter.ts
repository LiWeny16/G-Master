/** Gemini Web 模型档位；用于 `switchGeminiModel`。 */
export type GeminiModelId = 'fast' | 'thinking' | 'pro';

export interface ISiteAdapter {
  getEditor(): HTMLElement | null;
  getSendButton(): HTMLElement | null;
  isGenerating(): boolean;
  getLastResponseText(): string;
  insertTextAndSend(text: string): Promise<void>;
  getUserBubbles(): NodeListOf<Element>;
  getResponseMessages(): NodeListOf<Element>;
  getObserverConfig(): { target: Node; options: MutationObserverInit };
  isGenerationComplete(mutation: MutationRecord): boolean;
  isGenerationStarted(mutation: MutationRecord): boolean;
  shouldReinjectUI(mutations: MutationRecord[]): boolean;

  /**
   * 切换 Gemini 网页端模型模式。
   *
   * 实现中可能在打开菜单、点击选项等步骤之间插入 `setTimeout` 等延迟，以降低竞态；
   * 调用方勿假设 DOM 会瞬时完成更新。
   */
  switchGeminiModel?(model: GeminiModelId): Promise<void>;
}
