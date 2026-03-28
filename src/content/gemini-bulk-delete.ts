const SEL = {
  conversationsRegion: '[role="region"][id^="conversations-list-"]',
  conversation: 'a[data-test-id="conversation"]',
  row: '.conversation-items-container',
  actionsButton: 'button[data-test-id="actions-menu-button"]',
  deleteButton: 'button[data-test-id="delete-button"]',
} as const;

type StatusTone = 'info' | 'success' | 'warn';

export class GeminiConversationBulkDeleteController {
  private observer: MutationObserver | null = null;
  private refreshTimer: number | null = null;
  private toolbar: HTMLDivElement | null = null;
  private statusEl: HTMLSpanElement | null = null;

  private modeEnabled = false;
  private deleting = false;
  private selectedIds = new Set<string>();
  private idMap = new WeakMap<HTMLAnchorElement, string>();

  private readonly onDocumentClickBound = (e: MouseEvent) => {
    this.handleDocumentClick(e);
  };

  start(): void {
    if (this.observer) return;
    this.mountToolbarIfNeeded();
    this.refreshRows();

    this.observer = new MutationObserver(() => this.scheduleRefresh());
    this.observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener('click', this.onDocumentClickBound, true);
  }

  stop(): void {
    document.removeEventListener('click', this.onDocumentClickBound, true);

    this.observer?.disconnect();
    this.observer = null;

    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    this.selectedIds.clear();
    this.modeEnabled = false;
    this.deleting = false;

    this.clearRowDecorations();
    this.removeToolbar();
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = window.setTimeout(() => {
      this.refreshRows();
    }, 120);
  }

  private getRegion(): HTMLElement | null {
    return document.querySelector(SEL.conversationsRegion);
  }

  private getConversationAnchors(): HTMLAnchorElement[] {
    const region = this.getRegion();
    if (!region) return [];
    return Array.from(region.querySelectorAll(SEL.conversation));
  }

  private mountToolbarIfNeeded(): void {
    const region = this.getRegion();
    if (!region) {
      this.removeToolbar();
      return;
    }

    if (this.toolbar && this.toolbar.parentElement === region) {
      return;
    }

    this.removeToolbar();

    const bar = document.createElement('div');
    bar.className = 'dt-bulk-toolbar';

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'dt-bulk-btn';
    toggleBtn.dataset.role = 'toggle';
    toggleBtn.type = 'button';
    toggleBtn.textContent = '批量删除';
    toggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleMode();
    });

    const selectAllBtn = document.createElement('button');
    selectAllBtn.className = 'dt-bulk-btn';
    selectAllBtn.dataset.role = 'select-all';
    selectAllBtn.type = 'button';
    selectAllBtn.textContent = '全选可见';
    selectAllBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.selectAllVisible();
    });

    const clearBtn = document.createElement('button');
    clearBtn.className = 'dt-bulk-btn';
    clearBtn.dataset.role = 'clear';
    clearBtn.type = 'button';
    clearBtn.textContent = '清空';
    clearBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.clearSelection();
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'dt-bulk-btn dt-bulk-btn-danger';
    deleteBtn.dataset.role = 'delete';
    deleteBtn.type = 'button';
    deleteBtn.textContent = '删除(0)';
    deleteBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      void this.deleteSelected();
    });

    const status = document.createElement('span');
    status.className = 'dt-bulk-status';

    bar.append(toggleBtn, selectAllBtn, clearBtn, deleteBtn, status);
    region.prepend(bar);

    this.toolbar = bar;
    this.statusEl = status;
    this.updateToolbar();
  }

  private removeToolbar(): void {
    this.toolbar?.remove();
    this.toolbar = null;
    this.statusEl = null;
  }

  private refreshRows(): void {
    this.mountToolbarIfNeeded();

    const anchors = this.getConversationAnchors();
    const visibleIds = new Set<string>();

    for (const anchor of anchors) {
      const id = this.getConversationId(anchor);
      visibleIds.add(id);
      this.decorateRow(anchor, id);
    }

    for (const id of Array.from(this.selectedIds)) {
      if (!visibleIds.has(id)) this.selectedIds.delete(id);
    }

    this.updateToolbar();
  }

  private clearRowDecorations(): void {
    for (const host of Array.from(document.querySelectorAll('.dt-bulk-row-host'))) {
      host.classList.remove('dt-bulk-row-host', 'dt-bulk-selected', 'dt-bulk-select-mode');
    }
    for (const box of Array.from(document.querySelectorAll('.dt-bulk-checkbox-wrap'))) {
      box.remove();
    }
  }

  private decorateRow(anchor: HTMLAnchorElement, id: string): void {
    const row = this.getRowContainer(anchor);
    row.classList.add('dt-bulk-row-host');
    row.classList.toggle('dt-bulk-select-mode', this.modeEnabled);

    if (!this.modeEnabled) {
      row.classList.remove('dt-bulk-selected');
      row.querySelector('.dt-bulk-checkbox-wrap')?.remove();
      return;
    }

    row.classList.toggle('dt-bulk-selected', this.selectedIds.has(id));

    let wrap = row.querySelector('.dt-bulk-checkbox-wrap') as HTMLLabelElement | null;
    if (!wrap) {
      wrap = document.createElement('label');
      wrap.className = 'dt-bulk-checkbox-wrap';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'dt-bulk-checkbox';
      input.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      input.addEventListener('change', (e) => {
        e.stopPropagation();
        const checked = (e.target as HTMLInputElement).checked;
        this.setSelected(id, checked);
      });

      wrap.append(input);
      row.prepend(wrap);
    }

    const input = wrap.querySelector('input.dt-bulk-checkbox') as HTMLInputElement | null;
    if (input) input.checked = this.selectedIds.has(id);
  }

  private handleDocumentClick(e: MouseEvent): void {
    if (!this.modeEnabled || this.deleting) return;

    const target = e.target as HTMLElement;
    if (!target) return;

    if (target.closest('.dt-bulk-toolbar')) return;
    if (target.closest('.dt-bulk-checkbox-wrap')) return;
    if (target.closest(SEL.actionsButton)) return;

    const anchor = target.closest(SEL.conversation) as HTMLAnchorElement | null;
    if (!anchor) return;

    e.preventDefault();
    e.stopPropagation();

    const id = this.getConversationId(anchor);
    this.setSelected(id, !this.selectedIds.has(id));
  }

  private toggleMode(force?: boolean): void {
    this.modeEnabled = force ?? !this.modeEnabled;
    if (!this.modeEnabled) {
      this.selectedIds.clear();
      this.setStatus('');
    }
    this.refreshRows();
  }

  private selectAllVisible(): void {
    if (!this.modeEnabled || this.deleting) return;
    for (const anchor of this.getConversationAnchors()) {
      this.selectedIds.add(this.getConversationId(anchor));
    }
    this.refreshRows();
  }

  private clearSelection(): void {
    this.selectedIds.clear();
    this.refreshRows();
  }

  private setSelected(id: string, selected: boolean): void {
    if (selected) this.selectedIds.add(id);
    else this.selectedIds.delete(id);
    this.refreshRows();
  }

  private updateToolbar(): void {
    if (!this.toolbar) return;

    const selected = this.selectedIds.size;
    const toggleBtn = this.toolbar.querySelector<HTMLButtonElement>('button[data-role="toggle"]');
    const selectAllBtn = this.toolbar.querySelector<HTMLButtonElement>('button[data-role="select-all"]');
    const clearBtn = this.toolbar.querySelector<HTMLButtonElement>('button[data-role="clear"]');
    const deleteBtn = this.toolbar.querySelector<HTMLButtonElement>('button[data-role="delete"]');

    if (toggleBtn) {
      toggleBtn.textContent = this.modeEnabled ? '退出多选' : '批量删除';
      toggleBtn.disabled = this.deleting;
    }

    if (selectAllBtn) {
      selectAllBtn.hidden = !this.modeEnabled;
      selectAllBtn.disabled = !this.modeEnabled || this.deleting;
    }

    if (clearBtn) {
      clearBtn.hidden = !this.modeEnabled;
      clearBtn.disabled = !this.modeEnabled || this.deleting || selected === 0;
    }

    if (deleteBtn) {
      deleteBtn.hidden = !this.modeEnabled;
      deleteBtn.disabled = !this.modeEnabled || this.deleting || selected === 0;
      deleteBtn.textContent = this.deleting ? '删除中...' : `删除(${selected})`;
    }

    this.toolbar.classList.toggle('dt-bulk-toolbar-active', this.modeEnabled);
  }

  private async deleteSelected(): Promise<void> {
    if (this.deleting || this.selectedIds.size === 0) return;

    const total = this.selectedIds.size;
    const ok = window.confirm(`确认删除选中的 ${total} 个对话吗？该操作不可撤销。`);
    if (!ok) return;

    this.deleting = true;
    this.updateToolbar();
    this.setStatus(`准备删除 0/${total}...`, 'info');

    let success = 0;
    let failed = 0;
    const idQueue = Array.from(this.selectedIds);

    try {
      for (let i = 0; i < idQueue.length; i++) {
        const id = idQueue[i];
        const result = await this.deleteById(id);
        if (result) {
          success++;
          this.selectedIds.delete(id);
        } else {
          failed++;
        }
        this.setStatus(`正在删除 ${i + 1}/${total}...`, failed > 0 ? 'warn' : 'info');
        this.refreshRows();
      }
    } finally {
      this.deleting = false;
      this.modeEnabled = false;
      this.selectedIds.clear();
      this.refreshRows();
    }

    if (failed === 0) {
      this.setStatus(`已删除 ${success} 个对话`, 'success');
    } else {
      this.setStatus(`完成：成功 ${success}，失败 ${failed}`, 'warn');
    }

    window.setTimeout(() => {
      if (!this.modeEnabled) this.setStatus('');
    }, 3500);
  }

  private async deleteById(id: string): Promise<boolean> {
    let anchor = this.findAnchorById(id);
    if (!anchor) return true;

    let actionsBtn = this.findActionsButton(anchor);
    if (!actionsBtn) {
      const row = this.getRowContainer(anchor);
      row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      await this.sleep(120);
      actionsBtn = this.findActionsButton(anchor);
    }

    // 某些行只有在被激活后才渲染操作菜单。
    if (!actionsBtn) {
      anchor.click();
      await this.sleep(220);
      anchor = this.findAnchorById(id) ?? anchor;
      actionsBtn = this.findActionsButton(anchor) ?? this.findSelectedActionsButton();
    }

    if (!actionsBtn) return false;

    actionsBtn.click();

    const deleteBtn = await this.waitForVisibleDeleteButton();
    if (!deleteBtn) return false;
    deleteBtn.click();

    await this.sleep(160);
    await this.tryConfirmDelete();

    const removed = await this.waitUntil(() => this.findAnchorById(id) === null, 3200, 120);
    return removed;
  }

  private findActionsButton(anchor: HTMLAnchorElement): HTMLButtonElement | null {
    const row = this.getRowContainer(anchor);
    const btn = row.querySelector(SEL.actionsButton) as HTMLButtonElement | null;
    if (!btn) return null;
    if (!this.isVisible(btn)) return btn; // hidden buttons may still be clickable via script
    return btn;
  }

  private findSelectedActionsButton(): HTMLButtonElement | null {
    const selectedRow = document.querySelector('.conversation-actions-container.selected') as HTMLElement | null;
    if (!selectedRow) return null;
    return selectedRow.querySelector(SEL.actionsButton) as HTMLButtonElement | null;
  }

  private async waitForVisibleDeleteButton(): Promise<HTMLButtonElement | null> {
    const btn = await this.waitFor(() => this.findDeleteButton(), 1800, 80);
    return btn;
  }

  private findDeleteButton(): HTMLButtonElement | null {
    const direct = Array.from(document.querySelectorAll(SEL.deleteButton)) as HTMLButtonElement[];
    for (let i = direct.length - 1; i >= 0; i--) {
      const btn = direct[i];
      if (this.isVisible(btn) && btn.getAttribute('aria-disabled') !== 'true') {
        return btn;
      }
    }

    const menuItems = Array.from(document.querySelectorAll('button[role="menuitem"]')) as HTMLButtonElement[];
    for (let i = menuItems.length - 1; i >= 0; i--) {
      const btn = menuItems[i];
      if (!this.isVisible(btn)) continue;
      const text = this.normalizeText(btn.textContent ?? '');
      if (/^(删除|delete)$/i.test(text)) return btn;
      if (btn.querySelector('[fonticon="delete"], [data-mat-icon-name="delete"]')) return btn;
    }

    return null;
  }

  private async tryConfirmDelete(): Promise<void> {
    await this.sleep(120);

    const candidates = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
    for (let i = candidates.length - 1; i >= 0; i--) {
      const btn = candidates[i];
      if (!this.isVisible(btn)) continue;

      const testId = (btn.getAttribute('data-test-id') ?? '').toLowerCase();
      const text = this.normalizeText(btn.textContent ?? '');

      const isConfirmById = testId.includes('confirm') || testId.includes('delete-confirm');
      const isConfirmByText = /^(删除|delete|确认|confirm)$/i.test(text);

      if (isConfirmById || isConfirmByText) {
        btn.click();
        await this.sleep(120);
        return;
      }
    }
  }

  private findAnchorById(id: string): HTMLAnchorElement | null {
    for (const anchor of this.getConversationAnchors()) {
      if (this.getConversationId(anchor) === id) return anchor;
    }
    return null;
  }

  private getConversationId(anchor: HTMLAnchorElement): string {
    const cached = this.idMap.get(anchor);
    if (cached) return cached;

    const href = (anchor.getAttribute('href') ?? '').trim();
    if (href) {
      const id = `href:${href}`;
      this.idMap.set(anchor, id);
      return id;
    }

    const jslog = anchor.getAttribute('jslog') ?? '';
    const m = jslog.match(/"c_([^"]+)"/);
    if (m?.[1]) {
      const id = `cid:${m[1]}`;
      this.idMap.set(anchor, id);
      return id;
    }

    const fallback = `text:${this.normalizeText(anchor.textContent ?? '')}`;
    this.idMap.set(anchor, fallback);
    return fallback;
  }

  private getRowContainer(anchor: HTMLAnchorElement): HTMLElement {
    return (anchor.closest(SEL.row) as HTMLElement | null) ?? anchor;
  }

  private setStatus(message: string, tone: StatusTone = 'info'): void {
    if (!this.statusEl) return;
    this.statusEl.textContent = message;
    this.statusEl.dataset.tone = tone;
  }

  private async waitFor<T>(fn: () => T | null, timeoutMs: number, intervalMs: number): Promise<T | null> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const value = fn();
      if (value) return value;
      await this.sleep(intervalMs);
    }
    return null;
  }

  private async waitUntil(fn: () => boolean, timeoutMs: number, intervalMs: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (fn()) return true;
      await this.sleep(intervalMs);
    }
    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  private normalizeText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  private isVisible(el: HTMLElement): boolean {
    if (!el.isConnected) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    return el.getClientRects().length > 0;
  }
}
