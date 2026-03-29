import { ISiteAdapter } from './site-adapter';

/**
 * ChatGPT（chatgpt.com）站点适配器。
 *
 * DOM 关键选择器（基于 2025 版 DOM 快照）：
 *
 * 输入框：  div#prompt-textarea[contenteditable="true"]  (.ProseMirror)
 * 发送按钮：button[data-testid="send-button"]（有文字时出现）
 * 停止按钮：button[data-testid="stop-button"]（生成中出现）
 * 用户轮次：section[data-turn="user"]
 * AI 轮次：  section[data-turn="assistant"]
 * AI 文本：  section[data-turn="assistant"] .markdown
 */

const SEL = {
  editor: 'div#prompt-textarea[contenteditable="true"]',
  sendBtn: 'button[data-testid="send-button"]',
  stopBtn: 'button[data-testid="stop-button"]',
  userTurn: 'section[data-turn="user"]',
  assistantTurn: 'section[data-turn="assistant"]',
  assistantMarkdown: 'section[data-turn="assistant"] .markdown',
} as const;

export class ChatGPTAdapter implements ISiteAdapter {
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
    return (
      document.querySelector(SEL.sendBtn) ??
      document.querySelector(SEL.stopBtn)
    );
  }

  isGenerating(): boolean {
    return document.querySelector(SEL.stopBtn) !== null;
  }

  stopGeneration(): void {
    const btn = document.querySelector(SEL.stopBtn) as HTMLButtonElement | null;
    if (btn) {
      btn.setAttribute('data-dt-auto-stop', '1');
      btn.click();
      window.setTimeout(() => btn.removeAttribute('data-dt-auto-stop'), 0);
    }
  }

  getLastResponseText(): string {
    const msgs = document.querySelectorAll(SEL.assistantMarkdown);
    return msgs.length > 0 ? (msgs[msgs.length - 1] as HTMLElement).innerText : '';
  }

  /**
   * 清空输入框并写入新文本，随后触发发送。
   * ChatGPT 输入框是 ProseMirror contenteditable，通过 execCommand 写入。
   */
  async insertTextAndSend(text: string): Promise<void> {
    const editor = this.getEditor();
    if (!editor) return;

    editor.focus();
    document.execCommand('selectAll', false, undefined);
    document.execCommand('insertText', false, text);
    editor.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));

    await new Promise<void>((r) => setTimeout(r, 150));
    this._clickSend();
  }

  /**
   * 将文本追加到编辑器末尾并触发发送。
   */
  async appendTextAndSend(textToAppend: string): Promise<void> {
    const editor = this.getEditor();
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

    await new Promise<void>((r) => setTimeout(r, 150));
    this._clickSend();
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
    const btn = target.closest('button') as HTMLButtonElement | null;
    if (!btn) return false;
    if (btn.dataset.testid === 'send-button') return true;
    const label = btn.getAttribute('aria-label') ?? '';
    return label.includes('发送') || label.toLowerCase().includes('send');
  }

  isStopButton(target: HTMLElement): boolean {
    const btn = target.closest('button') as HTMLButtonElement | null;
    if (!btn) return false;
    if (btn.dataset.testid === 'stop-button') return true;
    const label = btn.getAttribute('aria-label') ?? '';
    return label.includes('停止') || label.toLowerCase().includes('stop');
  }

  getUserBubbles(): NodeListOf<Element> {
    return document.querySelectorAll(SEL.userTurn);
  }

  getResponseMessages(): NodeListOf<Element> {
    return document.querySelectorAll(SEL.assistantTurn);
  }

  getObserverConfig(): { target: Node; options: MutationObserverInit } {
    return {
      target: document.body,
      options: {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'data-testid'],
      },
    };
  }

  /**
   * 完成检测：停止按钮从 DOM 中被移除时，说明生成已结束。
   */
  isGenerationComplete(mutation: MutationRecord): boolean {
    if (mutation.type !== 'childList') return false;
    for (const node of mutation.removedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const el = node as HTMLElement;
      if (
        el.matches?.(SEL.stopBtn) ||
        el.querySelector?.(SEL.stopBtn)
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * 开始检测：新增 assistant 轮次 section 时，说明 AI 开始回答。
   */
  isGenerationStarted(mutation: MutationRecord): boolean {
    for (const node of mutation.addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      if (this.isDtOwnedNode(node)) continue;
      const el = node as HTMLElement;
      if (
        el.matches?.('section[data-turn="assistant"]') ||
        el.querySelector?.('section[data-turn="assistant"]')
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * ChatGPT 是 React SPA，切换对话时主内容区整块替换，
   * 需检测浮球是否被移除以便重新注入。
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

  /** 点击发送按钮；降级时模拟 Enter 键。 */
  private _clickSend(): void {
    const btn = document.querySelector(SEL.sendBtn) as HTMLButtonElement | null;
    if (btn && !btn.disabled) {
      btn.click();
      return;
    }
    // 降级：模拟 Enter
    const editor = this.getEditor();
    if (editor) {
      editor.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          keyCode: 13,
          code: 'Enter',
          bubbles: true,
          cancelable: true,
        }),
      );
    }
  }
}
