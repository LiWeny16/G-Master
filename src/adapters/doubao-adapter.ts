import { ISiteAdapter } from './site-adapter';

/**
 * 豆包（www.doubao.com）站点适配器。
 *
 * DOM 关键选择器（基于 2025-03 版 DOM 快照）：
 *
 * 输入框：textarea[data-testid="chat_input_input"]
 * 发送按钮：button[data-testid="send_btn"]（有文字时出现）
 * 停止按钮：button[data-testid="stop_btn"]（生成中出现）
 * 用户消息：[data-testid="send_message"]
 * AI 消息容器：[data-testid="receive_message"]
 * AI 消息文本：[data-testid="message_text_content"]
 * 流式指示器：data-show-indicator="true" 表示正在串流，"false" 表示已完成
 */

const SEL = {
  textarea: 'textarea[data-testid="chat_input_input"]',
  sendBtn: 'button[data-testid="send_btn"]',
  stopBtn: 'button[data-testid="stop_btn"]',
  sendMessage: '[data-testid="send_message"]',
  receiveMessage: '[data-testid="receive_message"]',
  messageText: '[data-testid="message_text_content"]',
} as const;

export class DoubaoAdapter implements ISiteAdapter {
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
    return document.querySelector(SEL.textarea);
  }

  getSendButton(): HTMLElement | null {
    return (
      document.querySelector(SEL.sendBtn) ??
      document.querySelector(SEL.stopBtn)
    );
  }

  isGenerating(): boolean {
    // 生成中时豆包显示停止按钮，或流式指示器为 true
    return (
      document.querySelector(SEL.stopBtn) !== null ||
      document.querySelector(`${SEL.messageText}[data-show-indicator="true"]`) !== null
    );
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
    const msgs = document.querySelectorAll(
      `${SEL.receiveMessage} ${SEL.messageText}`,
    );
    return msgs.length > 0 ? (msgs[msgs.length - 1] as HTMLElement).innerText : '';
  }

  /**
   * 用 React native setter 写入单条完整文本，随后模拟 Enter 发送。
   * 豆包输入框是 React 受控 textarea，必须绕过合成事件系统才能触发。
   */
  async insertTextAndSend(text: string): Promise<void> {
    const textarea = document.querySelector(SEL.textarea) as HTMLTextAreaElement | null;
    if (!textarea) return;

    this._setTextareaValue(textarea, text);
    await new Promise<void>((r) => setTimeout(r, 150));
    this._triggerSend(textarea);
  }

  /**
   * 将文本追加到当前输入框内容之后并触发发送。
   * ContentApp 负责在调用前后维护 _injecting 锁。
   */
  async appendTextAndSend(textToAppend: string): Promise<void> {
    const textarea = document.querySelector(SEL.textarea) as HTMLTextAreaElement | null;
    if (!textarea) return;

    const current = textarea.value;
    this._setTextareaValue(textarea, current + textToAppend);
    await new Promise<void>((r) => setTimeout(r, 150));
    this._triggerSend(textarea);
  }

  isEditorFocused(): boolean {
    const editor = this.getEditor();
    if (!editor) return false;
    return document.activeElement === editor;
  }

  getEditorText(): string {
    return (document.querySelector(SEL.textarea) as HTMLTextAreaElement)?.value?.trim() ?? '';
  }

  isSendButton(target: HTMLElement): boolean {
    // 优先匹配 testid；次选：在输入区域内且没有 stop testid 的普通按钮
    const btn = target.closest('button') as HTMLButtonElement | null;
    if (!btn) return false;
    if (btn.dataset.testid === 'send_btn') return true;
    // 部分版本可能用 aria-label
    const label = btn.getAttribute('aria-label') ?? '';
    if (label.includes('发送') || label.toLowerCase().includes('send')) return true;
    return false;
  }

  isStopButton(target: HTMLElement): boolean {
    const btn = target.closest('button') as HTMLButtonElement | null;
    if (!btn) return false;
    if (btn.dataset.testid === 'stop_btn') return true;
    const label = btn.getAttribute('aria-label') ?? '';
    if (label.includes('停止') || label.toLowerCase().includes('stop')) return true;
    return false;
  }

  getUserBubbles(): NodeListOf<Element> {
    return document.querySelectorAll(SEL.sendMessage);
  }

  getResponseMessages(): NodeListOf<Element> {
    return document.querySelectorAll(SEL.receiveMessage);
  }

  getObserverConfig(): { target: Node; options: MutationObserverInit } {
    return {
      target: document.body,
      options: {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeOldValue: true,
        // data-show-indicator 属性变化用于检测流式结束
        attributeFilter: ['data-show-indicator', 'class'],
      },
    };
  }

  /**
   * 检测生成完成：
   * 1. 最后一条 AI 消息的 data-show-indicator 从 "true" 真正变为 "false"（流式结束）
   * 2. 最后一条 AI 消息的 action_bar 从 opacity-0 变为 opacity-100（工具栏出现）
   *
   * 关键：必须依赖 oldValue 区分"真正切换"与"React 重渲染时属性值不变的刷新"，
   * 否则历史消息每次 re-render 都会误触发 isGenerationComplete。
   */
  isGenerationComplete(mutation: MutationRecord): boolean {
    if (mutation.type !== 'attributes') return false;
    const el = mutation.target as HTMLElement;

    // ① 流式指示器：必须从 'true' 切换到 'false'（排除初始化 / 重渲 false→false）
    if (
      mutation.attributeName === 'data-show-indicator' &&
      mutation.oldValue === 'true' &&
      el.getAttribute('data-show-indicator') === 'false' &&
      el.closest(SEL.receiveMessage)
    ) {
      return true;
    }

    // ② action_bar 亮起：必须从含 opacity-0 变为含 opacity-100，
    //    且必须是最后一条 AI 消息的 action_bar（避免旧消息 hover/re-render 误触发）
    if (
      mutation.attributeName === 'class' &&
      el.dataset.testid === 'message_action_bar' &&
      (mutation.oldValue ?? '').includes('opacity-0') &&
      el.classList.contains('opacity-100')
    ) {
      const allReceive = document.querySelectorAll(SEL.receiveMessage);
      const lastReceive = allReceive[allReceive.length - 1];
      if (lastReceive && lastReceive.contains(el)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 检测生成开始：DOM 中新增 receive_message 节点。
   */
  isGenerationStarted(mutation: MutationRecord): boolean {
    for (const node of mutation.addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      if (this.isDtOwnedNode(node)) continue;
      const el = node as HTMLElement;
      if (
        el.matches?.(SEL.receiveMessage) ||
        el.querySelector?.(SEL.receiveMessage)
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * 豆包是 React SPA，主要通过 History API 路由，无需重新注入 UI。
   * 浮球本身由 React 渲染，不会被 SPA 导航销毁。
   */
  shouldReinjectUI(_mutations: MutationRecord[]): boolean {
    return false;
  }

  // ── 私有工具方法 ──────────────────────────────────────────────────────────

  /**
   * 使用 React 内部 native setter 更新受控 textarea 值，
   * 再派发 input / change 事件让 React 感知到变化。
   */
  private _setTextareaValue(textarea: HTMLTextAreaElement, value: string): void {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value',
    )?.set;
    if (nativeSetter) {
      nativeSetter.call(textarea, value);
    } else {
      textarea.value = value;
    }
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * 优先点击发送按钮；若找不到则在 textarea 上模拟 Enter 键。
   */
  private _triggerSend(textarea: HTMLTextAreaElement): void {
    const btn = document.querySelector(SEL.sendBtn) as HTMLButtonElement | null;
    if (btn && !btn.disabled) {
      btn.click();
      return;
    }
    textarea.dispatchEvent(
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
