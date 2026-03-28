import { ISiteAdapter } from '../adapters/site-adapter';
import { StateStore } from '../stores/state-store';
import { parseIntentJson } from './parsers';

export class DOMBeautifier {
  private domBusy = false;
  private copyCleanerInstalled = false;
  private pendingCopyText: string | null = null;

  constructor(
    private adapter: ISiteAdapter,
    private store: StateStore,
  ) { }

  isDomBusy(): boolean {
    return this.domBusy;
  }

  process(): void {
    if (this.domBusy) return;
    this.domBusy = true;
    try {
      this.ensureCopyCleaner();
      this.processUserBubbles();
      this.processResponseMarkers();
    } finally {
      setTimeout(() => { this.domBusy = false; }, 100);
    }
  }

  private ensureCopyCleaner(): void {
    if (this.copyCleanerInstalled) return;
    document.addEventListener('pointerdown', this.handleCopyPointerDown, true);
    document.addEventListener('copy', this.handleCopy, true);
    document.addEventListener('click', this.handleCopyButtonClick, true);
    this.copyCleanerInstalled = true;
  }

  private readonly handleCopyPointerDown = (ev: PointerEvent): void => {
    const trigger = this.findCopyTrigger(ev.target as Element | null);
    if (!trigger) {
      this.pendingCopyText = null;
      return;
    }
    const raw = this.extractTurnRawText(trigger);
    const cleaned = raw ? this.sanitizeSpecialText(raw) : '';
    this.pendingCopyText = cleaned || null;
  };

  private readonly handleCopyButtonClick = (ev: MouseEvent): void => {
    const trigger = this.findCopyTrigger(ev.target as Element | null);
    if (!trigger) return;

    const cleaned = this.pendingCopyText ?? this.sanitizeSpecialText(this.extractTurnRawText(trigger));
    if (!cleaned) return;

    // 拦截站点默认复制，改用净化文本写入剪贴板。
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();
    this.writeClipboardWithRetry(cleaned);
    this.pendingCopyText = null;
  };

  private findCopyTrigger(target: Element | null): HTMLElement | null {
    if (!target) return null;
    const btn = target.closest('button, [role="button"]') as HTMLElement | null;
    if (btn && this.isLikelyCopyButton(btn)) return btn;

    const hinted = target.closest('[mattooltip], [aria-label], [title]') as HTMLElement | null;
    if (hinted && this.isLikelyCopyButton(hinted)) return hinted;

    return null;
  }

  private isLikelyCopyButton(btn: HTMLElement): boolean {
    const text = [
      btn.getAttribute('aria-label') ?? '',
      btn.getAttribute('mattooltip') ?? '',
      btn.getAttribute('title') ?? '',
      btn.textContent ?? '',
    ].join(' ').toLowerCase();

    if (/\bcopy\b|复制/.test(text)) return true;

    const hasCopyIcon = Boolean(
      btn.querySelector('[data-mat-icon-name="content_copy"], [fonticon="content_copy"]'),
    );
    return hasCopyIcon;
  }

  private extractTurnRawText(source: HTMLElement): string {
    const turn = source.closest('[data-turn-id], .user-query-bubble-with-background, structured-content-container') as HTMLElement | null;
    if (!turn) return '';

    const query = turn.querySelector('.query-text') as HTMLElement | null;
    if (query) return query.innerText || query.textContent || '';

    const msg = turn.querySelector('message-content .markdown, message-content') as HTMLElement | null;
    if (msg) return msg.innerText || msg.textContent || '';

    return turn.innerText || turn.textContent || '';
  }

  private async writeClipboard(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // ignore and fallback below
    }

    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', 'true');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    ta.style.pointerEvents = 'none';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }

  private writeClipboardWithRetry(text: string): void {
    void this.writeClipboard(text);
    setTimeout(() => { void this.writeClipboard(text); }, 0);
    setTimeout(() => { void this.writeClipboard(text); }, 80);
    setTimeout(() => { void this.writeClipboard(text); }, 240);
  }

  private readonly handleCopy = (ev: ClipboardEvent): void => {
    const selected = window.getSelection()?.toString();
    if (!selected || !ev.clipboardData) return;

    const cleaned = this.sanitizeSpecialText(selected);
    if (!cleaned || cleaned === selected) return;

    ev.preventDefault();
    ev.clipboardData.setData('text/plain', cleaned);
  };

  private sanitizeSpecialText(text: string): string {
    const { continueMarker, finishMarker } = this.store.config.markers;
    const out: string[] = [];
    let inAutoBlock = false;
    let inClarifyBlock = false;

    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();

      if (trimmed === '[CLARIFY]') {
        inClarifyBlock = true;
        continue;
      }
      if (inClarifyBlock) {
        if (trimmed === '[/CLARIFY]') inClarifyBlock = false;
        continue;
      }

      if (trimmed.includes('[G-Master AUTO 决策]') || trimmed.includes('[G-Master AUTO Decision]')) {
        inAutoBlock = true;
        continue;
      }

      if (inAutoBlock) {
        if (trimmed.startsWith('用户消息：') || trimmed.startsWith('User Message:')) {
          const userPart = trimmed.replace(/^(用户消息：|User Message:\s*)/, '');
          if (userPart) out.push(userPart);
          inAutoBlock = false;
        }
        continue;
      }

      if (trimmed.includes('⟪DT:')) continue;
      if (trimmed.includes('[NEXT_PROMPT:')) continue;
      if (/^🧭\s*AUTO\s*(决策|Decision)[:：]/.test(trimmed)) continue;
      if (/^AUTO\s*(决策|Decision)[:：]/.test(trimmed)) continue;
      if (/^(进入深度模式|Entering deep mode)[。!！…\s]*$/.test(trimmed)) continue;
      if (parseIntentJson(trimmed)) continue;

      let clean = line;
      clean = clean.split(continueMarker).join('');
      clean = clean.split(finishMarker).join('');
      out.push(clean);
    }

    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  private processUserBubbles(): void {
    const dtPattern = new RegExp(this.store.config.markers.dtMarkerPattern);
    this.adapter.getUserBubbles().forEach((qt) => {
      const el = qt as HTMLElement;
      if (el.dataset.dtDone === '1') return;

      const fullText = el.innerText;
      const hasAutoDecisionMarker = fullText.includes('[G-Master AUTO 决策]') || fullText.includes('[G-Master AUTO Decision]');
      const hasMemoryInjection = fullText.includes('【用户设定的全局记忆') || fullText.includes('[User Pinned Memories');
      const m = fullText.match(dtPattern);

      if (!m && !hasAutoDecisionMarker && !hasMemoryInjection) return;

      const autoLabel = this.store.config.language === 'en' ? 'AUTO Decision' : 'AUTO 决策';
      const label = m ? m[1] : (hasAutoDecisionMarker ? autoLabel : null);
      const lines = el.querySelectorAll('.query-text-line');
      let foundMarker = false;
      let inAutoBlock = false;
      let inMemoryBlock = false;
      let hasUserContent = false;
      const memoryTitles: string[] = [];

      for (const line of lines) {
        const raw = line.textContent ?? '';
        const t = raw.trim();

        if (raw.includes('⟪DT:')) foundMarker = true;
        if (raw.includes('[G-Master AUTO 决策]') || raw.includes('[G-Master AUTO Decision]')) {
          inAutoBlock = true;
          line.classList.add('dt-hidden');
          continue;
        }
        if (raw.includes('【用户设定的全局记忆') || raw.includes('[User Pinned Memories')) {
          inMemoryBlock = true;
          line.classList.add('dt-hidden');
          continue;
        }

        if (inAutoBlock) {
          if (t.startsWith('用户消息：') || t.startsWith('User Message:')) {
            const userPart = t.replace(/^(用户消息：|User Message:\s*)/, '');
            if (userPart) {
              line.textContent = userPart;
              line.classList.remove('dt-hidden');
              hasUserContent = true;
            } else {
              line.classList.add('dt-hidden');
            }
            inAutoBlock = false;
            continue;
          }
          line.classList.add('dt-hidden');
          continue;
        }

        if (inMemoryBlock) {
          // 在记忆块中，如果有空行或遇到下一个指令块，可以跳出？
          // 通常提取 `[标题]:` 来做 UI Tag
          const matchTitle = t.match(/^\[(.*?)\]:/);
          if (matchTitle) {
            memoryTitles.push(matchTitle[1]);
          }

          if (foundMarker && (t.startsWith('[系统指令]') || t.startsWith('[System Directive]'))) {
            inMemoryBlock = false; // 回到系统指令隐藏模式
            line.classList.add('dt-hidden');
            continue;
          }

          if (t.includes('⟪DT:')) {
            inMemoryBlock = false;
            foundMarker = true;
          }

          line.classList.add('dt-hidden');
          continue;
        }

        if (foundMarker) {
          line.classList.add('dt-hidden');
        } else if (t) {
          hasUserContent = true;
        }
      }

      if (!hasUserContent) {
        lines.forEach((l) => l.classList.add('dt-hidden'));
        const bubble = el.closest('.user-query-bubble-with-background');
        if (bubble) bubble.classList.add('dt-auto-bubble');
      }

      const tagContainer = document.createElement('div');
      tagContainer.className = 'dt-bubble-tags';
      tagContainer.style.display = 'flex';
      tagContainer.style.flexWrap = 'wrap';
      tagContainer.style.gap = '6px';
      tagContainer.style.marginTop = '6px';

      // 主流程标签
      if (label) {
        let cls = 'dt-tag-green';
        if (label.includes('总结') || label.includes('Summary')) cls = 'dt-tag-blue';
        if (label.includes('纠偏') || label.includes('警告') || label.includes('Correction') || label.includes('Warning')) cls = 'dt-tag-orange';
        if (label.includes('AUTO')) cls = 'dt-tag-blue';

        const tag = document.createElement('div');
        tag.className = 'dt-bubble-tag dt-flow-tag';
        tag.innerHTML = `<span class="dt-tag ${cls}">${label}</span>`;
        tagContainer.appendChild(tag);
      }

      // 记忆标签
      if (memoryTitles.length > 0) {
        memoryTitles.forEach(title => {
          const memTag = document.createElement('div');
          memTag.className = 'dt-bubble-tag dt-mem-tag';
          // 使用稍微低饱和的棕色表示常驻记忆
          memTag.innerHTML = `
            <span class="dt-tag" style="background: rgba(139,115,85,0.06); color: #8B7355; border: 1px dashed rgba(139,115,85,0.3); opacity: 0.9;">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: -2px; opacity: 0.7;">
                <path d="M12 17v5"/><path d="M9 10.74a2 2 0 1 0-3.32-1.48 2 2 0 0 0 3.32 1.48z"/><path d="M15 10.74a2 2 0 1 0-3.32-1.48 2 2 0 0 0 3.32 1.48z"/><path d="M12 17a5 5 0 0 0 5-5V9a5 5 0 0 0-10 0v3a5 5 0 0 0 5 5z"/>
              </svg>
              ${title}
            </span>`;
          tagContainer.appendChild(memTag);
        });
      }

      if (tagContainer.childElementCount > 0) {
        el.appendChild(tagContainer);
      }

      el.dataset.dtDone = '1';
    });
  }

  private processResponseMarkers(): void {
    // 不再完全跳过 isGenerating，而是在生成中也进行基本清理（隐藏 JSON 行等）
    const isStillGenerating = this.store.isGenerating;

    const { continueMarker, finishMarker } = this.store.config.markers;

    this.adapter.getResponseMessages().forEach((msg) => {
      const el = msg as HTMLElement;
      if (el.dataset.dtDone === '1') return;

      const text = el.innerText;
      const hasContinue = text.includes(continueMarker);
      const hasFinish = text.includes(finishMarker);
      const hasNextPrompt = text.includes('[NEXT_PROMPT:');
      const intentInfo = text
        .split(/\r?\n/)
        .map((line) => parseIntentJson(line))
        .find((v): v is { route: 'direct' | 'deep'; deep_loops: number; needs_web: boolean; needs_files: boolean; needs_code: boolean; summary: string } => Boolean(v));

      if (!hasContinue && !hasFinish && !hasNextPrompt && !intentInfo) return;

      // 移除旧 badge
      el.querySelectorAll('.dt-resp-badge').forEach((b) => b.remove());

      // 遍历文本节点，删除标记文本
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const textNodes: Text[] = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode as Text);

      for (const node of textNodes) {
        if ((node as unknown as HTMLElement).closest?.('.dt-resp-badge')) continue;
        const lines = (node.textContent ?? '').split(/\r?\n/);
        let t = lines
          .filter((line) => {
            const trimmed = line.trim();
            if (!trimmed) return true;
            // 过滤意图 JSON 行
            if (parseIntentJson(trimmed)) return false;
            // 过滤 AUTO 决策标签行
            if (/^🧭\s*AUTO\s*(决策|Decision)[:：]/.test(trimmed)) return false;
            if (/^AUTO\s*(决策|Decision)[:：]/.test(trimmed)) return false;
            // 过滤进入深度模式的提示文字
            if (/^(进入深度模式|Entering deep mode)/.test(trimmed)) return false;
            // 过滤 "进入深度模式执行搜索与分析" 等变体
            if (/(深度模式|deep mode).*[。!！…]*$/.test(trimmed) && trimmed.length < 50) return false;
            return true;
          })
          .join('\n');
        let changed = false;
        if (t.includes(continueMarker)) { t = t.replace(continueMarker, ''); changed = true; }
        if (t.includes(finishMarker)) { t = t.replace(finishMarker, ''); changed = true; }
        if (lines.length !== t.split(/\r?\n/).length) changed = true;
        if (changed) node.textContent = t;
      }

      // 隐藏 NEXT_PROMPT 段落和其他标记
      el.querySelectorAll('p, li, span').forEach((child) => {
        if ((child as HTMLElement).closest?.('.dt-resp-badge')) return;
        const ct = (child.textContent ?? '').trim();
        if (ct.includes('[NEXT_PROMPT:')) {
          child.classList.add('dt-hidden');
        }
        if (/^(进入深度模式|Entering deep mode)/.test(ct) && ct.length < 50) {
          child.classList.add('dt-hidden');
        }
        if (/(深度模式|deep mode).*[搜索|分析|综合|search|analy|synthe]/.test(ct) && ct.length < 60) {
          child.classList.add('dt-hidden');
        }
        if (/^🧭\s*AUTO\s*(决策|Decision)[:：]/.test(ct)) {
          child.classList.add('dt-hidden');
        }
        if (/^AUTO\s*(决策|Decision)[:：]/.test(ct)) {
          child.classList.add('dt-hidden');
        }
        // 隐藏意图 JSON 行显示在 p/span 中的情况
        if (parseIntentJson(ct)) {
          child.classList.add('dt-hidden');
        }
      });

      // 移除末尾空白段落
      const children = Array.from(el.children);
      for (let i = children.length - 1; i >= 0; i--) {
        const c = children[i] as HTMLElement;
        if (c.classList?.contains('dt-resp-badge')) continue;
        if (c.textContent?.trim() === '' && !c.querySelector('img,table,pre,code')) {
          c.classList.add('dt-hidden');
        } else {
          break;
        }
      }

      // 在生成完毕后（!isStillGenerating），彻底隐藏或过滤 [CLARIFY] 块
      if (!isStillGenerating) {
        let hidingClarify = false;
        el.querySelectorAll('p, li, span, pre, code').forEach((child) => {
          if ((child as HTMLElement).closest?.('.dt-resp-badge')) return;
          const ct = (child.textContent ?? '').trim();

          if (ct.includes('[CLARIFY]')) hidingClarify = true;

          if (hidingClarify) {
            child.classList.add('dt-hidden');
            if (ct.includes('[/CLARIFY]')) hidingClarify = false;
          }
        });

        // 原本的 注入可视化徽章 逻辑
        const badge = document.createElement('div');
        if (hasContinue) {
          badge.className = 'dt-resp-badge dt-badge-think';
          badge.textContent = this.store.config.language === 'en'
            ? `🔄 Continuing deep think · Round ${this.store.currentLoop}`
            : `🔄 继续深入思考 · 第 ${this.store.currentLoop} 轮`;
          el.appendChild(badge);
        } else if (hasFinish) {
          badge.className = 'dt-resp-badge dt-badge-done';
          badge.textContent = this.store.config.language === 'en'
            ? '✅ Deep think complete · Generating final summary...'
            : '✅ 深度思考完成 · 正在生成最终总结...';
          el.appendChild(badge);
        } else if (intentInfo) {
          badge.className = 'dt-resp-badge dt-badge-final';
          if (this.store.config.language === 'en') {
            badge.textContent = intentInfo.route === 'deep'
              ? `🧭 AUTO Decision: Entering deep mode${intentInfo.summary ? ` · ${intentInfo.summary}` : ''}`
              : `🧭 AUTO Decision: Direct answer${intentInfo.summary ? ` · ${intentInfo.summary}` : ''}`;
          } else {
            badge.textContent = intentInfo.route === 'deep'
              ? `🧭 AUTO 决策：进入深度模式${intentInfo.summary ? ` · ${intentInfo.summary}` : ''}`
              : `🧭 AUTO 决策：直接回答${intentInfo.summary ? ` · ${intentInfo.summary}` : ''}`;
          }
          el.appendChild(badge);
        }
      }

      el.dataset.dtDone = isStillGenerating ? '0' : '1';
    });
  }
}
