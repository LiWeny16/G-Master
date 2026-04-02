/**
 * Gemini Enterprise (vertexaisearch.cloud.google.com) 内联开关注入。
 * 将「深度思考」和 Tavily 按钮注入到输入框的 actions-buttons 工具栏中（model-selector 前面）。
 *
 * 已知问题修复：
 *   1. 页面可能同时存在多个 .actions-buttons.omnibar（导航后旧工具栏残留），
 *      改用 querySelectorAll + 取最后一个，确保注入到当前活跃的工具栏。
 *   2. 心跳检测增加"按钮是否在活跃工具栏中"判断，防止注入到已隐藏的旧工具栏。
 *   3. 添加 Context 用量环形指示器（token meter），穿透 Shadow DOM 读取内容。
 */
import { useEffect, useRef } from 'react';
import { autorun } from 'mobx';
import { StateStore } from '../stores/state-store';
import i18n from '../i18n';

const IQ_LUCIDE_ICON = `
  <svg class="dt-tm-iq-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M15.09 14.37a5 5 0 1 0-6.18 0A7 7 0 0 1 12 20a7 7 0 0 1 3.09-5.63"></path>
    <path d="M9 18h6"></path>
    <path d="M10 22h4"></path>
  </svg>
`;

export function useGeminiEnterpriseInlineToggle(
  store: StateStore,
  onToggle: () => void,
  onAbort: () => void,
  enabled: boolean = true,
) {
  const toggleRef = useRef(onToggle);
  const abortRef = useRef(onAbort);
  useEffect(() => { toggleRef.current = onToggle; }, [onToggle]);
  useEffect(() => { abortRef.current = onAbort; }, [onAbort]);

  /**
   * 递归穿透所有 Shadow DOM 层，收集匹配 selector 的全部元素。
   * Gemini Enterprise 使用多层嵌套 Shadow DOM：
   *   document → <vertexaisearch-app>#shadow-root → <ucs-results>#shadow-root
   *   → <ucs-search-bar>#shadow-root → div.actions-buttons.omnibar
   * 普通 querySelector 只能搜索 light DOM，必须手动递归进入每层 shadowRoot。
   */
  function querySelectorAllDeep<T extends Element>(
    selector: string,
    root: Document | ShadowRoot | Element = document,
  ): T[] {
    const results: T[] = [];
    results.push(...root.querySelectorAll<T>(selector));
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) {
        results.push(...querySelectorAllDeep<T>(selector, el.shadowRoot));
      }
    }
    return results;
  }

  /** 返回当前活跃的（最后一个）Enterprise 工具栏，递归穿透所有 Shadow DOM */
  function getActiveToolbar(): HTMLElement | null {
    const all = querySelectorAllDeep<HTMLElement>('.actions-buttons.omnibar');
    return all.length > 0 ? all[all.length - 1] : null;
  }

  /** 收集页面内所有 shadow root（递归）*/
  function collectAllShadowRoots(
    root: Document | ShadowRoot | Element = document,
    acc: ShadowRoot[] = [],
  ): ShadowRoot[] {
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) {
        acc.push(el.shadowRoot);
        collectAllShadowRoots(el.shadowRoot, acc);
      }
    }
    return acc;
  }

  useEffect(() => {
    if (!enabled) return;
    let btn: HTMLButtonElement | null = null;
    let tavilyBtn: HTMLButtonElement | null = null;
    let tokenMeter: HTMLDivElement | null = null;

    function sync() {
      const phase = store.enginePhase;
      const isActive = store.isAgentEnabled;
      const loop = store.currentLoop;
      const summarizing = store.isSummarizing;
      const tavilyOn = store.config.tavilyEnabled;
      const hasTavilyKey = store.config.tavilyApiKey.trim().length > 0;

      // Shadow DOM 内的元素不在 document 的 light tree，用 isConnected 代替 document.contains()
      if (!btn?.isConnected) return;
      if (!tavilyBtn?.isConnected) return;
      if (!tokenMeter?.isConnected) return;

      /* === 计算 Context 用量（精确穿透三层 Shadow DOM） === */
      try {
        let totalText = '';

        // 公共的 shadow root 路径辅助（内联，避免依赖外部）
        const appRoot = document.querySelector('ucs-standalone-app')?.shadowRoot;
        const resultsRoot = appRoot?.querySelector('ucs-results')?.shadowRoot;
        const convRoot = resultsRoot?.querySelector('ucs-conversation')?.shadowRoot;

        // 1. 用户消息：convRoot → div > div.turn > div（直接 div 子，非 ucs-summary）
        if (convRoot) {
          const userDivs = convRoot.querySelectorAll<HTMLElement>('div > div.turn > div');
          for (const div of userDivs) {
            totalText += div.innerText + '\n';
          }
        }

        // 2. AI 回复：convRoot → div.turn > ucs-summary → ucs-text-streamer → ... → div
        if (convRoot) {
          const summaries = convRoot.querySelectorAll<Element>('div > div.turn > ucs-summary');
          for (const summary of summaries) {
            const streamer = summary.shadowRoot?.querySelector('ucs-text-streamer');
            const resMd = streamer?.shadowRoot?.querySelector('ucs-response-markdown');
            const fastMd = resMd?.shadowRoot?.querySelector('ucs-fast-markdown');
            const mdDoc = fastMd?.shadowRoot?.querySelector('div');
            if (mdDoc) totalText += (mdDoc as HTMLElement).innerText + '\n';
          }
        }

        // 3. 编辑器内容：兼容 Landing（ucs-chat-landing）和 Results 两种布局
        const chatLandingSrTm = appRoot?.querySelector('ucs-chat-landing')?.shadowRoot;
        const sbRootFromLanding = chatLandingSrTm?.querySelector('ucs-search-bar')?.shadowRoot;
        const sbRootFromResults = resultsRoot?.querySelector('ucs-search-bar')?.shadowRoot;
        const sbRoot = sbRootFromLanding ?? sbRootFromResults ?? appRoot?.querySelector('ucs-search-bar')?.shadowRoot;
        const editorHost = sbRoot?.querySelector('#agent-search-prosemirror-editor');
        const proseMirror = editorHost?.shadowRoot?.querySelector<HTMLElement>('.ProseMirror');
        if (proseMirror) totalText += proseMirror.innerText + '\n';

        // 精准 token 估算：中文字符约 1 token，ASCII 约 4 字符 = 1 token
        let estimatedTokens = 0;
        for (const ch of totalText) {
          estimatedTokens += ch.charCodeAt(0) > 0x2E7F ? 1 : 0.25;
        }
        estimatedTokens = Math.floor(estimatedTokens);

        const MAX_VISUAL_TOKENS = 104000;
        const rawPercent = Math.min(100, Math.max(0, (estimatedTokens / MAX_VISUAL_TOKENS) * 100));
        const percentStr = rawPercent.toFixed(0) + '%';

        const ring = tokenMeter.querySelector('.dt-tm-ring') as SVGCircleElement | null;
        const usageText = tokenMeter.querySelector('.dt-tm-usage-text') as HTMLSpanElement | null;
        const pctText = tokenMeter.querySelector('.dt-tm-pct-text') as HTMLSpanElement | null;
        const barFg = tokenMeter.querySelector('.dt-tm-bar-fg') as HTMLDivElement | null;
        const iqPctText = tokenMeter.querySelector('.dt-tm-iq-pct') as HTMLSpanElement | null;
        const iqBarFg = tokenMeter.querySelector('.dt-tm-iq-bar-fg') as HTMLDivElement | null;
        const meterTitle = tokenMeter.querySelector('.dt-tm-title') as HTMLDivElement | null;
        const iqTitleText = tokenMeter.querySelector('.dt-tm-iq-title-text') as HTMLSpanElement | null;
        const iqDesc = tokenMeter.querySelector('.dt-tm-iq-desc') as HTMLDivElement | null;

        if (ring && usageText && pctText && barFg) {
          if (meterTitle) meterTitle.textContent = i18n.t('token_meter_title');
          if (iqTitleText) iqTitleText.textContent = i18n.t('token_meter_iq_title');
          if (iqDesc) iqDesc.textContent = i18n.t('token_meter_iq_desc');

          const formattedUsed = (estimatedTokens / 1000).toFixed(1) + 'K';
          const formattedMax = (MAX_VISUAL_TOKENS / 1000).toFixed(0) + 'K';
          usageText.textContent = i18n.t('token_meter_usage', { used: formattedUsed, max: formattedMax });
          pctText.textContent = percentStr;
          barFg.style.width = percentStr;

          // 圆弧偏移量：circumference = 2π × 14 ≈ 87.96
          const offset = 87.96 - (rawPercent / 100) * 87.96;
          ring.style.strokeDashoffset = String(offset);

          const color = rawPercent < 50 ? '#007bdd' : rawPercent < 80 ? '#ed6c02' : '#d32f2f';
          ring.style.stroke = color;
          barFg.style.background = color;

          // IQ 曲线（按 32K 有效上下文重标定）
          const effectivePercent = Math.min(100, rawPercent * (104000 / 32000));
          const iqPercent = Math.max(0, Math.min(100, 100 - 75 * Math.pow(effectivePercent / 100, 1.18)));
          const iqStr = iqPercent.toFixed(0) + '%';
          if (iqPctText) iqPctText.textContent = iqStr;
          if (iqBarFg) {
            iqBarFg.style.width = iqStr;
            iqBarFg.style.background = iqPercent > 80 ? '#2e7d32' : iqPercent > 60 ? '#ed6c02' : '#d32f2f';
          }
        }
      } catch (_e) { /* ignore */ }

      const sp = btn.querySelector<HTMLElement>('.dt-tg-sp');
      const dot = btn.querySelector<HTMLElement>('.dt-tg-dot');
      const txt = btn.querySelector<HTMLElement>('.dt-tg-txt');
      if (!sp || !dot || !txt) return;

      if (phase === 'thinking' || phase === 'summarizing' || phase === 'clarifying') {
        sp.style.display = 'block';
        dot.style.display = 'none';
        btn.style.color = '#8B7355';
        btn.style.borderColor = '#8B7355';
        btn.style.backgroundColor = 'rgba(139,115,85,.08)';
        if (phase === 'clarifying') {
          txt.textContent = store.config.language === 'en' ? 'Waiting for input...' : '等待补充信息…';
        } else {
          txt.textContent = summarizing ? i18n.t('toggle_summarizing') : i18n.t('toggle_thinking', { loop: Math.max(1, loop) });
        }
      } else if (isActive) {
        sp.style.display = 'none';
        dot.style.display = 'block';
        dot.style.background = '#8B7355';
        btn.style.color = '#8B7355';
        btn.style.borderColor = '#8B7355';
        btn.style.backgroundColor = 'rgba(139,115,85,.08)';
        txt.textContent = store.agentMode === 'auto' ? i18n.t('toggle_auto') : i18n.t('toggle_on');
      } else {
        sp.style.display = 'none';
        dot.style.display = 'block';
        dot.style.background = 'currentColor';
        btn.style.color = '';
        btn.style.borderColor = '';
        btn.style.backgroundColor = '';
        txt.textContent = i18n.t('toggle_off');
      }

      // Tavily button sync
      const tavilyDot = tavilyBtn.querySelector<HTMLElement>('.dt-tv-dot');
      const tavilyTxt = tavilyBtn.querySelector<HTMLElement>('.dt-tv-txt');
      if (!tavilyDot || !tavilyTxt) return;
      const canUseTavily = store.agentMode !== 'off';
      tavilyBtn.disabled = !canUseTavily;
      if (!canUseTavily) {
        tavilyBtn.style.opacity = '0.55';
        tavilyBtn.style.cursor = 'not-allowed';
        tavilyBtn.style.color = '';
        tavilyBtn.style.borderColor = '';
        tavilyBtn.style.backgroundColor = '';
        tavilyDot.style.background = 'currentColor';
        tavilyTxt.textContent = 'Tavily';
        tavilyBtn.title = i18n.t('toggle_tavily_disabled');
      } else if (tavilyOn && !hasTavilyKey) {
        tavilyBtn.style.opacity = '1';
        tavilyBtn.style.cursor = 'pointer';
        tavilyBtn.style.color = '#a36b00';
        tavilyBtn.style.borderColor = '#e0b14a';
        tavilyBtn.style.backgroundColor = 'rgba(224,177,74,.16)';
        tavilyDot.style.background = '#e0b14a';
        tavilyTxt.textContent = 'Tavily ON';
        tavilyBtn.title = i18n.t('toggle_tavily_no_key');
      } else if (tavilyOn) {
        tavilyBtn.style.opacity = '1';
        tavilyBtn.style.cursor = 'pointer';
        tavilyBtn.style.color = '#2e7d32';
        tavilyBtn.style.borderColor = '#2e7d32';
        tavilyBtn.style.backgroundColor = 'rgba(46,125,50,.08)';
        tavilyDot.style.background = '#2e7d32';
        tavilyTxt.textContent = 'Tavily ON';
        tavilyBtn.title = i18n.t('toggle_tavily_on');
      } else {
        tavilyBtn.style.opacity = '1';
        tavilyBtn.style.cursor = 'pointer';
        tavilyBtn.style.color = '';
        tavilyBtn.style.borderColor = '';
        tavilyBtn.style.backgroundColor = '';
        tavilyDot.style.background = 'currentColor';
        tavilyTxt.textContent = 'Tavily';
        tavilyBtn.title = i18n.t('toggle_tavily_off');
      }
    }

    function inject() {
      /* 取页面最后一个（最新/活跃）的工具栏，避免注入到旧对话的隐藏工具栏 */
      const toolbar = getActiveToolbar();
      if (!toolbar) return;

      const existing = toolbar.querySelector<HTMLButtonElement>('#dt-toggle');
      const existingTavily = toolbar.querySelector<HTMLButtonElement>('#dt-tavily-toggle');
      // tokenMeter 也在 shadow DOM 内，必须通过 toolbar 引用查找
      const existingMeter = toolbar.querySelector<HTMLDivElement>('#dt-token-meter');
      if (existing && existingTavily && existingMeter) {
        btn = existing;
        tavilyBtn = existingTavily;
        tokenMeter = existingMeter;
        return;
      }

      // 清理残留：直接用引用 remove，无法用 document.querySelectorAll 穿透 shadow DOM
      btn?.remove();
      tavilyBtn?.remove();
      tokenMeter?.remove();
      // 同时清理当前 toolbar 内可能遗留的同 id 元素
      toolbar.querySelector('#dt-toggle')?.remove();
      toolbar.querySelector('#dt-tavily-toggle')?.remove();
      toolbar.querySelector('#dt-token-meter')?.remove();

      const btnStyle = [
        'border-radius:20px',
        'border:1px solid currentColor',
        'padding:0 14px',
        'height:36px',
        'margin-right:8px',
        'cursor:pointer',
        'display:inline-flex',
        'align-items:center',
        'gap:7px',
        'transition:color .2s,border-color .2s,background-color .2s',
        'flex-shrink:0',
        'font-family:inherit',
        'font-size:13px',
        'font-weight:500',
        'background:transparent',
        'outline:none',
        'opacity:1',
      ].join(';');

      btn = document.createElement('button');
      btn.id = 'dt-toggle';
      btn.style.cssText = btnStyle;
      btn.innerHTML = `
        <div class="dt-tg-sp"
          style="display:none;width:14px;height:14px;
                 border:2px solid rgba(139,115,85,.25);
                 border-top-color:#8B7355;border-radius:50%;
                 animation:dtIconSpin .9s linear infinite;
                 flex-shrink:0;"></div>
        <div class="dt-tg-dot"
          style="display:block;width:7px;height:7px;
                 border-radius:50%;background:currentColor;
                 opacity:.65;flex-shrink:0;"></div>
        <span class="dt-tg-txt">${i18n.t('toggle_off')}</span>
      `;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (store.enginePhase === 'thinking' || store.enginePhase === 'summarizing' || store.enginePhase === 'clarifying') {
          abortRef.current();
          return;
        }
        if (store.agentMode === 'off') {
          store.setAgentMode('on');
        } else if (store.agentMode === 'on') {
          store.setAgentMode('auto');
        } else {
          store.setAgentMode('off');
        }
      });

      tavilyBtn = document.createElement('button');
      tavilyBtn.id = 'dt-tavily-toggle';
      tavilyBtn.style.cssText = btnStyle;
      tavilyBtn.innerHTML = `
        <div class="dt-tv-dot"
          style="display:block;width:7px;height:7px;
                 border-radius:50%;background:currentColor;
                 opacity:.75;flex-shrink:0;"></div>
        <span class="dt-tv-txt">Tavily</span>
      `;
      tavilyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (store.agentMode === 'off') return;
        store.updateConfig({ tavilyEnabled: !store.config.tavilyEnabled });
      });

      // 注入 spinner 动画（全局只需一次）
      if (!document.getElementById('dt-spin-style')) {
        const style = document.createElement('style');
        style.id = 'dt-spin-style';
        style.textContent = '@keyframes dtIconSpin{to{transform:rotate(360deg)}}';
        document.head.appendChild(style);
      }

      // ── Token Meter ──────────────────────────────────────────────────────
      tokenMeter = document.createElement('div');
      tokenMeter.id = 'dt-token-meter';
      tokenMeter.className = 'dt-token-meter-wrapper';
      tokenMeter.style.cssText = [
        'display:inline-flex',
        'align-items:center',
        'justify-content:center',
        'width:36px',
        'height:36px',
        'margin-right:4px',
        'border-radius:50%',
        'position:relative',
        'cursor:pointer',
        'flex-shrink:0',
      ].join(';');
      tokenMeter.innerHTML = `
        <style>
          .dt-token-meter-wrapper:hover .dt-tm-tooltip { display: block !important; }
          .dt-tm-tooltip {
            display: none;
            position: absolute;
            bottom: calc(100% + 8px);
            right: 0;
            background: #fff;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            padding: 14px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.12);
            width: 260px;
            z-index: 10000;
            font-family: inherit;
            color: #333;
            cursor: default;
          }
          .dt-tm-title { font-size: 14px; font-weight: 600; margin-bottom: 12px; color: #333; }
          .dt-tm-row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px; }
          .dt-tm-bar-bg { width: 100%; height: 6px; background: #eaeff4; border-radius: 3px; margin-top: 10px; overflow: hidden; }
          .dt-tm-bar-fg { height: 100%; width: 0%; background: #007bdd; transition: width 0.3s, background 0.3s; }
          .dt-tm-iq-title-wrap { display: inline-flex; align-items: center; gap: 4px; color: #777; font-size: 12px; }
          .dt-tm-iq-icon { color: #1e88e5; filter: drop-shadow(0 0 2px rgba(30,136,229,0.65)); }
          @media (prefers-color-scheme: dark) {
            .dt-tm-tooltip { background: #1e1e1e; border-color: #333; color: #eee; }
            .dt-tm-title { color: #eee; }
            .dt-tm-bar-bg { background: #333; }
          }
        </style>
        <svg width="22" height="22" viewBox="0 0 36 36" style="transform:rotate(-90deg);">
          <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" stroke-width="4" opacity="0.15" />
          <circle class="dt-tm-ring" cx="18" cy="18" r="14" fill="none" stroke="#007bdd" stroke-width="4"
            stroke-dasharray="87.96" stroke-dashoffset="87.96" stroke-linecap="round"
            style="transition:stroke-dashoffset 0.3s ease,stroke 0.3s ease;" />
        </svg>
        <div class="dt-tm-tooltip">
          <div class="dt-tm-title">${i18n.t('token_meter_title')}</div>
          <div class="dt-tm-row">
            <span style="color:#777" class="dt-tm-usage-text">0K/104K</span>
            <span class="dt-tm-pct-text" style="font-weight:600;">0%</span>
          </div>
          <div class="dt-tm-bar-bg"><div class="dt-tm-bar-fg"></div></div>
          <div style="margin-top:12px;border-top:1px solid #eee;padding-top:10px;">
            <div class="dt-tm-row" style="margin-bottom:4px;">
              <span class="dt-tm-iq-title-wrap">${IQ_LUCIDE_ICON}<span class="dt-tm-iq-title-text">${i18n.t('token_meter_iq_title')}</span></span>
              <span class="dt-tm-iq-pct" style="font-weight:600;color:#2e7d32;">100%</span>
            </div>
            <div class="dt-tm-bar-bg"><div class="dt-tm-iq-bar-fg" style="height:100%;width:100%;background:#2e7d32;transition:width 0.3s,background 0.3s;"></div></div>
            <div class="dt-tm-iq-desc" style="margin-top:6px;font-size:10px;color:#999;line-height:1.4;">${i18n.t('token_meter_iq_desc')}</div>
          </div>
        </div>
      `;

      /* 将按钮插入到 .actions-gap 前面（即 model-selector 左侧） */
      const gap = toolbar.querySelector('.actions-gap');
      if (gap) {
        toolbar.insertBefore(tokenMeter, gap);
        toolbar.insertBefore(tavilyBtn, tokenMeter);
        toolbar.insertBefore(btn, tavilyBtn);
      } else {
        // fallback：插入到 toolbar 头部
        toolbar.insertBefore(tokenMeter, toolbar.firstChild);
        toolbar.insertBefore(tavilyBtn, tokenMeter);
        toolbar.insertBefore(btn, tavilyBtn);
      }

      sync();

      /* 延迟验证存活性（Shadow DOM 内用 isConnected） */
      setTimeout(() => {
        if (!btn?.isConnected || !tavilyBtn?.isConnected || !tokenMeter?.isConnected) {
          btn = null;
          tavilyBtn = null;
          tokenMeter = null;
          inject();
        }
      }, 400);
    }

    const disposeAutorun = autorun(sync);

    /** 判断按钮是否需要重新注入（消失或在错误的工具栏中） */
    function needsReinject(): boolean {
      // Shadow DOM 内用 isConnected 而非 document.contains()
      if (!btn?.isConnected || !tavilyBtn?.isConnected || !tokenMeter?.isConnected) return true;
      // 若当前活跃工具栏不包含注入的按钮，也需要重注入
      const activeToolbar = getActiveToolbar();
      return !!activeToolbar && !activeToolbar.contains(btn);
    }

    const mutObsCallback = () => { if (needsReinject()) inject(); };
    const mutObs = new MutationObserver(mutObsCallback);
    // 观察 light DOM（捕捉顶层自定义元素的挂载/卸载）
    mutObs.observe(document.body, { childList: true, subtree: true });

    /**
     * 递归观察所有 shadow root。
     * Gemini Enterprise 的工具栏嵌套在 3 层 Shadow DOM 中：
     *   vertexaisearch-app → ucs-results → ucs-search-bar
     * 必须把每一层 shadow root 都加入 MutationObserver，
     * 否则工具栏内部的 DOM 变化（如工具栏被重建）无法被检测到。
     */
    function observeAllShadowRoots() {
      for (const sr of collectAllShadowRoots()) {
        mutObs.observe(sr, { childList: true, subtree: true });
      }
    }
    observeAllShadowRoots();

    setTimeout(() => { observeAllShadowRoots(); inject(); }, 900);
    const heartbeat = setInterval(() => {
      if (needsReinject()) inject();
    }, 2500);

    // Token 刷新定时器（对话内容非 MobX observable，需独立定时刷新）
    const tokenRefresh = setInterval(() => sync(), 1500);

    return () => {
      disposeAutorun();
      mutObs.disconnect();
      clearInterval(heartbeat);
      clearInterval(tokenRefresh);
      btn?.remove();
      tavilyBtn?.remove();
      tokenMeter?.remove();
      btn = null;
      tavilyBtn = null;
      tokenMeter = null;
    };
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps
}
