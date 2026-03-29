import { ISiteAdapter } from './site-adapter';

/**
 * Kimi（www.kimi.com）站点适配器。
 *
 * DOM 关键选择器（基于 2025 版 DOM 快照）：
 *
 * 输入框：    .chat-input-editor[contenteditable="true"][data-lexical-editor="true"]
 * 发送按钮：  .send-button-container:not(.disabled)（含文字时可点击）
 * 停止按钮：  .send-button-container（SVG name="Stop" 时为生成中状态）
 * 用户消息：  .chat-content-item-user .segment-content-box
 * AI 消息容器：.segment-content .markdown-container .markdown
 * 操作栏：    .segment-assistant-actions（生成完成后出现）
 */

const SEL = {
  editor: '.chat-input-editor[contenteditable="true"][data-lexical-editor="true"]',
  sendContainer: '.send-button-container',
  userMessage: '.chat-content-item-user',
  aiMarkdown: '.markdown-container .markdown',
  actionBar: '.segment-assistant-actions',
  segmentContent: '.segment-content',
} as const;

export class KimiAdapter implements ISiteAdapter {
  private isDtOwnedNode(node: Node): boolean {
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    const el = node as HTMLElement;
    return Boolean(
      el.id?.startsWith('dt-') ||
      Array.from(el.classList ?? []).some((cls) => cls.startsWith('dt-')) ||
      el.closest?.('[id^="dt-"]') ||
      el.closest?.('[class*="dt-"]'),
    );
  }

  getEditor(): HTMLElement | null {
    return document.querySelector(SEL.editor);
  }

  getSendButton(): HTMLElement | null {
    return document.querySelector(SEL.sendContainer);
  }

  /**
   * 生成中时，发送按钮容器的 SVG name 变为 "Stop"，
   * 或容器上存在 loading / streaming 相关类名。
   */
  isGenerating(): boolean {
    const container = document.querySelector(SEL.sendContainer);
    if (!container) return false;
    const svg = container.querySelector('svg');
    if (!svg) return false;
    const name = svg.getAttribute('name') ?? '';
    return name === 'Stop' || name === 'Pause' || name === 'Loading';
  }

  stopGeneration(): void {
    const container = document.querySelector<HTMLElement>(SEL.sendContainer);
    if (!container) return;
    container.setAttribute('data-dt-auto-stop', '1');
    container.click();
    window.setTimeout(() => container.removeAttribute('data-dt-auto-stop'), 0);
  }

  getLastResponseText(): string {
    const msgs = document.querySelectorAll(SEL.aiMarkdown);
    return msgs.length > 0 ? (msgs[msgs.length - 1] as HTMLElement).innerText : '';
  }

  /**
   * Kimi 使用 Lexical contenteditable 输入框。
   * 通过 Selection API 全选 + execCommand('insertText') 写入文本，
   * 触发 Lexical 的 beforeinput 处理链。
   * 注意：Lexical 状态更新为异步（Vue 响应式），等待 300ms 确保按钮状态就绪。
   */
  async insertTextAndSend(text: string): Promise<void> {
    const editor = document.querySelector<HTMLElement>(SEL.editor);
    if (!editor) return;

    editor.focus();
    // 使用 Selection API 全选（与 appendTextAndSend 保持一致，避免 execCommand('selectAll') 作用域不稳定）
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    sel?.removeAllRanges();
    sel?.addRange(range);

    document.execCommand('insertText', false, text);
    editor.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));

    await new Promise<void>((r) => setTimeout(r, 300));
    this._clickSend();
  }

  async appendTextAndSend(textToAppend: string): Promise<void> {
    const editor = document.querySelector<HTMLElement>(SEL.editor);
    if (!editor) return;

    editor.focus();
    // 光标移至末尾
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    sel?.removeAllRanges();
    sel?.addRange(range);

    document.execCommand('insertText', false, textToAppend);
    editor.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));

    await new Promise<void>((r) => setTimeout(r, 300));
    this._clickSend();
  }

  private _clickSend(): void {
    // 优先点击已激活的发送容器；若 Lexical 状态更新尚未同步至 Vue（按钮仍有 disabled 类），
    // 则回退到直接点击容器——Kimi 的 click handler 读取 Lexical 内部状态来决定是否发送，
    // 而不是依赖 DOM 的 disabled 类，因此直接点击同样有效。
    const active = document.querySelector<HTMLElement>(`${SEL.sendContainer}:not(.disabled)`) ??
      document.querySelector<HTMLElement>(SEL.sendContainer);
    if (active) {
      active.click();
    }
  }

  isEditorFocused(): boolean {
    const editor = this.getEditor();
    if (!editor) return false;
    return editor.contains(document.activeElement) || document.activeElement === editor;
  }

  getEditorText(): string {
    return (document.querySelector(SEL.editor) as HTMLElement)?.innerText?.trim() ?? '';
  }

  isSendButton(target: HTMLElement): boolean {
    // 命中 send-button-container 或其内部子元素
    const container = target.closest(SEL.sendContainer) as HTMLElement | null;
    if (!container) return false;
    // 如果容器不存在 disabled 类，认为是发送按钮
    return !container.classList.contains('disabled');
  }

  isStopButton(target: HTMLElement): boolean {
    const container = target.closest(SEL.sendContainer) as HTMLElement | null;
    if (!container) return false;
    const svg = container.querySelector('svg');
    if (!svg) return false;
    const name = svg.getAttribute('name') ?? '';
    return name === 'Stop' || name === 'Pause' || name === 'Loading';
  }

  getUserBubbles(): NodeListOf<Element> {
    return document.querySelectorAll(SEL.userMessage);
  }

  getResponseMessages(): NodeListOf<Element> {
    return document.querySelectorAll(SEL.segmentContent);
  }

  getObserverConfig(): { target: Node; options: MutationObserverInit } {
    return {
      target: document.body,
      options: {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
      },
    };
  }

  /**
   * 完成检测：操作栏（Copy/Refresh 按钮组）被添加到 DOM 时，说明生成结束。
   * 或者发送容器的 SVG 从 Stop 切换回 Send。
   */
  isGenerationComplete(mutation: MutationRecord): boolean {
    if (mutation.type === 'childList') {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const el = node as HTMLElement;
        if (
          el.matches?.('.segment-assistant-actions') ||
          el.querySelector?.('.segment-assistant-actions')
        ) {
          return true;
        }
      }
    }
    if (mutation.type === 'attributes') {
      const target = mutation.target as HTMLElement;
      if (target.matches?.(SEL.sendContainer)) {
        // 发送容器从 stop 状态切回 disabled（等待输入）说明生成结束
        const svg = target.querySelector('svg');
        const name = svg?.getAttribute('name') ?? '';
        if (name === 'Send') return true;
      }
    }
    return false;
  }

  /**
   * 开始检测：新增 AI 消息结构（markdown-container）时，说明 AI 开始回答。
   */
  isGenerationStarted(mutation: MutationRecord): boolean {
    if (mutation.type !== 'childList') return false;
    for (const node of mutation.addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      if (this.isDtOwnedNode(node)) continue;
      const el = node as HTMLElement;
      if (
        el.matches?.('.markdown-container') ||
        el.querySelector?.('.markdown-container')
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Kimi 是 Vue SPA，路由切换时主内容区会整块替换，
   * 检测浮球是否被移除以便重新注入。
   */
  shouldReinjectUI(mutations: MutationRecord[]): boolean {
    for (const mutation of mutations) {
      for (const node of mutation.removedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const el = node as HTMLElement;
        if (
          el.id === 'dt-floating-ball' ||
          el.querySelector?.('#dt-floating-ball')
        ) {
          return true;
        }
      }
    }
    return false;
  }
}
