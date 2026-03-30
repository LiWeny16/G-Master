import { ISiteAdapter } from './site-adapter';

/**
 * DeepSeek（chat.deepseek.com）站点适配器。
 *
 * DOM 关键选择器（基于 2026-03 版 DOM 快照）。
 * 所有 class 名称集中于顶部 SEL / CONST 对象，以便 UI 变更时快速修改。
 *
 * 输入框：          textarea._27c9245
 * 发送 / 停止按钮：  ._7436101
 *   - 生成中（停止）：无 .ds-icon-button--disabled，SVG path 以 stopSvgPathPrefix 开头
 *   - 禁用 / 待机：  有 .bcc55ca1 + .ds-icon-button--disabled，SVG path 为上箭头
 * 用户消息外层：     ._9663006（含 data-virtual-list-item-key）
 * 用户消息文本：     ._9663006 .fbb737a4
 * AI 消息外层：      ._4f9bf79._43c05b5
 * AI 消息 markdown： ._4f9bf79 .ds-markdown
 * 输入工具栏：       .ec4f5d61（DT 按钮注入点）
 */

// ─────────────────────── 选择器（UI 变更时只改这里）───────────────────────
const SEL = {
  textarea:        'textarea._27c9245',
  sendBtn:         '._7436101',
  sendBtnActive:   '._7436101:not(.ds-icon-button--disabled)',
  sendBtnDisabled: '._7436101.ds-icon-button--disabled',
  userMessage:     '._9663006',
  userMessageText: '._9663006 .fbb737a4',
  aiMessage:       '._4f9bf79',
  aiMarkdown:      '._4f9bf79 .ds-markdown',
  inputToolbar:    '.ec4f5d61',
} as const;

// ─────────────────── 非选择器常量（SVG 特征、class 片段等）────────────────
const CONST = {
  /** 生成中停止按钮的方形图标 SVG path d 属性开头特征 */
  stopSvgPathPrefix: 'M2 4.88',
  /** 禁用状态额外 class */
  disabledClass: 'ds-icon-button--disabled',
} as const;

export class DeepSeekAdapter implements ISiteAdapter {
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
    return document.querySelector(SEL.sendBtn);
  }

  isGenerating(): boolean {
    const btn = document.querySelector<HTMLElement>(SEL.sendBtn);
    if (!btn) return false;
    if (btn.classList.contains(CONST.disabledClass)) return false;
    // 方形停止图标 → 正在生成
    const path = btn.querySelector('path');
    return path?.getAttribute('d')?.startsWith(CONST.stopSvgPathPrefix) ?? false;
  }

  stopGeneration(): void {
    const btn = document.querySelector<HTMLElement>(SEL.sendBtnActive);
    if (!btn) return;
    btn.setAttribute('data-dt-auto-stop', '1');
    btn.click();
    window.setTimeout(() => btn.removeAttribute('data-dt-auto-stop'), 0);
  }

  getLastResponseText(): string {
    const msgs = document.querySelectorAll(SEL.aiMarkdown);
    return msgs.length > 0 ? (msgs[msgs.length - 1] as HTMLElement).innerText : '';
  }

  /**
   * React 受控 textarea：使用 native setter 写入全量文本后触发发送。
   */
  async insertTextAndSend(text: string): Promise<void> {
    const textarea = document.querySelector<HTMLTextAreaElement>(SEL.textarea);
    if (!textarea) return;

    this._setTextareaValue(textarea, text);
    await new Promise<void>((r) => setTimeout(r, 150));
    this._triggerSend(textarea);
  }

  /**
   * 将文本追加到当前输入内容之后并触发发送。
   */
  async appendTextAndSend(textToAppend: string): Promise<void> {
    const textarea = document.querySelector<HTMLTextAreaElement>(SEL.textarea);
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
    const btn = target.closest<HTMLElement>(SEL.sendBtn);
    if (!btn) return false;
    // 禁用状态不算发送按钮
    if (btn.classList.contains(CONST.disabledClass)) return false;
    // 生成中（停止图标）也不算发送按钮
    const path = btn.querySelector('path');
    if (path?.getAttribute('d')?.startsWith(CONST.stopSvgPathPrefix)) return false;
    return true;
  }

  isStopButton(target: HTMLElement): boolean {
    const btn = target.closest<HTMLElement>(SEL.sendBtn);
    if (!btn) return false;
    if (btn.classList.contains(CONST.disabledClass)) return false;
    const path = btn.querySelector('path');
    return path?.getAttribute('d')?.startsWith(CONST.stopSvgPathPrefix) ?? false;
  }

  getUserBubbles(): NodeListOf<Element> {
    return document.querySelectorAll(SEL.userMessage);
  }

  getResponseMessages(): NodeListOf<Element> {
    return document.querySelectorAll(SEL.aiMessage);
  }

  getObserverConfig(): { target: Node; options: MutationObserverInit } {
    return {
      target: document.body,
      options: {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'aria-disabled'],
      },
    };
  }

  /**
   * 生成完成：发送按钮 class 变化后含 ds-icon-button--disabled，且之前不含。
   */
  isGenerationComplete(mutation: MutationRecord): boolean {
    if (mutation.type !== 'attributes' || mutation.attributeName !== 'class') return false;
    const el = mutation.target as HTMLElement;
    if (!el.matches?.(SEL.sendBtn)) return false;
    const nowDisabled  = el.classList.contains(CONST.disabledClass);
    const wasDisabled  = (mutation.oldValue ?? '').includes(CONST.disabledClass);
    return nowDisabled && !wasDisabled;
  }

  /**
   * 生成开始：虚拟列表新增了 AI 消息容器节点。
   */
  isGenerationStarted(mutation: MutationRecord): boolean {
    for (const node of mutation.addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      if (this.isDtOwnedNode(node)) continue;
      const el = node as HTMLElement;
      if (el.matches?.(SEL.aiMessage) || el.querySelector?.(SEL.aiMessage)) return true;
    }
    return false;
  }

  /**
   * DeepSeek 是 React SPA，浮球由 React 管理，不需要重新注入。
   * 工具栏重建由 useDeepseekInlineToggle 内部的 MutationObserver 处理。
   */
  shouldReinjectUI(_mutations: MutationRecord[]): boolean {
    return false;
  }

  // ── 私有工具方法 ──────────────────────────────────────────────────────────

  /**
   * 使用 React 内部 native setter 更新受控 textarea，再派发 input/change 事件。
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
    textarea.dispatchEvent(new Event('input',  { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * 优先点击活跃的发送按钮；若找不到则在 textarea 上模拟 Enter 键。
   */
  private _triggerSend(textarea: HTMLTextAreaElement): void {
    const btn = document.querySelector<HTMLElement>(SEL.sendBtnActive);
    if (btn) {
      btn.click();
      return;
    }
    textarea.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
      }),
    );
  }
}
