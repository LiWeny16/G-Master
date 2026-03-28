import { GeminiModelId, ISiteAdapter } from './site-adapter';

const SEL = {
  editor: '.ql-editor',
  sendButton: '.send-button',
  messageContent: 'message-content',
  queryText: '.query-text',
  leadingActions: '.leading-actions-wrapper',
} as const;

const MODE_OPTION_SELECTORS: Record<GeminiModelId, readonly string[]> = {
  fast: ['[data-test-id="bard-mode-option-快速"]', '[data-mode-id="56fdd199312815e2"]', '[data-test-id="bard-mode-option-fast"]', '[data-mode-id="fbb127bbb056c959"]'],
  thinking: ['[data-test-id="bard-mode-option-思考"]', '[data-mode-id="e051ce1aa80aa576"]', '[data-test-id="bard-mode-option-thinking"]', '[data-mode-id="5bf011840784117a"]'],
  pro: ['[data-test-id="bard-mode-option-pro"]', '[data-mode-id="e6fa609c3fa255c0"]', '[data-mode-id="9d8ca3786ebdfbea"]'],
} as const;

function delay300(): Promise<void> {
  return new Promise((r) => setTimeout(r, 300));
}

export class GeminiAdapter implements ISiteAdapter {
  getEditor(): HTMLElement | null {
    return document.querySelector(SEL.editor);
  }

  getSendButton(): HTMLElement | null {
    return document.querySelector(SEL.sendButton);
  }

  isGenerating(): boolean {
    return this.getSendButton()?.classList.contains('stop') ?? false;
  }

  getLastResponseText(): string {
    const msgs = document.querySelectorAll(SEL.messageContent);
    return msgs.length > 0 ? (msgs[msgs.length - 1] as HTMLElement).innerText : '';
  }

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

  getUserBubbles(): NodeListOf<Element> {
    return document.querySelectorAll(SEL.queryText);
  }

  getResponseMessages(): NodeListOf<Element> {
    return document.querySelectorAll(SEL.messageContent);
  }

  getObserverConfig(): { target: Node; options: MutationObserverInit } {
    return {
      target: document.body,
      options: { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] },
    };
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

  shouldReinjectUI(mutations: MutationRecord[]): boolean {
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) return true;
      for (const node of mutation.removedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const el = node as HTMLElement;
        if (
          el.id === 'dt-floating-ball' ||
          el.classList?.contains('leading-actions-wrapper') ||
          el.querySelector?.('#dt-floating-ball')
        ) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * 打开模式菜单并点击目标项；步骤间含 300ms 延迟（见接口说明）。
   */
  async switchGeminiModel(model: GeminiModelId): Promise<void> {
    const opener = this.findGeminiModeMenuButton();
    if (!opener) return;

    /* pre-check: 检查当前按钮文本是否已是目标模型 */
    const text = (opener.textContent ?? '').trim().toLowerCase();
    let skip = false;
    if (model === 'fast' && (text.includes('快速') || text.includes('fast'))) skip = true;
    else if (model === 'thinking' && (text.includes('思考') || text.includes('thinking'))) skip = true;
    else if (model === 'pro' && text.includes('pro')) skip = true;

    if (skip) {
      console.debug(`[DeepThink] Gemini model already ${model}, skipping click.`);
      return;
    }

    opener.click();
    await delay300();

    const selectors = MODE_OPTION_SELECTORS[model];
    let target: HTMLElement | null = null;
    for (const sel of selectors) {
      target = document.querySelector(sel);
      if (target) break;
    }
    target?.click();
    await delay300();
  }

  /** 定位打开模型下拉的按钮（启发式，随 DOM 变化可能需调整）。 */
  private findGeminiModeMenuButton(): HTMLElement | null {
    // 1. 最精确的匹配，直接找测试 ID
    const exactBtn = document.querySelector('button[data-test-id="bard-mode-menu-button"]');
    if (exactBtn instanceof HTMLElement) return exactBtn;

    // 2. 退一步匹配包含 mode 和 menu 的测试 ID
    const byTestId = document.querySelector('button[data-test-id*="mode"][aria-haspopup="menu"]');
    if (byTestId instanceof HTMLElement) return byTestId;

    // 3. 基于文案的启发式查找
    const main = document.querySelector('main');
    if (main) {
      for (const btn of main.querySelectorAll('button.mat-mdc-button[aria-haspopup="menu"]')) {
        // 排除掉对话区域的“更多选项”等按钮，防止误点
        if (btn.closest('message-content') || btn.closest('[data-test-id="message-actions"]') || btn.closest('.message-actions')) {
          continue;
        }

        const t = (btn.textContent ?? '').trim().toLowerCase();
        if (
          t === 'gemini' || t.includes('gemini advanced') || t.includes('flash') ||
          t.includes('快速') || t.includes('fast') || 
          t.includes('pro') || 
          t.includes('思考') || t.includes('thinking')
        ) {
          return btn as HTMLElement;
        }
      }
    }

    // 4. 基于输入框附近查找 (Fallback)
    const editor = this.getEditor();
    if (editor) {
      let el: HTMLElement | null = editor;
      for (let d = 0; d < 12 && el; d++) {
        const near =
          el.closest('.composer')?.querySelector('button[aria-haspopup="menu"][aria-label*="mode" i]') ??
          el.parentElement?.querySelector('button[aria-haspopup="menu"][aria-label*="mode" i]');      
        if (near) return near as HTMLElement;
        el = el.parentElement;
      }
    }

    return null;
  }
}
