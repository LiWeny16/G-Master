import { ISiteAdapter } from '../adapters/site-adapter';
import { StateStore } from '../stores/state-store';
import {
  CLARIFY_TAG,
  NEXT_PROMPT_TAG,
  ROUTER_TAG,
  extractTaggedPayload,
  parseClarifyBlock,
  parseIntentJson,
  parseTagBoundary,
  removeTaggedBlock,
} from './parsers';
import { parseToolCalls, stripToolCallsFromText } from './tool-call-parser';

// ── Tool Call Card 渲染助手 ──

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getExtClass(filename: string): string {
  const ext = (filename.split('.').pop() ?? '').toLowerCase();
  const known: Record<string, string> = {
    ts: 'ts', tsx: 'tsx', js: 'js', jsx: 'jsx',
    css: 'css', scss: 'scss', html: 'html', json: 'json',
    md: 'md', mdx: 'mdx', py: 'py', go: 'go', rs: 'rs',
  };
  return `dt-ext-${known[ext] ?? 'other'}`;
}

function mkSvg(paths: string, size = 12): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

const IC_FOLDER = `<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>`;
const IC_FILE  = `<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>`;
const IC_SEARCH = `<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>`;
const IC_GLOBE  = `<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>`;

function mkFileChip(filePath: string): HTMLElement {
  const name = filePath.replace(/\\/g, '/').split('/').pop() ?? filePath;
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  const chip = document.createElement('span');
  chip.className = 'dt-tool-call-chip';
  chip.innerHTML = `${mkSvg(IC_FILE)}<span class="dt-file-ext ${getExtClass(name)}">${escHtml(ext || '?')}</span><span class="dt-tool-chip-text">${escHtml(name)}</span>`;
  return chip;
}

function buildToolCallCard(
  name: string,
  args: Record<string, unknown>,
  lang: 'zh' | 'en',
): HTMLElement {
  const row = document.createElement('span');
  row.className = 'dt-tool-call-row';
  row.dataset.dtToolCard = '1';

  if (name === 'list_directory') {
    const path = typeof args.path === 'string' ? args.path : '.';
    const chip = document.createElement('span');
    chip.className = 'dt-tool-call-chip';
    const label = lang === 'en' ? 'Browse' : '浏览目录';
    chip.innerHTML = `${mkSvg(IC_FOLDER)}<span class="dt-tool-chip-label">${label}</span><span class="dt-tool-chip-text">${escHtml(path)}</span>`;
    row.appendChild(chip);
  } else if (name === 'read_file' || name === 'read_local_file') {
    const path = typeof args.path === 'string' ? args.path : '';
    row.appendChild(mkFileChip(path));
  } else if (name === 'read_files') {
    const paths = (Array.isArray(args.paths) ? args.paths : []).filter((p): p is string => typeof p === 'string');
    for (const p of paths.slice(0, 8)) row.appendChild(mkFileChip(p));
    if (paths.length > 8) {
      const more = document.createElement('span');
      more.className = 'dt-tool-call-chip';
      more.textContent = `+${paths.length - 8}`;
      row.appendChild(more);
    }
  } else if (name === 'search_files') {
    const pattern = typeof args.pattern === 'string' ? args.pattern : '*';
    const chip = document.createElement('span');
    chip.className = 'dt-tool-call-chip';
    const label = lang === 'en' ? 'Search files' : '搜索文件';
    chip.innerHTML = `${mkSvg(IC_SEARCH)}<span class="dt-tool-chip-label">${label}</span><span class="dt-tool-chip-text">${escHtml(pattern)}</span>`;
    row.appendChild(chip);
  } else if (name === 'web_search') {
    const query = typeof args.query === 'string' ? args.query : '';
    const display = query.length > 60 ? query.slice(0, 60) + '…' : query;
    const chip = document.createElement('span');
    chip.className = 'dt-tool-call-chip';
    const label = lang === 'en' ? 'Web search' : '联网搜索';
    chip.innerHTML = `${mkSvg(IC_GLOBE)}<span class="dt-tool-chip-label">${label}</span><span class="dt-tool-chip-text">${escHtml(display)}</span>`;
    row.appendChild(chip);
  } else if (name === 'edit_file') {
    const path = typeof args.path === 'string' ? args.path : '';
    const fileName = path.replace(/\\/g, '/').split('/').pop() ?? path;
    const chip = document.createElement('span');
    chip.className = 'dt-tool-call-chip dt-tool-edit-chip';
    const IC_EDIT = `<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>`;
    chip.innerHTML = `${mkSvg(IC_EDIT)}<span class="dt-file-ext ${getExtClass(fileName)}">${escHtml(fileName.split('.').pop() || '?')}</span><span class="dt-tool-chip-text">${escHtml(path)}</span>`;
    row.appendChild(chip);
  } else if (name === 'create_file') {
    const path = typeof args.path === 'string' ? args.path : '';
    const fileName = path.replace(/\\/g, '/').split('/').pop() ?? path;
    const chip = document.createElement('span');
    chip.className = 'dt-tool-call-chip dt-tool-create-chip';
    const IC_PLUS = `<path d="M5 12h14"/><path d="M12 5v14"/>`;
    chip.innerHTML = `${mkSvg(IC_PLUS)}<span class="dt-file-ext ${getExtClass(fileName)}">${escHtml(fileName.split('.').pop() || '?')}</span><span class="dt-tool-chip-text">${escHtml(path)}</span>`;
    row.appendChild(chip);
  } else {
    const chip = document.createElement('span');
    chip.className = 'dt-tool-call-chip';
    chip.innerHTML = `<span class="dt-tool-chip-label">${escHtml(name)}</span>`;
    row.appendChild(chip);
  }
  return row;
}

// 一键开关：关闭后不再把内部标记替换为 UI 标签/徽章，仅保留原始文本显示。
export const ENABLE_MARKER_UI_REPLACEMENT = true;

export class DOMBeautifier {
  private domBusy = false;
  private copyCleanerInstalled = false;
  private pendingCopyText: string | null = null;

  private readonly mountHostSelector = '#response-content-container, .markdown, .response-content, .model-response-text, .markdown-content';

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
      if (!ENABLE_MARKER_UI_REPLACEMENT) return;
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

  private getNodeSignature(text: string): string {
    const head = text.slice(0, 120);
    const tail = text.slice(-120);
    return `${text.length}:${head}:${tail}`;
  }

  /**
   * 从豆包用户气泡的原始文本中提取用户实际输入的内容。
   * - [G-Master AUTO 决策] 格式：取 "用户消息：" 后的文本
   * - DT 标记流格式：取 "用户原始问题：" 后的文本
   * - 纯系统注入消息（无用户文本）：返回 null
   */
  private extractDoubaoUserText(fullText: string): string | null {
    const lines = fullText.split(/\r?\n/);

    // Case A: [G-Master AUTO 决策] / [G-Master AUTO Decision]
    const autoLineIdx = lines.findIndex((l) => {
      const t = l.trim();
      return t.startsWith('[G-Master AUTO 决策]') || t.startsWith('[G-Master AUTO Decision]');
    });
    if (autoLineIdx !== -1) {
      for (let i = autoLineIdx + 1; i < lines.length; i++) {
        const t = lines[i].trim();
        // "用户消息：" 独占一行 → 用户文本在下一非空行
        if (t === '用户消息：' || t === 'User Message:') {
          for (let j = i + 1; j < lines.length; j++) {
            const nt = lines[j].trim();
            if (nt) return nt;
          }
          return null;
        }
        if (t.startsWith('用户消息：')) return t.slice('用户消息：'.length).trim() || null;
        if (t.startsWith('User Message:')) return t.slice('User Message:'.length).trim() || null;
      }
    }

    // Case B: DT 标记流 → 查找 用户原始问题：
    for (const line of lines) {
      const t = line.trim();
      if (t.startsWith('用户原始问题：')) return t.slice('用户原始问题：'.length).trim() || null;
      if (t.startsWith('Original User Query:')) return t.slice('Original User Query:'.length).trim() || null;
    }

    return null;
  }

  /**
   * 从 ChatGPT 用户气泡的原始文本中提取用户实际输入的内容。
   * - [G-Master AUTO 决策] 格式：复用 extractDoubaoUserText 逻辑
   * - ON 模式（系统 Prompt 直接附加）：取 ⟪DT: 标记之前的文本
   * - 仅含记忆注入（无 DT 标记）：取记忆块之前的文本
   * - 纯用户消息（无注入）：返回 null（不做处理）
   */
  private extractChatGPTUserText(fullText: string): string | null {
    // Case 1: AUTO decision / DT marker stream（与豆包格式相同）
    const autoResult = this.extractDoubaoUserText(fullText);
    if (autoResult) return autoResult;

    // Case 2: ON 模式 —— 系统 Prompt 直接追加在用户文本后，以 ⟪DT: 开头
    const dtIdx = fullText.indexOf('⟪DT:');
    if (dtIdx > 0) {
      const userPart = fullText.slice(0, dtIdx).trim();
      if (userPart) return userPart;
    }

    // Case 3: 仅有记忆注入（无系统 Prompt，内存前缀）
    const memZh = fullText.indexOf('[用户设定的全局记忆');
    const memZhLegacy = fullText.indexOf('【用户设定的全局记忆');
    const memEn = fullText.indexOf('[User Pinned Memories');
    const candidates = [memZh, memZhLegacy, memEn].filter((i) => i > 0);
    if (candidates.length > 0) {
      const memIdx = Math.min(...candidates);
      const userPart = fullText.slice(0, memIdx).trim();
      if (userPart) return userPart;
    }

    // 无任何注入标记 → 保持原样不处理
    return null;
  }

  private parseNextPromptText(text: string): string | null {
    const tagged = extractTaggedPayload(text, NEXT_PROMPT_TAG);
    if (tagged) {
      const clean = tagged.trim();
      return clean || null;
    }

    const legacy = text.match(/\[NEXT_PROMPT:\s*([\s\S]*?)\]/i);
    const legacyText = legacy?.[1]?.trim() ?? '';
    return legacyText || null;
  }

  private upsertNextPromptCard(target: HTMLElement, nextPromptText: string | null): void {
    const oldCard = target.querySelector('.dt-next-prompt-card') as HTMLElement | null;
    if (!nextPromptText) {
      if (oldCard) oldCard.remove();
      return;
    }

    const titleText = this.store.config.language === 'en' ? '🧩 Next Prompt' : '🧩 下一步提示';

    if (oldCard) {
      const body = oldCard.querySelector('.dt-next-prompt-body') as HTMLElement | null;
      if (body) body.textContent = nextPromptText;
      return;
    }

    const card = document.createElement('div');
    card.className = 'dt-next-prompt-card';

    const title = document.createElement('div');
    title.className = 'dt-next-prompt-title';
    title.textContent = titleText;

    const body = document.createElement('div');
    body.className = 'dt-next-prompt-body';
    body.textContent = nextPromptText;

    card.appendChild(title);
    card.appendChild(body);
    target.appendChild(card);
  }

  private isMountHostHidden(node: HTMLElement): boolean {
    if (node.classList.contains('dt-hidden')) return true;
    if (node.hasAttribute('hidden')) return true;
    if (node.getAttribute('aria-hidden') === 'true') return true;
    const style = window.getComputedStyle(node);
    return style.display === 'none' || style.visibility === 'hidden';
  }

  private resolveMountHost(responseEl: HTMLElement): HTMLElement {
    const candidates = Array.from(responseEl.querySelectorAll(this.mountHostSelector)) as HTMLElement[];
    const visibleCandidate = candidates.find((node) => !this.isMountHostHidden(node));
    const host = visibleCandidate ?? candidates[0] ?? responseEl;
    if (host.classList.contains('dt-hidden')) {
      host.classList.remove('dt-hidden');
    }
    return host;
  }

  private resolveUiStack(mountHost: HTMLElement): HTMLElement {
    let stack = mountHost.querySelector(':scope > .dt-marker-stack') as HTMLElement | null;
    if (stack) return stack;

    stack = document.createElement('div');
    stack.className = 'dt-marker-stack';
    mountHost.appendChild(stack);
    return stack;
  }

  private sanitizeSpecialText(text: string): string {
    const { continueMarker, finishMarker } = this.store.config.markers;
    const out: string[] = [];
    let inAutoBlock = false;
    let inClarifyBlock = false;
    let inRouterBlock = false;
    let inNextPromptBlock = false;

    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();

      const clarifyBoundary = parseTagBoundary(trimmed, CLARIFY_TAG, inClarifyBlock);
      if (clarifyBoundary.isMarker) {
        inClarifyBlock = clarifyBoundary.nextInBlock;
        continue;
      }
      if (inClarifyBlock) {
        continue;
      }

      const routerBoundary = parseTagBoundary(trimmed, ROUTER_TAG, inRouterBlock);
      if (routerBoundary.isMarker) {
        inRouterBlock = routerBoundary.nextInBlock;
        continue;
      }
      if (inRouterBlock) {
        continue;
      }

      const nextPromptBoundary = parseTagBoundary(trimmed, NEXT_PROMPT_TAG, inNextPromptBlock);
      if (nextPromptBoundary.isMarker) {
        inNextPromptBlock = nextPromptBoundary.nextInBlock;
        continue;
      }
      if (inNextPromptBlock) {
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
      if (/^(进入深度模式|进入问卷模式|Entering deep mode|Entering clarification mode)[。!！…\s]*$/.test(trimmed)) continue;
      if (parseIntentJson(trimmed)) continue;
      // 过滤系统内部通信标记
      if (/\[系统内部[\s—]|\[System Internal[\s—]/.test(trimmed)) continue;
      if (/\[TOOL_RESULT:/.test(trimmed)) continue;
      if (/\[TOOL_CALL:/.test(trimmed)) continue;
      // 过滤动作标记行
      if (/\[ACTION:\s*(THINK_MORE|GOAL_REACHED)\]/.test(trimmed)) continue;
      if (/\[THINK_MORE\]|\[GOAL_REACHED\]/.test(trimmed)) continue;

      let clean = line;
      clean = clean.split(continueMarker).join('');
      clean = clean.split(finishMarker).join('');
      out.push(clean);
    }

    let result = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    // 最终清理：移除可能残留的 [TOOL_CALL: ...] 语法
    result = stripToolCallsFromText(result);
    return result;
  }

  private processUserBubbles(): void {
    const dtPattern = new RegExp(this.store.config.markers.dtMarkerPattern);
    this.adapter.getUserBubbles().forEach((qt) => {
      const el = qt as HTMLElement;
      const fullText = el.innerText;
      const sig = this.getNodeSignature(fullText);
      if (el.dataset.dtDone === '1' && el.dataset.dtSig === sig) return;
      el.dataset.dtSig = sig;

      const hasAutoDecisionMarker = fullText.includes('[G-Master AUTO 决策]') || fullText.includes('[G-Master AUTO Decision]');
      const hasMemoryInjection = fullText.includes('[用户设定的全局记忆') || fullText.includes('【用户设定的全局记忆') || fullText.includes('[User Pinned Memories');
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
        if (raw.includes('[用户设定的全局记忆') || raw.includes('【用户设定的全局记忆') || raw.includes('[User Pinned Memories')) {
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

      // 豆包专用路径：没有 .query-text-line 结构，直接操作 message_text_content
      const textBubble = el.querySelector<HTMLElement>('[data-testid="message_text_content"]');
      if (textBubble && lines.length === 0) {
        const userText = this.extractDoubaoUserText(fullText);
        if (userText) {
          textBubble.textContent = userText;
          hasUserContent = true;
        }
        // else: hasUserContent 保持 false → 下方会隐藏气泡
      }

      // ChatGPT 专用路径：没有 .query-text-line 结构，文本在 .whitespace-pre-wrap 内
      const chatgptBubble = el.querySelector<HTMLElement>('.whitespace-pre-wrap');
      if (chatgptBubble && lines.length === 0 && !textBubble) {
        const userText = this.extractChatGPTUserText(fullText);
        if (userText !== null) {
          chatgptBubble.textContent = userText;
          hasUserContent = true;
        }
        // else: hasUserContent 保持 false → 下方会隐藏气泡
      }

      // DeepSeek 专用路径：没有 .query-text-line 结构，文本在 .fbb737a4 内
      const deepseekBubble = el.querySelector<HTMLElement>('.fbb737a4');
      if (deepseekBubble && lines.length === 0 && !textBubble && !chatgptBubble) {
        const userText = this.extractDoubaoUserText(fullText);
        if (userText !== null) {
          deepseekBubble.textContent = userText;
          hasUserContent = true;
        }
        // else: hasUserContent 保持 false → 下方会隐藏气泡
      }

      // Gemini Enterprise 专用路径：气泡元素在 shadow root 内，文本在 :scope > div > div
      const isEnterpriseEl = el.getRootNode() instanceof ShadowRoot;
      const enterpriseBubble = isEnterpriseEl
        ? el.querySelector<HTMLElement>(':scope > div > div')
        : null;
      if (enterpriseBubble && lines.length === 0 && !textBubble && !chatgptBubble && !deepseekBubble) {
        const userText = this.extractChatGPTUserText(fullText);
        if (userText !== null) {
          enterpriseBubble.textContent = userText;
          hasUserContent = true;
        }
        // else: hasUserContent 保持 false → 下方会隐藏气泡
      }

      if (!hasUserContent) {
        lines.forEach((l) => l.classList.add('dt-hidden'));
        const bubble = el.closest('.user-query-bubble-with-background');
        if (bubble) bubble.classList.add('dt-auto-bubble');
        // 豆包：直接隐藏纯系统注入的文字气泡
        const dbTextBubble = el.querySelector<HTMLElement>('[data-testid="message_text_content"]');
        if (dbTextBubble) dbTextBubble.style.display = 'none';
        // ChatGPT：直接隐藏纯系统注入气泡
        if (chatgptBubble) chatgptBubble.style.display = 'none';
        // DeepSeek：直接隐藏纯系统注入气泡
        if (deepseekBubble) deepseekBubble.style.display = 'none';
        // Gemini Enterprise：直接隐藏纯系统注入气泡
        if (enterpriseBubble) enterpriseBubble.style.display = 'none';
      }

      // 移除旧标签容器，避免重复追加
      el.querySelectorAll('.dt-bubble-tags').forEach((t) => t.remove());

      const tagContainer = document.createElement('div');
      tagContainer.className = 'dt-bubble-tags';
      tagContainer.style.display = 'flex';
      tagContainer.style.flexWrap = 'wrap';
      tagContainer.style.justifyContent = 'flex-end';
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
        // 追加到内层 flex-col 文本容器（避免与外层 flex-row 并排显示）
        const innerCol = el.querySelector('.flex-col') as HTMLElement | null;
        (innerCol ?? el).appendChild(tagContainer);
      }

      el.dataset.dtDone = '1';
      // 在所有 DOM 修改完成后重新计算 sig（包含新追加的标签文字），
      // 确保下次执行时 sig 匹配，guard 生效，避免无限重复处理。
      el.dataset.dtSig = this.getNodeSignature(el.innerText);
    });
  }

  /** 将 edit_file 工具结果标记为 diff 挂载点，供 React DiffBlock 渲染。 */
  private renderEditResultBlocks(responseEl: HTMLElement): void {
    responseEl.querySelectorAll('p, pre, li, div').forEach((child) => {
      const el = child as HTMLElement;
      if (el.dataset.dtEditResult) return;
      if (el.closest('[data-dt-edit-result]')) return;

      const ct = el.textContent ?? '';
      // 匹配 [TOOL_RESULT: edit_file] 或 [TOOL_RESULT: create_file] 或 write_local_file 后跟 JSON
      const editMatch = ct.match(/\[TOOL_RESULT:\s*(?:edit_file|create_file|write_local_file)\]\s*(\{[\s\S]*?\})/);
      if (!editMatch) return;

      try {
        const result = JSON.parse(editMatch[1]);
        if (!result.diff) return;

        // 找到对应的 pendingEdit
        const edits = this.store.pendingEdits;
        const edit = edits.find(e => e.diff === result.diff && e.status === 'applied');
        if (!edit || edit.id === undefined) return;

        // 创建 diff 挂载点
        el.innerHTML = '';
        el.dataset.dtEditResult = '1';
        const mount = document.createElement('div');
        mount.className = 'dt-diff-mount';
        mount.dataset.dtEditId = String(edit.id);
        mount.dataset.dtFilePath = edit.path;
        mount.dataset.dtDiff = edit.diff;
        mount.dataset.dtStatus = edit.status;
        el.appendChild(mount);
      } catch {
        // JSON 解析失败，跳过
      }
    });
  }

  /** 将 responseEl 内所有 [TOOL_CALL:] 所在的块元素替换为 UI 卡片。 */
  private renderToolCallBlocks(responseEl: HTMLElement): void {
    const lang = this.store.config.language;
    responseEl.querySelectorAll('p, pre, li').forEach((child) => {
      const el = child as HTMLElement;
      if (el.dataset.dtToolCard) return;
      if (el.closest('[data-dt-tool-card]')) return;
      if (el.closest('.dt-resp-badge, .dt-react-clarify-mount')) return;

      const ct = el.textContent ?? '';
      if (!ct.includes('[TOOL_CALL:')) return;

      const toolCalls = parseToolCalls(ct);
      if (toolCalls.length === 0) return;

      const remaining = stripToolCallsFromText(ct).trim();
      el.innerHTML = '';
      el.dataset.dtToolCard = '1';

      for (const tc of toolCalls) {
        el.appendChild(buildToolCallCard(tc.name, tc.args, lang));
      }
      // 为 edit_file 创建 diff 挂载点
      for (const tc of toolCalls) {
        if (tc.name === 'edit_file') {
          const path = typeof tc.args.path === 'string' ? tc.args.path : '';
          const mount = document.createElement('div');
          mount.className = 'dt-diff-mount';
          mount.dataset.dtDiffMount = '1';
          mount.dataset.filePath = path;
          mount.dataset.editTool = '1';
          el.appendChild(mount);
        }
      }
      if (remaining) {
        el.appendChild(document.createTextNode(remaining));
      }
    });
  }

  private processResponseMarkers(): void {
    const isStillGenerating = this.store.isGenerating;
    const responseMessages = Array.from(this.adapter.getResponseMessages()) as HTMLElement[];
    const activeGeneratingMsg = isStillGenerating && responseMessages.length > 0
      ? responseMessages[responseMessages.length - 1]
      : null;

    const { continueMarker, finishMarker } = this.store.config.markers;

    responseMessages.forEach((el) => {
      const text = el.innerText;
      const mountHost = this.resolveMountHost(el);
      const uiStack = this.resolveUiStack(mountHost);
      const sig = this.getNodeSignature(text);
      if (el.dataset.dtDone === '1' && el.dataset.dtSig === sig) return;
      el.dataset.dtSig = sig;

      const isActiveGeneratingMessage = activeGeneratingMsg === el;
      const hasContinue = text.includes(continueMarker) || text.includes('[ACTION: THINK_MORE]');
      const hasFinish = text.includes(finishMarker) || text.includes('[ACTION: GOAL_REACHED]');
      const hasNextPrompt = text.includes('[NEXT_PROMPT');
      const hasClarify = text.includes('[CLARIFY]');
      const hasRouter = /\[(?:\/)?router_config\]|<\/?router_config>/i.test(text);
      const hasToolCall = text.includes('[TOOL_CALL:') || text.includes('[TOOL_RESULT:');
      const intentInfo = parseIntentJson(text);
      const nextPromptText = this.parseNextPromptText(text);
      const hasExistingUi = Boolean(uiStack.querySelector('.dt-resp-badge, .dt-next-prompt-card, .dt-react-clarify-mount'));

      if (!hasContinue && !hasFinish && !hasNextPrompt && !intentInfo && !hasClarify && !hasRouter && !hasExistingUi && !hasToolCall) return;

      // 移除旧 badge
      const oldBadge = uiStack.querySelector('.dt-resp-badge') as HTMLElement | null;

      const upsertBadge = (className: string, textContent: string): void => {
        if (oldBadge) {
          if (oldBadge.className === className && oldBadge.textContent === textContent) {
            return;
          }
          oldBadge.className = className;
          oldBadge.textContent = textContent;
          return;
        }
        const badge = document.createElement('div');
        badge.className = className;
        badge.textContent = textContent;
        uiStack.appendChild(badge);
      };

      // 生成中仅更新状态徽章，避免高频改写 DOM 触发观察器回流。
      if (isActiveGeneratingMessage) {
        if (hasContinue) {
          const displayLoop = Math.max(1, this.store.currentLoop);
          upsertBadge(
            'dt-resp-badge dt-badge-think',
            this.store.config.language === 'en'
              ? `🔄 Continuing deep think · Round ${displayLoop}`
              : `🔄 继续深入思考 · 第 ${displayLoop} 轮`,
          );
        } else if (hasFinish) {
          upsertBadge(
            'dt-resp-badge dt-badge-done',
            this.store.config.language === 'en'
              ? '✅ Deep think complete · Generating final summary...'
              : '✅ 深度思考完成 · 正在生成最终总结...',
          );
        } else if (intentInfo) {
          const textContent = this.store.config.language === 'en'
            ? intentInfo.route === 'deep'
              ? `🧭 AUTO Decision: Entering deep mode${intentInfo.summary ? ` · ${intentInfo.summary}` : ''}`
              : intentInfo.route === 'clarify'
                ? `🧭 AUTO Decision: Entering clarification mode${intentInfo.summary ? ` · ${intentInfo.summary}` : ''}`
                : `🧭 AUTO Decision: Direct answer${intentInfo.summary ? ` · ${intentInfo.summary}` : ''}`
            : intentInfo.route === 'deep'
              ? `🧭 AUTO 决策：进入深度模式${intentInfo.summary ? ` · ${intentInfo.summary}` : ''}`
              : intentInfo.route === 'clarify'
                ? `🧭 AUTO 决策：进入问卷模式${intentInfo.summary ? ` · ${intentInfo.summary}` : ''}`
                : `🧭 AUTO 决策：直接回答${intentInfo.summary ? ` · ${intentInfo.summary}` : ''}`;

          upsertBadge('dt-resp-badge dt-badge-final', textContent);
        }

        el.dataset.dtDone = '0';
        return;
      }

      if (oldBadge) oldBadge.remove();

      // 将 [TOOL_CALL:] 行替换为可视化卡片（生成完毕后才替换，避免打断流式输出）
      this.renderToolCallBlocks(el);
      // 渲染 edit_file 工具结果为 diff 卡片
      this.renderEditResultBlocks(el);

      // 遍历文本节点，删除标记文本
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const textNodes: Text[] = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode as Text);

      let inClarifyGlobal = false;
      let inRouterGlobal = false;
      let inNextPromptGlobal = false;

      for (const node of textNodes) {
        if ((node as unknown as HTMLElement).closest?.('.dt-resp-badge') || (node as unknown as HTMLElement).closest?.('.dt-react-clarify-mount')) continue;
        // 跳过已被替换为工具卡片的节点内容
        if ((node as unknown as HTMLElement).closest?.('[data-dt-tool-card]')) continue;

        const originalNodeText = node.textContent ?? '';
        let nodeText = originalNodeText;

          // 处理整块混在一个节点里的情况
          nodeText = removeTaggedBlock(nodeText, CLARIFY_TAG);
          nodeText = removeTaggedBlock(nodeText, ROUTER_TAG);
          nodeText = removeTaggedBlock(nodeText, NEXT_PROMPT_TAG);

        const lines = nodeText.split(/\r?\n/);
        let t = lines
          .filter((line) => {
            const trimmed = line.trim();
            if (!trimmed) return true;

            // 跨节点/跨段落的问卷过滤
            const clarifyBoundary = parseTagBoundary(trimmed, CLARIFY_TAG, inClarifyGlobal);
            if (clarifyBoundary.isMarker) {
              inClarifyGlobal = clarifyBoundary.nextInBlock;
              return false;
            }

            const routerBoundary = parseTagBoundary(trimmed, ROUTER_TAG, inRouterGlobal);
            if (routerBoundary.isMarker) {
              inRouterGlobal = routerBoundary.nextInBlock;
              return false;
            }

            const nextPromptBoundary = parseTagBoundary(trimmed, NEXT_PROMPT_TAG, inNextPromptGlobal);
            if (nextPromptBoundary.isMarker) {
              inNextPromptGlobal = nextPromptBoundary.nextInBlock;
              return false;
            }

            if (inClarifyGlobal || inRouterGlobal || inNextPromptGlobal) {
              return false;
            }

            if (trimmed.includes('[NEXT_PROMPT:')) return false;

            // 过滤意图 JSON 行
            if (parseIntentJson(trimmed) || (trimmed.startsWith('{') && trimmed.includes('"route"'))) return false;
            // 过滤 AUTO 决策标签行
            if (/^🧭\s*AUTO\s*(决策|Decision)[:：]/.test(trimmed)) return false;
            if (/^AUTO\s*(决策|Decision)[:：]/.test(trimmed)) return false;
            // 过滤进入深度或问卷模式的提示文字
            if (/^(进入深度模式|进入问卷模式|Entering deep mode|Entering clarification mode)/.test(trimmed)) return false;
            // 过滤 "进入深度模式执行搜索与分析" 等变体
            if (/(深度模式|问卷模式|deep mode|clarification mode).*[。!！…]*$/.test(trimmed) && trimmed.length < 50) return false;
            // 过滤系统内部通信标记（工具调用、工具结果、系统内部消息）
            if (/\[TOOL_CALL:/.test(trimmed)) return false;
            if (/\[TOOL_RESULT:/.test(trimmed)) return false;
            if (/\[系统内部[\s—]|\[System Internal[\s—]/.test(trimmed)) return false;
            // 过滤动作标记行（可能出现在行内任意位置）
            if (/\[ACTION:\s*(THINK_MORE|GOAL_REACHED)\]/.test(trimmed)) return false;
            if (/\[THINK_MORE\]|\[GOAL_REACHED\]/.test(trimmed)) return false;
            return true;
          })
          .join('\n');
        if (t.includes(continueMarker)) { t = t.split(continueMarker).join(''); }
        if (t.includes(finishMarker)) { t = t.split(finishMarker).join(''); }
        // 清理可能内联在文本中的 [TOOL_CALL: ...] 片段
        t = stripToolCallsFromText(t);

        const changed = t !== originalNodeText;
        if (changed) node.textContent = t;
      }

      // 隐藏 NEXT_PROMPT 段落和其他标记
      let hidingClarifyTemp = false;
      let hidingRouterTemp = false;
      let hidingNextPromptTemp = false;
      el.querySelectorAll('p, li, span, pre, code').forEach((child) => {
        if ((child as HTMLElement).closest?.('.dt-resp-badge')) return;
        // 工具调用卡片内部元素跳过
        if ((child as HTMLElement).closest?.('[data-dt-tool-card]')) return;
        const ct = (child.textContent ?? '').trim();

        const clarifyBoundary = parseTagBoundary(ct, CLARIFY_TAG, hidingClarifyTemp);
        if (clarifyBoundary.isMarker) {
          hidingClarifyTemp = clarifyBoundary.nextInBlock;
          child.classList.add('dt-hidden');
          return;
        }

        if (hidingClarifyTemp) {
          child.classList.add('dt-hidden');
          return;
        }

        const routerBoundary = parseTagBoundary(ct, ROUTER_TAG, hidingRouterTemp);
        if (routerBoundary.isMarker) {
          hidingRouterTemp = routerBoundary.nextInBlock;
          child.classList.add('dt-hidden');
          return;
        }

        if (hidingRouterTemp) {
          child.classList.add('dt-hidden');
          return;
        }

        const nextPromptBoundary = parseTagBoundary(ct, NEXT_PROMPT_TAG, hidingNextPromptTemp);
        if (nextPromptBoundary.isMarker) {
          hidingNextPromptTemp = nextPromptBoundary.nextInBlock;
          child.classList.add('dt-hidden');
          return;
        }

        if (hidingNextPromptTemp) {
          child.classList.add('dt-hidden');
          return;
        }

        if (ct.includes('[NEXT_PROMPT:')) {
          child.classList.add('dt-hidden');
        }
        if (/^(进入深度模式|进入问卷模式|Entering deep mode|Entering clarification mode)/.test(ct) && ct.length < 50) {
          child.classList.add('dt-hidden');
        }
        if (/(深度模式|问卷模式|deep mode|clarification mode).*[搜索|分析|综合|问题|构思|search|analy|synthe|question]/.test(ct) && ct.length < 60) {
          child.classList.add('dt-hidden');
        }
        if (/^🧭\s*AUTO\s*(决策|Decision)[:：]/.test(ct)) {
          child.classList.add('dt-hidden');
        }
        if (/^AUTO\s*(决策|Decision)[:：]/.test(ct)) {
          child.classList.add('dt-hidden');
        }
        // 隐藏意图 JSON 行显示在 p/span/pre/code 中的情况
        if (parseIntentJson(ct) || (ct.startsWith('{') && ct.includes('"route"'))) {
          child.classList.add('dt-hidden');
        }
        // 隐藏工具调用和系统内部通信标记
        if (/\[TOOL_CALL:/.test(ct)) {
          child.classList.add('dt-hidden');
        }
        if (/\[TOOL_RESULT:/.test(ct)) {
          child.classList.add('dt-hidden');
        }
        if (/\[系统内部[\s—]|\[System Internal[\s—]/.test(ct)) {
          child.classList.add('dt-hidden');
        }
        // 隐藏动作标记
        if (/\[ACTION:\s*(THINK_MORE|GOAL_REACHED)\]|\[THINK_MORE\]|\[GOAL_REACHED\]/.test(ct)) {
          child.classList.add('dt-hidden');
        }
      });

      // 移除末尾及中间死去的空段落
      Array.from(el.children).forEach((c) => {
        const child = c as HTMLElement;
        if (child.classList?.contains('dt-resp-badge') || child.classList?.contains('dt-react-clarify-mount')) return;
        if (child.textContent?.trim() === '' && !child.querySelector('img,table,pre,code')) {
          child.classList.add('dt-hidden');
        }
      });

      // 折叠所有子项均被隐藏的 ol/ul 容器，避免空白编号列表
      el.querySelectorAll('ol, ul').forEach((list) => {
        const items = Array.from(list.querySelectorAll(':scope > li'));
        if (items.length > 0 && items.every((li) => (li as HTMLElement).classList.contains('dt-hidden') || (li.textContent ?? '').trim() === '')) {
          (list as HTMLElement).classList.add('dt-hidden');
        }
      });

      // 在生成完毕后（!isStillGenerating），提取内容并做最终处理
      let hidingClarify = false;
      let hidingRouter = false;
      let hidingNextPrompt = false;
      el.querySelectorAll('p, li, span, pre, code').forEach((child) => {
        if ((child as HTMLElement).closest?.('.dt-resp-badge') || (child as HTMLElement).closest?.('.dt-react-clarify-mount')) return;
        // 工具调用卡片内部元素跳过
        if ((child as HTMLElement).closest?.('[data-dt-tool-card]')) return;
        const ct = (child.textContent ?? '').trim();

        const clarifyBoundary = parseTagBoundary(ct, CLARIFY_TAG, hidingClarify);
        if (clarifyBoundary.isMarker) {
          hidingClarify = clarifyBoundary.nextInBlock;
          child.classList.add('dt-hidden');
          return;
        }

        if (hidingClarify) {
          child.classList.add('dt-hidden');
          return;
        }

        const routerBoundary = parseTagBoundary(ct, ROUTER_TAG, hidingRouter);
        if (routerBoundary.isMarker) {
          hidingRouter = routerBoundary.nextInBlock;
          child.classList.add('dt-hidden');
          return;
        }

        if (hidingRouter) {
          child.classList.add('dt-hidden');
          return;
        }

        const nextPromptBoundary = parseTagBoundary(ct, NEXT_PROMPT_TAG, hidingNextPrompt);
        if (nextPromptBoundary.isMarker) {
          hidingNextPrompt = nextPromptBoundary.nextInBlock;
          child.classList.add('dt-hidden');
          return;
        }

        if (hidingNextPrompt) {
          child.classList.add('dt-hidden');
        }
        // 隐藏工具调用和系统内部通信标记（最终清理阶段）
        if (/\[TOOL_CALL:/.test(ct)) {
          child.classList.add('dt-hidden');
        }
        if (/\[TOOL_RESULT:/.test(ct)) {
          child.classList.add('dt-hidden');
        }
        if (/\[系统内部[\s—]|\[System Internal[\s—]/.test(ct)) {
          child.classList.add('dt-hidden');
        }
        if (/\[ACTION:\s*(THINK_MORE|GOAL_REACHED)\]|\[THINK_MORE\]|\[GOAL_REACHED\]/.test(ct)) {
          child.classList.add('dt-hidden');
        }
      });

      // 获取整个回答并解析问卷，插入挂载点
      const blockQuestions = parseClarifyBlock(text);
      if (blockQuestions && blockQuestions.length > 0 && !uiStack.querySelector('.dt-react-clarify-mount')) {
        const mount = document.createElement('div');
        mount.className = 'dt-react-clarify-mount';
        mount.dataset.clarifyJson = JSON.stringify(blockQuestions);
        uiStack.appendChild(mount);
      }

      this.upsertNextPromptCard(uiStack, nextPromptText);

      // 原本的 注入可视化徽章 逻辑
      if (hasContinue) {
        const displayLoop = Math.max(1, this.store.currentLoop);
        upsertBadge(
          'dt-resp-badge dt-badge-think',
          this.store.config.language === 'en'
            ? `🔄 Continuing deep think · Round ${displayLoop}`
            : `🔄 继续深入思考 · 第 ${displayLoop} 轮`,
        );
      } else if (hasFinish) {
        upsertBadge(
          'dt-resp-badge dt-badge-done',
          this.store.config.language === 'en'
            ? '✅ Deep think complete · Generating final summary...'
            : '✅ 深度思考完成 · 正在生成最终总结...',
        );
      } else if (intentInfo) {
        const textContent = this.store.config.language === 'en'
          ? intentInfo.route === 'deep'
            ? `🧭 AUTO Decision: Entering deep mode${intentInfo.summary ? ` · ${intentInfo.summary}` : ''}`
            : intentInfo.route === 'clarify'
              ? `🧭 AUTO Decision: Entering clarification mode${intentInfo.summary ? ` · ${intentInfo.summary}` : ''}`
              : `🧭 AUTO Decision: Direct answer${intentInfo.summary ? ` · ${intentInfo.summary}` : ''}`
          : intentInfo.route === 'deep'
            ? `🧭 AUTO 决策：进入深度模式${intentInfo.summary ? ` · ${intentInfo.summary}` : ''}`
            : intentInfo.route === 'clarify'
              ? `🧭 AUTO 决策：进入问卷模式${intentInfo.summary ? ` · ${intentInfo.summary}` : ''}`
              : `🧭 AUTO 决策：直接回答${intentInfo.summary ? ` · ${intentInfo.summary}` : ''}`;

        upsertBadge('dt-resp-badge dt-badge-final', textContent);
      }

      el.dataset.dtDone = '1';
    });
  }
}
