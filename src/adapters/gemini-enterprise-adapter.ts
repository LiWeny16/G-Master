import { GeminiModelId, ISiteAdapter } from './site-adapter';

/**
 * Gemini Enterprise (vertexaisearch.cloud.google.com) 适配器。
 *
 * 页面元素路径因状态不同有两种布局：
 *
 * 【新对话 / Landing 页】
 *   document
 *   └─ ucs-standalone-app  #shadow-root
 *        └─ #main > ucs-chat-landing  #shadow-root
 *             └─ div.fixed-content > ucs-search-bar  #shadow-root
 *                  ├─ .send-button
 *                  └─ #agent-search-prosemirror-editor  #shadow-root
 *                       └─ .ProseMirror
 *
 * 【对话进行中 / Results 页】
 *   document
 *   └─ ucs-standalone-app  #shadow-root
 *        ├─ ucs-results  #shadow-root
 *        │    ├─ ucs-conversation  #shadow-root
 *        │    │    └─ div > div.turn > div / ucs-summary
 *        │    └─ ucs-search-bar  #shadow-root  (可能在 results 内)
 *        └─ ucs-search-bar  #shadow-root  (也可能直接在 appRoot)
 *
 * getSearchBarRoot() 按顺序尝试三条路径以兼容两种状态。
 */

const MODEL_HEADLINE_KEYWORDS: Record<GeminiModelId, string[]> = {
  fast: ['2.5 flash', '2.5 Flash'],
  thinking: ['3.1 pro', '3.1 Pro'],
  pro: ['2.5 pro', '2.5 Pro'],
} as const;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class GeminiEnterpriseAdapter implements ISiteAdapter {
  // ─── Shadow DOM 导航辅助 ──────────────────────────────

  /** ucs-standalone-app.shadowRoot（顶层 shadow root） */
  private getAppRoot(): ShadowRoot | null {
    return document.querySelector('ucs-standalone-app')?.shadowRoot ?? null;
  }

  /**
   * ucs-search-bar.shadowRoot
   *
   * 按顺序尝试三条路径：
   *   A. Landing 页：appRoot → ucs-chat-landing.shadowRoot → ucs-search-bar
   *   B. Results 页：appRoot → ucs-results.shadowRoot → ucs-search-bar
   *   C. 兜底：appRoot → ucs-search-bar（直接子）
   */
  private getSearchBarRoot(): ShadowRoot | null {
    const appRoot = this.getAppRoot();
    if (!appRoot) return null;

    // A. Landing / new-chat layout
    const chatLandingSr = appRoot.querySelector('ucs-chat-landing')?.shadowRoot;
    if (chatLandingSr) {
      const sb = chatLandingSr.querySelector('ucs-search-bar');
      if (sb?.shadowRoot) return sb.shadowRoot;
    }

    // B. Results / active-conversation layout
    const resultsSr = appRoot.querySelector('ucs-results')?.shadowRoot;
    if (resultsSr) {
      const sb = resultsSr.querySelector('ucs-search-bar');
      if (sb?.shadowRoot) return sb.shadowRoot;
    }

    // C. Direct fallback
    return appRoot.querySelector('ucs-search-bar')?.shadowRoot ?? null;
  }

  /**
   * ucs-conversation.shadowRoot
   * 路径：appRoot → ucs-results.shadowRoot → ucs-conversation
   */
  private getConversationRoot(): ShadowRoot | null {
    const appRoot = this.getAppRoot();
    if (!appRoot) return null;
    const resultsRoot = appRoot.querySelector('ucs-results')?.shadowRoot;
    if (!resultsRoot) return null;
    return resultsRoot.querySelector('ucs-conversation')?.shadowRoot ?? null;
  }

  // ─── Editor ───────────────────────────────────────────

  /**
   * 获取 ProseMirror contenteditable 元素。
   * 路径：appRoot → ucs-search-bar.shadowRoot
   *       → #agent-search-prosemirror-editor.shadowRoot → .ProseMirror
   */
  getEditor(): HTMLElement | null {
    const sbRoot = this.getSearchBarRoot();
    if (!sbRoot) return null;
    const editorHost = sbRoot.querySelector('#agent-search-prosemirror-editor');
    return editorHost?.shadowRoot?.querySelector<HTMLElement>('.ProseMirror') ?? null;
  }

  /**
   * 获取发送/停止按钮。
   * 路径：appRoot → ucs-search-bar.shadowRoot → .send-button
   */
  getSendButton(): HTMLElement | null {
    return this.getSearchBarRoot()?.querySelector<HTMLElement>('.send-button') ?? null;
  }

  isGenerating(): boolean {
    return this.getSendButton()?.classList.contains('stop') ?? false;
  }

  stopGeneration(): void {
    const btn = this.getSendButton();
    if (btn?.classList.contains('stop')) {
      btn.setAttribute('data-dt-auto-stop', '1');
      btn.click();
      window.setTimeout(() => btn.removeAttribute('data-dt-auto-stop'), 0);
    }
  }

  // ─── Response ─────────────────────────────────────────

  /**
   * 读取最后一条 AI 回复纯文本。
   * 路径：convRoot → div.turn（最后含 ucs-summary 的）→ ucs-summary.shadowRoot
   *       → ucs-text-streamer.shadowRoot → ucs-response-markdown.shadowRoot
   *       → ucs-fast-markdown.shadowRoot → div
   */
  getLastResponseText(): string {
    const convRoot = this.getConversationRoot();
    if (!convRoot) return '';
    const turns = Array.from(convRoot.querySelectorAll<HTMLElement>('div.turn'));
    for (let i = turns.length - 1; i >= 0; i--) {
      const summary = turns[i].querySelector('ucs-summary');
      if (!summary?.shadowRoot) continue;
      const text = this.extractSummaryText(summary);
      if (text) return text;
    }
    return '';
  }

  private extractSummaryText(summary: Element): string {
    const streamer = summary.shadowRoot?.querySelector('ucs-text-streamer');
    const resMd = streamer?.shadowRoot?.querySelector('ucs-response-markdown');
    const fastMd = resMd?.shadowRoot?.querySelector('ucs-fast-markdown');
    const mdDoc = fastMd?.shadowRoot?.querySelector('div');
    return (mdDoc as HTMLElement)?.innerText?.trim() ?? '';
  }

  // ─── Text Input ───────────────────────────────────────

  async insertTextAndSend(text: string): Promise<void> {
    const editor = this.getEditor();
    if (!editor) return;
    editor.focus();
    document.execCommand('selectAll', false, undefined);
    document.execCommand('insertText', false, text);
    editor.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    return new Promise<void>((resolve) => {
      let checks = 0;
      const interval = setInterval(() => {
        const btn = this.getSendButton();
        checks++;
        if (btn && !(btn as HTMLButtonElement).disabled && !btn.classList.contains('stop')) {
          clearInterval(interval);
          setTimeout(() => { btn.click(); resolve(); }, 150);
        } else if (checks > 15) {
          clearInterval(interval);
          resolve();
        }
      }, 200);
    });
  }

  /**
   * 检测编辑器是否获得焦点。
   * 需逐层穿透 shadow root 查 activeElement。
   */
  isEditorFocused(): boolean {
    const sbRoot = this.getSearchBarRoot();
    if (!sbRoot) return false;
    const editorHost = sbRoot.querySelector('#agent-search-prosemirror-editor');
    if (!editorHost?.shadowRoot) return false;
    const activeEl = editorHost.shadowRoot.activeElement;
    return activeEl?.classList.contains('ProseMirror') ?? false;
  }

  getEditorText(): string {
    return this.getEditor()?.innerText?.trim() ?? '';
  }

  async appendTextAndSend(textToAppend: string): Promise<void> {
    const editor = this.getEditor();
    if (!editor) return;
    editor.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    sel?.removeAllRanges();
    sel?.addRange(range);
    document.execCommand('insertText', false, textToAppend);
    editor.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    await delay(150);
    const btn = this.getSendButton() as HTMLButtonElement | null;
    if (btn && !btn.disabled && !btn.classList.contains('stop')) {
      btn.click();
    }
  }

  // ─── Button Detection ─────────────────────────────────

  isSendButton(target: HTMLElement): boolean {
    return !!target.closest('.send-button:not(.stop)');
  }

  isStopButton(target: HTMLElement): boolean {
    return !!target.closest('.send-button.stop');
  }

  // ─── Bubbles ──────────────────────────────────────────

  /**
   * 用户消息列表。
   * 路径：convRoot → div > div.turn > div（直接 div 子，非 ucs-summary）
   */
  getUserBubbles(): NodeListOf<Element> {
    const convRoot = this.getConversationRoot();
    if (!convRoot) return document.querySelectorAll('.dt-ne-enterprise');
    return convRoot.querySelectorAll('div > div.turn > div');
  }

  /**
   * AI 回复消息列表。
   * 路径：convRoot → div > div.turn > ucs-summary
   */
  getResponseMessages(): NodeListOf<Element> {
    const convRoot = this.getConversationRoot();
    if (!convRoot) return document.querySelectorAll('.dt-ne-enterprise');
    return convRoot.querySelectorAll('div > div.turn > ucs-summary');
  }

  // ─── Observer ─────────────────────────────────────────

  getObserverConfig(): { target: Node; options: MutationObserverInit } {
    // 观察 document.body 捕捉 SPA 导航（ucs-standalone-app 挂载/卸载）
    return {
      target: document.body,
      options: { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] },
    };
  }

  /**
   * 额外的 shadow root 观察目标。
   * DOMObserver 会将这些目标也加入 MutationObserver，
   * 以便检测 ucs-search-bar 内 send-button 的 class 变化
   * （generation start → stop 类出现；generation complete → stop 类消失）。
   */
  extraObserverTargets(): Node[] {
    const targets: Node[] = [];
    const sbRoot = this.getSearchBarRoot();
    if (sbRoot) targets.push(sbRoot);
    return targets;
  }

  isGenerationComplete(mutation: MutationRecord): boolean {
    const target = mutation.target as HTMLElement;
    return (
      target.classList?.contains('send-button') === true &&
      !target.classList.contains('stop')
    );
  }

  isGenerationStarted(mutation: MutationRecord): boolean {
    const target = mutation.target as HTMLElement;
    return (
      target.classList?.contains('send-button') === true &&
      target.classList.contains('stop')
    );
  }

  private isDtOwnedNode(node: Node): boolean {
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    const el = node as HTMLElement;
    return Boolean(
      el.id?.startsWith('dt-') ||
      Array.from(el.classList ?? []).some((cls) => cls.startsWith('dt-')) ||
      el.closest?.('[id^="dt-"]') ||
      el.closest?.('[class*="dt-"]')
    );
  }

  shouldReinjectUI(mutations: MutationRecord[]): boolean {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (this.isDtOwnedNode(node)) continue;
        const el = node as HTMLElement;
        const tag = el.tagName?.toLowerCase() ?? '';
        if (
          tag === 'ucs-prosemirror-editor' ||
          tag === 'ucs-summary' ||
          tag === 'ucs-search-bar' ||
          el.matches?.('.send-button, .actions-buttons') ||
          el.querySelector?.('ucs-prosemirror-editor, ucs-summary, .send-button')
        ) {
          return true;
        }
      }
      for (const node of mutation.removedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const el = node as HTMLElement;
        if (el.id === 'dt-floating-ball' || el.querySelector?.('#dt-floating-ball')) {
          return true;
        }
      }
    }
    return false;
  }

  // ─── Model Switching ──────────────────────────────────

  /**
   * 切换 Gemini Enterprise 模型。
   * 按钮和菜单均位于 ucs-search-bar.shadowRoot 内。
   */
  async switchGeminiModel(model: GeminiModelId): Promise<void> {
    const sbRoot = this.getSearchBarRoot();
    if (!sbRoot) return;

    const opener = sbRoot.querySelector<HTMLElement>('.action-model-selector');
    if (!opener) return;

    const currentLabel = opener.querySelector('.model-selector-label')?.textContent?.trim().toLowerCase() ?? '';
    const keywords = MODEL_HEADLINE_KEYWORDS[model];
    if (keywords.some((kw) => currentLabel.includes(kw.toLowerCase()))) {
      console.debug(`[DeepThink] Gemini Enterprise model already ${model}, skipping.`);
      return;
    }

    // md-text-button 内部有 shadow #button，必须点内部按钮才能打开菜单
    const innerOpenBtn = opener.shadowRoot?.querySelector<HTMLElement>('#button') ?? opener;
    innerOpenBtn.click();
    await delay(400);

    // 菜单在 sbRoot 的 light DOM 内，不会 portal 到 document
    const menu = sbRoot.querySelector<HTMLElement>('.model-selector-menu');
    if (!menu) return;

    // 优先通过 headline 文字匹配
    const items = menu.querySelectorAll('md-menu-item');
    let target: HTMLElement | null = null;
    for (const item of items) {
      const headline = item.querySelector('[slot="headline"]')?.textContent?.trim().toLowerCase() ?? '';
      if (keywords.some((kw) => headline.includes(kw.toLowerCase()))) {
        target = item as HTMLElement;
        break;
      }
    }

    // nth-child 兜底（用户实测位置：Flash2.5=6, 3Flash=4, 3.1Pro=3）
    if (!target) {
      const nthMap: Partial<Record<GeminiModelId, number>> = { fast: 6, thinking: 3 };
      const nth = nthMap[model];
      if (nth) {
        target = menu.querySelector<HTMLElement>(`md-menu-item:nth-child(${nth})`);
      }
    }

    target?.click();
    await delay(300);
  }
}
