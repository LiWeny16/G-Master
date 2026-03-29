import { ISiteAdapter } from './site-adapter';

/**
 * 智谱 AI（chat.z.ai）站点适配器。
 *
 * DOM 关键选择器（基于 2025-03 版 DOM 快照）：
 *
 * 输入框：     #chat-input（原生 textarea，Svelte 响应式绑定）
 * 发送按钮：   #send-message-button
 * 用户消息：   .user-message
 * AI 消息容器：.chat-assistant
 * 操作栏：     div.buttons（内含 .copy-response-button / .regenerate-response-button）
 * 工具栏注入点：.flagsContainer 的父容器
 *
 * 注意：z.ai 当前无法切换模型，AUTO 模式（含意图识别阶段）已在内联开关中禁用。
 */

const SEL = {
  editor: '#chat-input',
  // 旧版发送按钮（历史 DOM）
  legacySendButton: '#send-message-button',
  // 新版输入区右侧控制（生产态）：aria-label="发送消息" / "停止"
  sendControlContainer: 'div[aria-label*="发送"], div[aria-label*="Send"]',
  stopControlContainer: 'div[aria-label*="停止"], div[aria-label*="Stop"]',
  userMessage: '.user-message',
  chatAssistant: '.chat-assistant',
  actionBar: 'div.buttons',
  flagsContainer: '.flagsContainer',
} as const;

export class ZhipuAdapter implements ISiteAdapter {
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
    return this.getSendControl() ?? this.getStopControl();
  }

  /** 优先返回可见的最新节点，避免拿到旧会话区里不可见的同名元素。 */
  private findLatestVisible(selector: string): HTMLElement | null {
    const nodes = document.querySelectorAll<HTMLElement>(selector);
    for (let i = nodes.length - 1; i >= 0; i--) {
      const el = nodes[i];
      if (!el.isConnected) continue;
      if (el.getClientRects().length > 0) return el;
    }
    return nodes.length > 0 ? nodes[nodes.length - 1] : null;
  }

  private resolveClickable(root: HTMLElement | null): HTMLElement | null {
    if (!root) return null;
    if (root instanceof HTMLButtonElement) return root;
    return root.querySelector<HTMLButtonElement>('button') ?? root;
  }

  private getSendControl(): HTMLElement | null {
    const legacy = this.findLatestVisible(SEL.legacySendButton);
    if (legacy) return this.resolveClickable(legacy);

    const container = this.findLatestVisible(SEL.sendControlContainer);
    return this.resolveClickable(container);
  }

  private getStopControl(): HTMLElement | null {
    const container = this.findLatestVisible(SEL.stopControlContainer);
    return this.resolveClickable(container);
  }

  private isControlDisabled(control: HTMLElement): boolean {
    const btn = control instanceof HTMLButtonElement
      ? control
      : control.querySelector<HTMLButtonElement>('button');
    if (btn) {
      return btn.disabled || btn.getAttribute('aria-disabled') === 'true';
    }
    return control.getAttribute('aria-disabled') === 'true';
  }

  private clickControl(control: HTMLElement): void {
    const btn = control instanceof HTMLButtonElement
      ? control
      : control.querySelector<HTMLButtonElement>('button');
    (btn ?? control).click();
  }

  private hasAssistantMessage(): boolean {
    return document.querySelectorAll(SEL.chatAssistant).length > 0;
  }

  /**
   * 生成中判定（兼容新旧 DOM）：
   * 1) 出现 "停止" 控件时，必然在生成中；
   * 2) 若最后一条 assistant 旁还没有操作栏，也视为生成中。
   */
  isGenerating(): boolean {
    if (this.getStopControl()) return true;

    const assistants = document.querySelectorAll(SEL.chatAssistant);
    if (assistants.length === 0) return false;
    const last = assistants[assistants.length - 1] as HTMLElement;
    // 向上找到包含操作栏的祖先区域
    const responseBlock = last.closest('.flex-auto') ?? last.parentElement;
    return responseBlock ? !responseBlock.querySelector(SEL.actionBar) : false;
  }

  stopGeneration(): void {
    // 生产态优先点击 aria-label="停止" 控件；旧版回退为发送按钮同位切换。
    const ctrl = this.getStopControl() ?? (this.isGenerating() ? this.getSendControl() : null);
    if (ctrl) {
      ctrl.setAttribute('data-dt-auto-stop', '1');
      this.clickControl(ctrl);
      window.setTimeout(() => ctrl.removeAttribute('data-dt-auto-stop'), 0);
    }
  }

  getLastResponseText(): string {
    const msgs = document.querySelectorAll(SEL.chatAssistant);
    return msgs.length > 0 ? (msgs[msgs.length - 1] as HTMLElement).innerText : '';
  }

  /**
   * z.ai 使用 Svelte 响应式绑定的原生 textarea。
   * 通过 HTMLTextAreaElement.prototype.value 的 native setter 写入值，
   * 随后派发 input/change 事件驱动 Svelte 状态更新。
   */
  async insertTextAndSend(text: string): Promise<void> {
    const textarea = document.querySelector<HTMLTextAreaElement>(SEL.editor);
    if (!textarea) return;

    textarea.focus();
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value',
    )?.set;
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(textarea, text);
    } else {
      textarea.value = text;
    }
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));

    return new Promise<void>((resolve) => {
      let checks = 0;
      const interval = setInterval(() => {
        const stopCtrl = this.getStopControl();
        const sendCtrl = this.getSendControl();
        checks++;
        if (sendCtrl && !stopCtrl && !this.isControlDisabled(sendCtrl)) {
          clearInterval(interval);
          setTimeout(() => {
            this.clickControl(sendCtrl);
            resolve();
          }, 150);
        } else if (checks > 15) {
          clearInterval(interval);
          resolve();
        }
      }, 200);
    });
  }

  async appendTextAndSend(textToAppend: string): Promise<void> {
    const textarea = document.querySelector<HTMLTextAreaElement>(SEL.editor);
    if (!textarea) return;

    textarea.focus();
    const current = textarea.value;
    const newText = current ? current + '\n' + textToAppend : textToAppend;

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value',
    )?.set;
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(textarea, newText);
    } else {
      textarea.value = newText;
    }
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));

    await new Promise<void>((r) => setTimeout(r, 300));

    const stopCtrl = this.getStopControl();
    const sendCtrl = this.getSendControl();
    if (sendCtrl && !stopCtrl && !this.isControlDisabled(sendCtrl)) {
      this.clickControl(sendCtrl);
    }
  }

  isEditorFocused(): boolean {
    const editor = this.getEditor();
    if (!editor) return false;
    return document.activeElement === editor;
  }

  getEditorText(): string {
    return (document.querySelector<HTMLTextAreaElement>(SEL.editor))?.value?.trim() ?? '';
  }

  isSendButton(target: HTMLElement): boolean {
    if (target.closest(`${SEL.stopControlContainer}, ${SEL.stopControlContainer} button`)) {
      return false;
    }
    return Boolean(
      target.closest(SEL.legacySendButton) ||
      target.closest(`${SEL.sendControlContainer}, ${SEL.sendControlContainer} button`),
    );
  }

  isStopButton(target: HTMLElement): boolean {
    return Boolean(
      target.closest(`${SEL.stopControlContainer}, ${SEL.stopControlContainer} button`),
    );
  }

  getUserBubbles(): NodeListOf<Element> {
    return document.querySelectorAll(SEL.userMessage);
  }

  getResponseMessages(): NodeListOf<Element> {
    return document.querySelectorAll(SEL.chatAssistant);
  }

  getObserverConfig(): { target: Node; options: MutationObserverInit } {
    return {
      target: document.body,
      options: {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['disabled', 'class', 'aria-label'],
      },
    };
  }

  /**
   * 完成检测（兼容新旧 DOM）：
   * 1) 回答操作栏（div.buttons）挂载；
   * 2) 生成中的 stop 控件被移除；
   * 3) 发送控件回归且可发送。
   */
  isGenerationComplete(mutation: MutationRecord): boolean {
    if (mutation.type === 'childList') {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (this.isDtOwnedNode(node)) continue;
        const el = node as HTMLElement;
        if (
          el.matches?.(SEL.actionBar) ||
          el.querySelector?.(SEL.actionBar)
        ) {
          return true;
        }
      }

      for (const node of mutation.removedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (this.isDtOwnedNode(node)) continue;
        const el = node as HTMLElement;
        if (
          el.matches?.(SEL.stopControlContainer) ||
          el.querySelector?.(SEL.stopControlContainer)
        ) {
          return !this.getStopControl() && this.hasAssistantMessage();
        }
      }

      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (this.isDtOwnedNode(node)) continue;
        const el = node as HTMLElement;
        if (
          el.matches?.(SEL.legacySendButton) ||
          el.querySelector?.(SEL.legacySendButton) ||
          el.matches?.(SEL.sendControlContainer) ||
          el.querySelector?.(SEL.sendControlContainer)
        ) {
          return !this.getStopControl() && this.hasAssistantMessage();
        }
      }
    }

    if (mutation.type === 'attributes') {
      const target = mutation.target as HTMLElement;

      // 旧版发送按钮从 disabled 恢复为可用，表示生成结束
      if (target.matches?.(SEL.legacySendButton) && !target.hasAttribute('disabled')) {
        return !this.getStopControl() && this.hasAssistantMessage();
      }

      // 新版 aria-label 从「停止」切回「发送」时，也可视作完成。
      if (mutation.attributeName === 'aria-label') {
        const label = target.getAttribute('aria-label') ?? '';
        const isSendLike = /发送|send/i.test(label);
        const isStopLike = /停止|stop/i.test(label);
        if (isSendLike && !isStopLike) {
          return !this.getStopControl() && this.hasAssistantMessage();
        }
      }
    }

    return false;
  }

  /**
   * 开始检测：新的 .chat-assistant 容器被添加，说明 AI 开始回复。
   */
  isGenerationStarted(mutation: MutationRecord): boolean {
    if (mutation.type === 'childList') {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (this.isDtOwnedNode(node)) continue;
        const el = node as HTMLElement;
        if (
          el.matches?.(SEL.chatAssistant) ||
          el.querySelector?.(SEL.chatAssistant) ||
          el.matches?.(SEL.stopControlContainer) ||
          el.querySelector?.(SEL.stopControlContainer)
        ) {
          return true;
        }
      }
    }

    if (mutation.type === 'attributes' && mutation.attributeName === 'aria-label') {
      const target = mutation.target as HTMLElement;
      const label = target.getAttribute('aria-label') ?? '';
      if (/停止|stop/i.test(label)) {
        return true;
      }
    }

    return false;
  }

  /**
   * UI 重注入检测：输入框 #chat-input 或 .flagsContainer 被重新插入时，
   * 说明 Svelte 路由切换重建了输入区，需要重新注入工具栏按钮。
   */
  shouldReinjectUI(mutations: MutationRecord[]): boolean {
    for (const mutation of mutations) {
      if (mutation.type !== 'childList') continue;
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (this.isDtOwnedNode(node)) continue;
        const el = node as HTMLElement;
        if (
          el.matches?.(`${SEL.editor}, ${SEL.flagsContainer}`) ||
          el.querySelector?.(`${SEL.editor}, ${SEL.flagsContainer}`)
        ) {
          return true;
        }
      }
    }
    return false;
  }
}
