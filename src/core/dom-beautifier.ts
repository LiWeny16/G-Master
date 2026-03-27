import { ISiteAdapter } from '../adapters/site-adapter';
import { StateStore } from '../stores/state-store';

export class DOMBeautifier {
  private domBusy = false;
  private copyCleanerInstalled = false;
  private pendingCopyText: string | null = null;

  constructor(
    private adapter: ISiteAdapter,
    private store: StateStore,
  ) {}

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

  private parseIntentJsonLine(line: string): { route: 'direct' | 'deep'; summary: string } | null {
    const t = line.trim();
    if (!t.startsWith('{') || !t.endsWith('}')) return null;
    if (!t.includes('"route"') || !t.includes('"deep_loops"') || !t.includes('"summary"')) return null;
    try {
      const raw = JSON.parse(t) as Record<string, unknown>;
      const route = raw.route === 'deep' ? 'deep' : raw.route === 'direct' ? 'direct' : null;
      if (!route) return null;
      const loops = typeof raw.deep_loops === 'number' ? raw.deep_loops : Number(raw.deep_loops);
      if (!Number.isFinite(loops)) return null;
      return {
        route,
        summary: typeof raw.summary === 'string' ? raw.summary : '',
      };
    } catch {
      return null;
    }
  }

  private sanitizeSpecialText(text: string): string {
    const { continueMarker, finishMarker } = this.store.config.markers;
    const out: string[] = [];
    let inAutoBlock = false;

    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();

      if (trimmed.includes('[G-Master AUTO 决策]')) {
        inAutoBlock = true;
        continue;
      }

      if (inAutoBlock) {
        if (trimmed.startsWith('用户消息：')) {
          const userPart = trimmed.replace(/^用户消息：\s*/, '');
          if (userPart) out.push(userPart);
          inAutoBlock = false;
        }
        continue;
      }

      if (trimmed.includes('⟪DT:')) continue;
      if (trimmed.includes('[NEXT_PROMPT:')) continue;
      if (/^🧭\s*AUTO\s*决策[:：]/.test(trimmed)) continue;
      if (/^AUTO\s*决策[:：]/.test(trimmed)) continue;
      if (/^进入深度模式[。!！…\s]*$/.test(trimmed)) continue;
      if (this.parseIntentJsonLine(trimmed)) continue;

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
      const hasAutoDecisionMarker = fullText.includes('[G-Master AUTO 决策]');
      const m = fullText.match(dtPattern);
      if (!m && !hasAutoDecisionMarker) return;

      const label = m ? m[1] : 'AUTO 决策';
      const lines = el.querySelectorAll('.query-text-line');
      let foundMarker = false;
      let inAutoBlock = false;
      let hasUserContent = false;

      for (const line of lines) {
        const raw = line.textContent ?? '';
        const t = raw.trim();

        if (raw.includes('⟪DT:')) foundMarker = true;
        if (raw.includes('[G-Master AUTO 决策]')) {
          inAutoBlock = true;
          line.classList.add('dt-hidden');
          continue;
        }

        if (inAutoBlock) {
          if (t.startsWith('用户消息：')) {
            const userPart = t.replace(/^用户消息：\s*/, '');
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

      // 颜色映射
      let cls = 'dt-tag-green';
      if (label.includes('总结')) cls = 'dt-tag-blue';
      if (label.includes('纠偏') || label.includes('警告')) cls = 'dt-tag-orange';
      if (label.includes('AUTO')) cls = 'dt-tag-blue';

      const tag = document.createElement('div');
      tag.className = 'dt-bubble-tag';
      tag.innerHTML = `<span class="dt-tag ${cls}">${label}</span>`;
      el.appendChild(tag);
      el.dataset.dtDone = '1';
    });
  }

  private processResponseMarkers(): void {
    if (this.store.isGenerating) return;

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
        .map((line) => this.parseIntentJsonLine(line))
        .find((v): v is { route: 'direct' | 'deep'; summary: string } => Boolean(v));

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
            if (this.parseIntentJsonLine(trimmed)) return false;
            if (intentInfo && /^🧭\s*AUTO\s*决策[:：]/.test(trimmed)) return false;
            if (intentInfo && /^AUTO\s*决策[:：]/.test(trimmed)) return false;
            if (intentInfo?.route === 'deep' && /^进入深度模式[。!！…\s]*$/.test(trimmed)) return false;
            return true;
          })
          .join('\n');
        let changed = false;
        if (t.includes(continueMarker)) { t = t.replace(continueMarker, ''); changed = true; }
        if (t.includes(finishMarker)) { t = t.replace(finishMarker, ''); changed = true; }
        if (lines.length !== t.split(/\r?\n/).length) changed = true;
        if (changed) node.textContent = t;
      }

      // 隐藏 NEXT_PROMPT 段落
      el.querySelectorAll('p, li, span').forEach((child) => {
        if ((child as HTMLElement).closest?.('.dt-resp-badge')) return;
        if (child.textContent?.includes('[NEXT_PROMPT:')) {
          child.classList.add('dt-hidden');
        }
        if (intentInfo?.route === 'deep' && /^进入深度模式[。!！…\s]*$/.test((child.textContent ?? '').trim())) {
          child.classList.add('dt-hidden');
        }
        if (/^🧭\s*AUTO\s*决策[:：]/.test((child.textContent ?? '').trim())) {
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

      // 注入可视化徽章
      const badge = document.createElement('div');
      if (hasContinue) {
        badge.className = 'dt-resp-badge dt-badge-think';
        badge.textContent = `🔄 继续深入思考 · 第 ${this.store.currentLoop} 轮`;
        el.appendChild(badge);
      } else if (hasFinish) {
        badge.className = 'dt-resp-badge dt-badge-done';
        badge.textContent = '✅ 深度思考完成 · 正在生成最终总结...';
        el.appendChild(badge);
      } else if (intentInfo) {
        badge.className = 'dt-resp-badge dt-badge-final';
        badge.textContent =
          intentInfo.route === 'deep'
            ? `🧭 AUTO 决策：进入深度模式${intentInfo.summary ? ` · ${intentInfo.summary}` : ''}`
            : `🧭 AUTO 决策：直接回答${intentInfo.summary ? ` · ${intentInfo.summary}` : ''}`;
        el.appendChild(badge);
      }

      el.dataset.dtDone = '1';
    });
  }
}
