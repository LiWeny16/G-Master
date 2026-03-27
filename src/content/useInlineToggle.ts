/**
 * 仿照 main.js injectUI()，在 Gemini 工具栏注入「深度思考」开关按钮。
 * 使用 MobX autorun 保持按钮与 Store 同步；用 MutationObserver + 心跳
 * 应对 Angular SPA 导航时工具栏被销毁重建的问题。
 */
import { useEffect, useRef } from 'react';
import { autorun } from 'mobx';
import { StateStore } from '../stores/state-store';

export function useInlineToggle(
  store: StateStore,
  onToggle: () => void,
  onAbort: () => void,
) {
  /* 用 ref 持有最新回调，避免 effect 闭包陈旧 */
  const toggleRef = useRef(onToggle);
  const abortRef  = useRef(onAbort);
  useEffect(() => { toggleRef.current = onToggle; }, [onToggle]);
  useEffect(() => { abortRef.current  = onAbort;  }, [onAbort]);

  useEffect(() => {
    let btn: HTMLButtonElement | null = null;
    let tavilyBtn: HTMLButtonElement | null = null;

    /* ── 根据 store 状态同步按钮外观 ── */
    function sync() {
      /* 在 autorun 内先读取所有 observable，确保 MobX 追踪依赖 */
      const phase       = store.enginePhase;   // idle | waiting | thinking | summarizing
      const isActive    = store.isAgentEnabled;
      const loop        = store.currentLoop;
      const summarizing = store.isSummarizing;
      const tavilyOn    = store.config.tavilyEnabled;
      const hasTavilyKey = store.config.tavilyApiKey.trim().length > 0;

      if (!btn || !document.contains(btn)) return;
      if (!tavilyBtn || !document.contains(tavilyBtn)) return;

      const sp  = btn.querySelector<HTMLElement>('.dt-tg-sp');
      const dot = btn.querySelector<HTMLElement>('.dt-tg-dot');
      const txt = btn.querySelector<HTMLElement>('.dt-tg-txt');
      if (!sp || !dot || !txt) return;

      if (phase === 'thinking' || phase === 'summarizing') {
        /* 思考中：显示旋转圈，高亮色 */
        sp.style.display  = 'block';
        dot.style.display = 'none';
        btn.style.color            = '#8B7355';
        btn.style.borderColor      = '#8B7355';
        btn.style.backgroundColor  = 'rgba(139,115,85,.08)';
        txt.textContent = summarizing ? '生成总结中…' : `思考中 · 第 ${loop} 轮`;
      } else if (isActive) {
        /* 已开启但待命：实心点，高亮色 */
        sp.style.display  = 'none';
        dot.style.display = 'block';
        dot.style.background = '#8B7355';
        btn.style.color            = '#8B7355';
        btn.style.borderColor      = '#8B7355';
        btn.style.backgroundColor  = 'rgba(139,115,85,.08)';
        txt.textContent = store.agentMode === 'auto' ? '深度思考 AUTO' : '深度思考 ON';
      } else {
        /* 关闭：灰点，默认色 */
        sp.style.display  = 'none';
        dot.style.display = 'block';
        dot.style.background = 'currentColor';
        btn.style.color            = '';
        btn.style.borderColor      = '';
        btn.style.backgroundColor  = '';
        txt.textContent = '深度思考';
      }

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
        tavilyBtn.title = '请先开启深度思考模式';
      } else if (tavilyOn && !hasTavilyKey) {
        tavilyBtn.style.opacity = '1';
        tavilyBtn.style.cursor = 'pointer';
        tavilyBtn.style.color = '#a36b00';
        tavilyBtn.style.borderColor = '#e0b14a';
        tavilyBtn.style.backgroundColor = 'rgba(224,177,74,.16)';
        tavilyDot.style.background = '#e0b14a';
        tavilyTxt.textContent = 'Tavily ON';
        tavilyBtn.title = '没有API KEY';
      } else if (tavilyOn) {
        tavilyBtn.style.opacity = '1';
        tavilyBtn.style.cursor = 'pointer';
        tavilyBtn.style.color = '#2e7d32';
        tavilyBtn.style.borderColor = '#2e7d32';
        tavilyBtn.style.backgroundColor = 'rgba(46,125,50,.08)';
        tavilyDot.style.background = '#2e7d32';
        tavilyTxt.textContent = 'Tavily ON';
        tavilyBtn.title = 'Tavily 已启用';
      } else {
        tavilyBtn.style.opacity = '1';
        tavilyBtn.style.cursor = 'pointer';
        tavilyBtn.style.color = '';
        tavilyBtn.style.borderColor = '';
        tavilyBtn.style.backgroundColor = '';
        tavilyDot.style.background = 'currentColor';
        tavilyTxt.textContent = 'Tavily';
        tavilyBtn.title = '点击启用 Tavily 搜索';
      }
    }

    /* ── 向 Gemini 工具栏注入按钮 ── */
    function inject() {
      const wrappers = document.querySelectorAll('.leading-actions-wrapper');
      if (!wrappers.length) return;
      const wrapper = wrappers[wrappers.length - 1] as HTMLElement;

      /* 若按钮已在 DOM 中，直接引用并更新 */
      const existing = wrapper.querySelector<HTMLButtonElement>('#dt-toggle');
      const existingTavily = wrapper.querySelector<HTMLButtonElement>('#dt-tavily-toggle');
      if (existing) {
        btn = existing;
        tavilyBtn = existingTavily ?? null;
        if (tavilyBtn) return;
      }

      /* 创建按钮 */
      btn = document.createElement('button');
      btn.id        = 'dt-toggle';
      btn.className = 'mdc-button mat-mdc-button-base';
      btn.style.cssText = [
        'border-radius:20px',
        'border:1px solid currentColor',
        'padding:0 14px',
        'height:40px',
        'margin-left:8px',
        'cursor:pointer',
        'display:inline-flex',
        'align-items:center',
        'gap:7px',
        'transition:color .2s,border-color .2s,background-color .2s',
        'flex-shrink:0',
        'font-family:inherit',
        'font-size:14px',
        'font-weight:500',
        'background:transparent',
        'outline:none',
        'opacity:1',
      ].join(';');

      /* 旋转圈（思考时显示）+ 状态点 + 文字 */
      btn.innerHTML = `
        <div class="dt-tg-sp"
          style="display:none;width:15px;height:15px;
                 border:2px solid rgba(139,115,85,.25);
                 border-top-color:#8B7355;border-radius:50%;
                 animation:dtIconSpin .9s linear infinite;
                 flex-shrink:0;"></div>
        <div class="dt-tg-dot"
          style="display:block;width:7px;height:7px;
                 border-radius:50%;background:currentColor;
                 opacity:.65;flex-shrink:0;"></div>
        <span class="dt-tg-txt">深度思考</span>
      `;

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        // 只有正在执行时才触发 abort
        if (store.enginePhase === 'thinking' || store.enginePhase === 'summarizing') {
          abortRef.current();
        }

        // 状态循环：off -> on -> auto -> off
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
      tavilyBtn.className = 'mdc-button mat-mdc-button-base';
      tavilyBtn.style.cssText = [
        'border-radius:20px',
        'border:1px solid currentColor',
        'padding:0 14px',
        'height:40px',
        'margin-left:8px',
        'cursor:pointer',
        'display:inline-flex',
        'align-items:center',
        'gap:7px',
        'transition:color .2s,border-color .2s,background-color .2s,opacity .2s',
        'flex-shrink:0',
        'font-family:inherit',
        'font-size:14px',
        'font-weight:500',
        'background:transparent',
        'outline:none',
        'opacity:1',
      ].join(';');
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

      /* 插到 toolbox-drawer 后面（与 main.js 相同位置） */
      const toolbox = wrapper.querySelector('toolbox-drawer');
      if (toolbox?.nextSibling) {
        wrapper.insertBefore(btn, toolbox.nextSibling);
        wrapper.insertBefore(tavilyBtn, btn.nextSibling);
      } else {
        wrapper.appendChild(btn);
        wrapper.appendChild(tavilyBtn);
      }

      sync();

      /* Angular 偶尔会在注入后立刻重渲染，延迟验证存活性 */
      setTimeout(() => {
        if ((btn && !document.contains(btn)) || (tavilyBtn && !document.contains(tavilyBtn))) {
          btn = null;
          tavilyBtn = null;
          inject();
        }
      }, 400);
    }

    /* MobX autorun：每当 store 中相关 observable 变化就同步按钮 */
    const disposeAutorun = autorun(sync);

    /* MutationObserver：监听工具栏被销毁后立即重注入 */
    const mutObs = new MutationObserver(() => {
      if (!btn || !document.contains(btn) || !tavilyBtn || !document.contains(tavilyBtn)) inject();
    });
    mutObs.observe(document.body, { childList: true, subtree: true });

    /* 初始注入（等 Angular 渲染完成） */
    setTimeout(inject, 900);

    /* 心跳兜底 */
    const heartbeat = setInterval(() => {
      if (!btn || !document.contains(btn) || !tavilyBtn || !document.contains(tavilyBtn)) inject();
    }, 2500);

    return () => {
      disposeAutorun();
      mutObs.disconnect();
      clearInterval(heartbeat);
      btn?.remove();
      tavilyBtn?.remove();
      btn = null;
      tavilyBtn = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
