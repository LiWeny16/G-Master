/**
 * 仿照 main.js injectUI()，在 Gemini 工具栏注入「深度思考」开关按钮。
 * 使用 MobX autorun 保持按钮与 Store 同步；用 MutationObserver + 心跳
 * 应对 Angular SPA 导航时工具栏被销毁重建的问题。
 */
import { useEffect, useRef } from 'react';
import { autorun } from 'mobx';
import { StateStore } from '../stores/state-store';

import i18n from '../i18n';

export function useInlineToggle(
  store: StateStore,
  onToggle: () => void,
  onAbort: () => void,
  enabled: boolean = true,
) {
  /* 用 ref 持有最新回调，避免 effect 闭包陈旧 */
  const toggleRef = useRef(onToggle);
  const abortRef = useRef(onAbort);
  useEffect(() => { toggleRef.current = onToggle; }, [onToggle]);
  useEffect(() => { abortRef.current = onAbort; }, [onAbort]);

  useEffect(() => {
    if (!enabled) return;
    let btn: HTMLButtonElement | null = null;
    let tavilyBtn: HTMLButtonElement | null = null;
    let tokenMeter: HTMLDivElement | null = null;

    /* ── 根据 store 状态同步按钮外观 ── */
    function sync() {
      /* 在 autorun 内先读取所有 observable，确保 MobX 追踪依赖 */
      const phase = store.enginePhase;   // idle | waiting | thinking | summarizing | clarifying
      const isActive = store.isAgentEnabled;
      const loop = store.currentLoop;
      const summarizing = store.isSummarizing;
      const tavilyOn = store.config.tavilyEnabled;
      const hasTavilyKey = store.config.tavilyApiKey.trim().length > 0;

      if (!btn || !document.contains(btn)) return;
      if (!tavilyBtn || !document.contains(tavilyBtn)) return;
      if (!tokenMeter || !document.contains(tokenMeter)) return;

      /* === 计算相对 Context 用量 === */
      try {
        let totalText = '';

        // 1. 用户消息：只取气泡内非隐藏的文本行（排除 dt-hidden 系统 prompt）
        const userQueryBubbles = document.querySelectorAll('.user-query-bubble-with-background .query-text');
        for (const el of userQueryBubbles) {
          // 只遍历非隐藏的 p 标签
          const lines = el.querySelectorAll('p.query-text-line:not(.dt-hidden)');
          for (const line of lines) {
            totalText += (line.textContent ?? '') + '\n';
          }
        }

        // 2. 模型回复：取 markdown 正文容器的 textContent（不受 collapsed 影响）
        const modelContents = document.querySelectorAll('.markdown.markdown-main-panel');
        for (const el of modelContents) {
          totalText += (el.textContent ?? '') + '\n';
        }

        // 3. 编辑器（输入框）中正在输入的内容
        const editors = document.querySelectorAll('.ql-editor');
        for (const el of editors) {
          totalText += (el.textContent ?? '') + '\n';
        }

        // 更精准的 token 估算：中文字符约 1 token，ASCII 字符约 4 个算 1 token
        let estimatedTokens = 0;
        for (const ch of totalText) {
          const code = ch.charCodeAt(0);
          if (code > 0x2E7F) {
            // 中日韩等宽字符，每字约 1 token
            estimatedTokens += 1;
          } else {
            // ASCII / 拉丁字符，约 4 字符 = 1 token
            estimatedTokens += 0.25;
          }
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
        const iqTitle = tokenMeter.querySelector('.dt-tm-iq-title') as HTMLSpanElement | null;
        const iqDesc = tokenMeter.querySelector('.dt-tm-iq-desc') as HTMLDivElement | null;

        if (ring && usageText && pctText && barFg) {
          if (meterTitle) meterTitle.textContent = i18n.t('token_meter_title');
          if (iqTitle) iqTitle.textContent = i18n.t('token_meter_iq_title');
          if (iqDesc) iqDesc.textContent = i18n.t('token_meter_iq_desc');

          const formattedUsed = (estimatedTokens / 1000).toFixed(1) + 'K';
          const formattedMax = (MAX_VISUAL_TOKENS / 1000).toFixed(0) + 'K';
          usageText.textContent = i18n.t('token_meter_usage', { used: formattedUsed, max: formattedMax });
          pctText.textContent = percentStr;
          barFg.style.width = percentStr;

          // 圆周率计算: circumference = 2 * Math.PI * r = 2 * 3.14159 * 14 = 87.96
          const offset = 87.96 - (rawPercent / 100) * 87.96;
          ring.style.strokeDashoffset = String(offset);

          if (rawPercent < 50) {
            const okColor = '#007bdd';
            ring.style.stroke = okColor;
            barFg.style.background = okColor;
          } else if (rawPercent < 80) {
            const warnColor = '#ed6c02';
            ring.style.stroke = warnColor;
            barFg.style.background = warnColor;
          } else {
            const errColor = '#d32f2f';
            ring.style.stroke = errColor;
            barFg.style.background = errColor;
          }

          // === 智力曲线：基于 "Lost in the Middle" 研究 ===
          // 调整曲线使其尽早开始缓慢下降: intelligence = 100 - 70 * Math.pow(contextPercent/100, 1.2)
          // 0% context → 100% IQ, 10% → ~95%, 50% → ~69%, 80% → ~46%, 100% → 30%
          const iqPercent = Math.max(0, Math.min(100,
            100 - 70 * Math.pow(rawPercent / 100, 1.2)
          ));
          const iqStr = iqPercent.toFixed(0) + '%';

          if (iqPctText) iqPctText.textContent = iqStr;
          if (iqBarFg) {
            iqBarFg.style.width = iqStr;
            // 智力条颜色：绿 → 黄 → 红
            if (iqPercent > 80) {
              iqBarFg.style.background = '#2e7d32';
            } else if (iqPercent > 60) {
              iqBarFg.style.background = '#ed6c02';
            } else {
              iqBarFg.style.background = '#d32f2f';
            }
          }
        }
        tokenMeter.removeAttribute('title');
      } catch (e) {
        /* ignore */
      }

      const sp = btn.querySelector<HTMLElement>('.dt-tg-sp');
      const dot = btn.querySelector<HTMLElement>('.dt-tg-dot');
      const txt = btn.querySelector<HTMLElement>('.dt-tg-txt');
      if (!sp || !dot || !txt) return;

      if (phase === 'thinking' || phase === 'summarizing' || phase === 'clarifying') {
        /* 思考中/澄清中：显示旋转圈，高亮色 */
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
        /* 已开启但待命：实心点，高亮色 */
        sp.style.display = 'none';
        dot.style.display = 'block';
        dot.style.background = '#8B7355';
        btn.style.color = '#8B7355';
        btn.style.borderColor = '#8B7355';
        btn.style.backgroundColor = 'rgba(139,115,85,.08)';
        txt.textContent = store.agentMode === 'auto' ? i18n.t('toggle_auto') : i18n.t('toggle_on');
      } else {
        /* 关闭：灰点，默认色 */
        sp.style.display = 'none';
        dot.style.display = 'block';
        dot.style.background = 'currentColor';
        btn.style.color = '';
        btn.style.borderColor = '';
        btn.style.backgroundColor = '';
        txt.textContent = i18n.t('toggle_off');
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

    /* ── 向 Gemini 工具栏注入按钮 ── */
    function inject() {
      const wrappers = document.querySelectorAll('.leading-actions-wrapper');
      if (!wrappers.length) return;
      const wrapper = wrappers[wrappers.length - 1] as HTMLElement;

      /* 若按钮已在 DOM 中，直接引用并更新 */
      // ⚠️ tokenMeter 插入的是 trailing-actions-wrapper，必须在整个 document 范围内查找
      const existing = wrapper.querySelector<HTMLButtonElement>('#dt-toggle');
      const existingMeter = document.querySelector<HTMLDivElement>('#dt-token-meter');
      const existingTavily = wrapper.querySelector<HTMLButtonElement>('#dt-tavily-toggle');
      if (existing) {
        btn = existing;
        tavilyBtn = existingTavily ?? null;
        tokenMeter = existingMeter ?? null;
        if (tavilyBtn && tokenMeter) return;
      }

      // 避免重复注入：如果有残留的按钮但不够完整，先清理掉
      existing?.remove();
      existingTavily?.remove();
      existingMeter?.remove();

      /* 创建按钮 */
      btn = document.createElement('button');
      btn.id = 'dt-toggle';
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
        <span class="dt-tg-txt">${i18n.t('toggle_off')}</span>
      `;

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        // 运行中点击：只中断，不切换模式
        if (store.enginePhase === 'thinking' || store.enginePhase === 'summarizing' || store.enginePhase === 'clarifying') {
          abortRef.current();
          return;
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

      tokenMeter = document.createElement('div');
      tokenMeter.id = 'dt-token-meter';
      tokenMeter.className = 'dt-token-meter-wrapper';
      tokenMeter.style.cssText = [
        'display:inline-flex',
        'align-items:center',
        'justify-content:center',
        'width:36px',
        'height:36px',
        'margin-left:auto',
        'border-radius:50%',
        'position:relative',
        'cursor:pointer',
        'flex-shrink:0'
      ].join(';');
      // 精致的UI悬浮窗
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
          /* 修复深色模式适配 */
          @media (prefers-color-scheme: dark) {
            .dt-tm-tooltip { background: #1e1e1e; border-color: #333; color: #eee; }
            .dt-tm-title { color: #eee; }
            .dt-tm-bar-bg { background: #333; }
          }
        </style>
        <svg width="22" height="22" viewBox="0 0 36 36" style="transform: rotate(-90deg);">
          <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" stroke-width="4" opacity="0.15" />
          <circle class="dt-tm-ring" cx="18" cy="18" r="14" fill="none" stroke="#007bdd" stroke-width="4" 
            stroke-dasharray="87.96" stroke-dashoffset="87.96" stroke-linecap="round" 
            style="transition: stroke-dashoffset 0.3s ease, stroke 0.3s ease;" />
        </svg>
        <div class="dt-tm-tooltip">
          <div class="dt-tm-title">${i18n.t('token_meter_title')}</div>
          <div class="dt-tm-row">
            <span style="color:#777" class="dt-tm-usage-text">0K/104K Estimated Token</span>
            <span class="dt-tm-pct-text" style="font-weight:600;">0%</span>
          </div>
          <div class="dt-tm-bar-bg"><div class="dt-tm-bar-fg"></div></div>
          <div style="margin-top:12px;border-top:1px solid #eee;padding-top:10px;">
            <div class="dt-tm-row" style="margin-bottom:4px;">
              <span class="dt-tm-iq-title" style="color:#777;font-size:12px;">${i18n.t('token_meter_iq_title')}</span>
              <span class="dt-tm-iq-pct" style="font-weight:600;color:#2e7d32;">100%</span>
            </div>
            <div class="dt-tm-bar-bg"><div class="dt-tm-iq-bar-fg" style="height:100%;width:100%;background:#2e7d32;transition:width 0.3s,background 0.3s;"></div></div>
            <div class="dt-tm-iq-desc" style="margin-top:6px;font-size:10px;color:#999;line-height:1.4;">${i18n.t('token_meter_iq_desc')}</div>
          </div>
        </div>
      `;

      /* 插到 toolbox-drawer 后面（与 main.js 相同位置） */
      const toolbox = wrapper.querySelector('toolbox-drawer');
      if (toolbox?.nextSibling) {
        wrapper.insertBefore(btn, toolbox.nextSibling);
        wrapper.insertBefore(tavilyBtn, btn.nextSibling);
      } else {
        wrapper.appendChild(btn);
        wrapper.appendChild(tavilyBtn);
      }

      /* 将 token meter 插入到最右侧的 trailing 区域或者 wrapper 尾部 */
      const trailingWrappers = document.querySelectorAll('.trailing-actions-wrapper');
      if (trailingWrappers.length) {
        const trailingWrapper = trailingWrappers[trailingWrappers.length - 1] as HTMLElement;
        trailingWrapper.insertBefore(tokenMeter, trailingWrapper.firstChild);
      } else {
        // 如果找不到 trailing wrapper，则利用 auto margin 将其推到当前 wrapper 最右侧
        wrapper.appendChild(tokenMeter);
      }

      sync();

      /* Angular 偶尔会在注入后立刻重渲染，延迟验证存活性 */
      setTimeout(() => {
        if ((btn && !document.contains(btn)) || (tavilyBtn && !document.contains(tavilyBtn)) || (tokenMeter && !document.contains(tokenMeter))) {
          btn = null;
          tavilyBtn = null;
          tokenMeter = null;
          inject();
        }
      }, 400);
    }

    /* MobX autorun：每当 store 中相关 observable 变化就同步按钮 */
    const disposeAutorun = autorun(sync);

    /* MutationObserver：监听工具栏被销毁后立即重注入 */
    const mutObs = new MutationObserver(() => {
      if (!btn || !document.contains(btn) || !tavilyBtn || !document.contains(tavilyBtn) || !tokenMeter || !document.contains(tokenMeter)) inject();
    });
    mutObs.observe(document.body, { childList: true, subtree: true });

    /* 初始注入（等 Angular 渲染完成） */
    setTimeout(inject, 900);

    /* 心跳兜底 */
    const heartbeat = setInterval(() => {
      if (!btn || !document.contains(btn) || !tavilyBtn || !document.contains(tavilyBtn) || !tokenMeter || !document.contains(tokenMeter)) inject();
    }, 2500);

    /* Token 刷新定时器：对话内容不是 MobX observable，需独立计时定期调用 sync() */
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
