/**
 * 在 ChatGPT (chatgpt.com) 输入框底部注入「深度思考」开关按钮 + Tavily 开关。
 * 注入点：div[data-composer-surface="true"] 的 footer 网格区域。
 * 使用 MobX autorun 保持按钮与 Store 同步；MutationObserver + 心跳
 * 应对 React SPA 路由切换时输入框被卸载重建的问题。
 */
import { useEffect, useRef } from 'react';
import { autorun } from 'mobx';
import { StateStore } from '../stores/state-store';
import i18n from '../i18n';

/** 找到当前页面最底部（最新）的 ChatGPT 输入框 composer */
const COMPOSER_SEL = 'div[data-composer-surface="true"]';

export function useChatGPTInlineToggle(
  store: StateStore,
  onToggle: () => void,
  onAbort: () => void,
  enabled: boolean = true,
) {
  const toggleRef = useRef(onToggle);
  const abortRef  = useRef(onAbort);
  useEffect(() => { toggleRef.current = onToggle; }, [onToggle]);
  useEffect(() => { abortRef.current  = onAbort;  }, [onAbort]);

  useEffect(() => {
    if (!enabled) return;
    let btn: HTMLButtonElement | null = null;
    let tavilyBtn: HTMLButtonElement | null = null;
    let footerRow: HTMLDivElement | null = null;

    /* ── 公共按钮基础样式（匹配 ChatGPT composer-btn 风格） ── */
    const BASE_STYLE = [
      'display:inline-flex',
      'align-items:center',
      'gap:5px',
      'height:32px',
      'padding:0 10px',
      'border-radius:20px',
      'border:1px solid currentColor',
      'cursor:pointer',
      'font-family:inherit',
      'font-size:13px',
      'font-weight:500',
      'background:transparent',
      'outline:none',
      'flex-shrink:0',
      'transition:color .15s,border-color .15s,background-color .15s',
      'margin-right:4px',
      'white-space:nowrap',
    ].join(';');

    /* ── 根据 store 状态同步按钮外观 ── */
    function sync() {
      const phase       = store.enginePhase;
      const isActive    = store.isAgentEnabled;
      const loop        = store.currentLoop;
      const summarizing = store.isSummarizing;
      const tavilyOn    = store.config.tavilyEnabled;
      const hasTavilyKey = store.config.tavilyApiKey.trim().length > 0;

      if (!btn || !document.contains(btn)) return;
      if (!tavilyBtn || !document.contains(tavilyBtn)) return;

      // ── DT toggle ──
      const sp  = btn.querySelector<HTMLElement>('.dt-tg-sp');
      const dot = btn.querySelector<HTMLElement>('.dt-tg-dot');
      const txt = btn.querySelector<HTMLElement>('.dt-tg-txt');
      if (!sp || !dot || !txt) return;

      if (phase === 'thinking' || phase === 'summarizing' || phase === 'clarifying') {
        sp.style.display  = 'block';
        dot.style.display = 'none';
        btn.style.color   = '#8B7355';
        btn.style.borderColor = '#8B7355';
        btn.style.backgroundColor = 'rgba(139,115,85,.08)';
        if (phase === 'clarifying') {
          txt.textContent = store.config.language === 'en' ? 'Waiting...' : '等待补充信息…';
        } else {
          txt.textContent = summarizing
            ? i18n.t('toggle_summarizing')
            : i18n.t('toggle_thinking', { loop: Math.max(1, loop) });
        }
      } else if (isActive) {
        sp.style.display  = 'none';
        dot.style.display = 'block';
        (dot as HTMLElement).style.background = '#8B7355';
        btn.style.color   = '#8B7355';
        btn.style.borderColor = '#8B7355';
        btn.style.backgroundColor = 'rgba(139,115,85,.08)';
        txt.textContent = store.agentMode === 'auto' ? i18n.t('toggle_auto') : i18n.t('toggle_on');
      } else {
        sp.style.display  = 'none';
        dot.style.display = 'block';
        (dot as HTMLElement).style.background = 'currentColor';
        btn.style.color   = '';
        btn.style.borderColor = '';
        btn.style.backgroundColor = '';
        txt.textContent = i18n.t('toggle_off');
      }

      // ── Tavily toggle ──
      const tvDot = tavilyBtn.querySelector<HTMLElement>('.dt-tv-dot');
      const tvTxt = tavilyBtn.querySelector<HTMLElement>('.dt-tv-txt');
      if (!tvDot || !tvTxt) return;

      const canUseTavily = store.agentMode !== 'off';
      tavilyBtn.disabled = !canUseTavily;

      if (!canUseTavily) {
        tavilyBtn.style.opacity    = '0.45';
        tavilyBtn.style.cursor     = 'not-allowed';
        tavilyBtn.style.color      = '';
        tavilyBtn.style.borderColor = '';
        tavilyBtn.style.backgroundColor = '';
        tvDot.style.background = 'currentColor';
        tvTxt.textContent = 'Tavily';
        tavilyBtn.title = i18n.t('toggle_tavily_disabled');
      } else if (tavilyOn && !hasTavilyKey) {
        tavilyBtn.style.opacity    = '1';
        tavilyBtn.style.cursor     = 'pointer';
        tavilyBtn.style.color      = '#a36b00';
        tavilyBtn.style.borderColor = '#e0b14a';
        tavilyBtn.style.backgroundColor = 'rgba(224,177,74,.16)';
        tvDot.style.background = '#e0b14a';
        tvTxt.textContent = 'Tavily ON';
        tavilyBtn.title = i18n.t('toggle_tavily_no_key');
      } else if (tavilyOn) {
        tavilyBtn.style.opacity    = '1';
        tavilyBtn.style.cursor     = 'pointer';
        tavilyBtn.style.color      = '#2e7d32';
        tavilyBtn.style.borderColor = '#2e7d32';
        tavilyBtn.style.backgroundColor = 'rgba(46,125,50,.08)';
        tvDot.style.background = '#2e7d32';
        tvTxt.textContent = 'Tavily ON';
        tavilyBtn.title = i18n.t('toggle_tavily_on');
      } else {
        tavilyBtn.style.opacity    = '1';
        tavilyBtn.style.cursor     = 'pointer';
        tavilyBtn.style.color      = '';
        tavilyBtn.style.borderColor = '';
        tavilyBtn.style.backgroundColor = '';
        tvDot.style.background = 'currentColor';
        tvTxt.textContent = 'Tavily';
        tavilyBtn.title = i18n.t('toggle_tavily_off');
      }
    }

    /* ── 注入按钮到 ChatGPT composer footer 区域 ── */
    function inject() {
      // 取最新（最后一个）composer，匹配 ChatGPT 多 composer 场景
      const composerEls = document.querySelectorAll<HTMLElement>(COMPOSER_SEL);
      if (!composerEls.length) return;
      const composer = composerEls[composerEls.length - 1];

      /* 若按钮已在 DOM 中，复用引用 */
      const existing       = document.querySelector<HTMLButtonElement>('#dt-toggle');
      const existingTavily = document.querySelector<HTMLButtonElement>('#dt-tavily-toggle');
      const existingFooter = document.querySelector<HTMLDivElement>('#dt-chatgpt-footer');

      if (existing && existingTavily && existingFooter && document.contains(existing)) {
        btn       = existing;
        tavilyBtn = existingTavily;
        footerRow = existingFooter;
        sync();
        return;
      }

      // 清理残留
      existing?.remove();
      existingTavily?.remove();
      existingFooter?.remove();

      /* 创建 footer 容器（利用 ChatGPT 的 grid-area: footer） */
      footerRow = document.createElement('div');
      footerRow.id = 'dt-chatgpt-footer';
      footerRow.style.cssText = [
        'grid-area:footer',
        'display:flex',
        'align-items:center',
        'padding:2px 8px 6px 8px',
        'gap:4px',
        'flex-wrap:wrap',
      ].join(';');

      /* 创建 DT toggle */
      btn = document.createElement('button');
      btn.id = 'dt-toggle';
      btn.type = 'button';
      btn.style.cssText = BASE_STYLE;
      btn.innerHTML = `
        <div class="dt-tg-sp"
          style="display:none;width:13px;height:13px;
                 border:2px solid rgba(139,115,85,.25);
                 border-top-color:#8B7355;border-radius:50%;
                 animation:dtIconSpin .9s linear infinite;flex-shrink:0;"></div>
        <div class="dt-tg-dot"
          style="display:block;width:6px;height:6px;
                 border-radius:50%;background:currentColor;
                 opacity:.65;flex-shrink:0;"></div>
        <span class="dt-tg-txt">${i18n.t('toggle_off')}</span>
      `;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const phase = store.enginePhase;
        if (phase === 'thinking' || phase === 'summarizing' || phase === 'clarifying') {
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

      /* 创建 Tavily toggle */
      tavilyBtn = document.createElement('button');
      tavilyBtn.id = 'dt-tavily-toggle';
      tavilyBtn.type = 'button';
      tavilyBtn.style.cssText = BASE_STYLE;
      tavilyBtn.innerHTML = `
        <div class="dt-tv-dot"
          style="display:block;width:6px;height:6px;
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

      footerRow.appendChild(btn);
      footerRow.appendChild(tavilyBtn);
      composer.appendChild(footerRow);

      sync();

      /* React 偶尔会在注入后立刻重渲染，400ms 后验证存活 */
      setTimeout(() => {
        if ((btn && !document.contains(btn)) || (tavilyBtn && !document.contains(tavilyBtn))) {
          btn       = null;
          tavilyBtn = null;
          footerRow = null;
          inject();
        }
      }, 400);
    }

    const disposeAutorun = autorun(sync);

    const mutObs = new MutationObserver(() => {
      if (!btn || !document.contains(btn) || !tavilyBtn || !document.contains(tavilyBtn)) {
        inject();
      }
    });
    mutObs.observe(document.body, { childList: true, subtree: true });

    /* 初始注入（等 React 渲染完成） */
    setTimeout(inject, 900);

    /* 心跳兜底 */
    const heartbeat = setInterval(() => {
      if (!btn || !document.contains(btn) || !tavilyBtn || !document.contains(tavilyBtn)) {
        inject();
      }
    }, 2500);

    return () => {
      disposeAutorun();
      mutObs.disconnect();
      clearInterval(heartbeat);
      btn?.remove();
      tavilyBtn?.remove();
      footerRow?.remove();
      btn       = null;
      tavilyBtn = null;
      footerRow = null;
    };
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps
}
