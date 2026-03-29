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

  /** 编辑器输入框当前是否处于焦点状态 */
  isEditorFocused(): boolean;

  /** 返回编辑器里当前输入的文本（trim 后） */
  getEditorText(): string;

  /**
   * 将 `textToAppend` 追加到编辑器末尾并触发发送。
   * 调用方负责管理重入防护锁。
   */
  appendTextAndSend(textToAppend: string): Promise<void>;

  /** 判断点击目标是否为「发送」按钮 */
  isSendButton(target: HTMLElement): boolean;

  /** 判断点击目标是否为「停止生成」按钮 */
  isStopButton(target: HTMLElement): boolean;

  /**
   * 停止当前正在生成的回答。
   */
  stopGeneration?(): void;

  /**
   * 切换 Gemini 网页端模型模式。
   *
   * 实现中可能在打开菜单、点击选项等步骤之间插入 `setTimeout` 等延迟，以降低竞态；
   * 调用方勿假设 DOM 会瞬时完成更新。
   */
  switchGeminiModel?(model: GeminiModelId): Promise<void>;
}
