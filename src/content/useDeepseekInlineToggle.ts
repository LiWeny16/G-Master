/**
 * 在 DeepSeek（chat.deepseek.com）输入工具栏注入「深度思考」开关 + Tavily 开关 + Token Meter。
 *
 * 注入点：.ec4f5d61（输入框底部工具栏）
 *   - DT 切换 + Tavily 按钮：插入工具栏最前面（leftmost）
 *   - Token Meter（圆形进度圈）：追加到工具栏最末尾
 *
 * ── 所有 DeepSeek class 选择器集中于顶部 DS_SEL，UI 变更时只改这里 ──
 *
 * 使用 MobX autorun 保持按钮与 Store 同步；
 * MutationObserver + 心跳应对 React SPA 路由切换时工具栏被卸载重建的问题。
 */
import { useEffect, useRef } from 'react';
import { autorun } from 'mobx';
import { StateStore } from '../stores/state-store';
import i18n from '../i18n';

// ─────────────────── DeepSeek DOM 选择器（UI 变更时只改这里）───────────────
const DS_SEL = {
  /** 输入框底部工具栏（DT / Tavily 注入容器） */
  inputToolbar:   '.ec4f5d61',
  /** 用户消息文本 */
  userText:       '._9663006 .fbb737a4',
  /** AI 回复 markdown 内容 */
  aiMarkdown:     '._4f9bf79 .ds-markdown',
  /** 输入框 textarea */
  textarea:       'textarea._27c9245',
} as const;

export function useDeepseekInlineToggle(
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
    let tokenMeter: HTMLDivElement | null = null;

    /* ── 按钮基础样式（匹配 DeepSeek 工具栏按钮风格） ── */
    const BASE_STYLE = [
      'display:inline-flex',
      'align-items:center',
      'gap:5px',
      'height:30px',
      'padding:0 10px',
      'border-radius:16px',
      'border:1px solid currentColor',
      'cursor:pointer',
      'font-family:inherit',
      'font-size:13px',
      'font-weight:400',
      'background:transparent',
      'outline:none',
      'flex-shrink:0',
      'transition:color .15s,border-color .15s,background-color .15s',
      'margin-right:6px',
      'white-space:nowrap',
    ].join(';');

    /* ── 根据 store 状态同步按钮与 token meter 外观 ── */
    function sync() {
      const phase       = store.enginePhase;
      const isActive    = store.isAgentEnabled;
      const loop        = store.currentLoop;
      const summarizing = store.isSummarizing;
      const tavilyOn    = store.config.tavilyEnabled;
      const hasTavilyKey = store.config.tavilyApiKey.trim().length > 0;

      if (!btn       || !document.contains(btn))       return;
      if (!tavilyBtn || !document.contains(tavilyBtn)) return;
      if (!tokenMeter|| !document.contains(tokenMeter))return;

      // ── Token Meter 计算 ──────────────────────────────────────────────────
      try {
        let totalText = '';

        // 1. 用户消息文本
        for (const el of document.querySelectorAll(DS_SEL.userText)) {
          totalText += (el.textContent ?? '') + '\n';
        }
        // 2. AI 回复 markdown
        for (const el of document.querySelectorAll(DS_SEL.aiMarkdown)) {
          totalText += (el.textContent ?? '') + '\n';
        }
        // 3. 当前正在输入的内容
        const ta = document.querySelector<HTMLTextAreaElement>(DS_SEL.textarea);
        if (ta) totalText += ta.value + '\n';

        // token 估算：中日韩约 1 token/字，ASCII 约 0.25 token/字符
        let estimatedTokens = 0;
        for (const ch of totalText) {
          estimatedTokens += ch.charCodeAt(0) > 0x2E7F ? 1 : 0.25;
        }
        estimatedTokens = Math.floor(estimatedTokens);

        const MAX_VISUAL_TOKENS = 64000;
        const rawPercent  = Math.min(100, Math.max(0, (estimatedTokens / MAX_VISUAL_TOKENS) * 100));
        const percentStr  = rawPercent.toFixed(0) + '%';

        const ring        = tokenMeter.querySelector<SVGCircleElement>('.dt-tm-ring');
        const usageText   = tokenMeter.querySelector<HTMLSpanElement>('.dt-tm-usage-text');
        const pctText     = tokenMeter.querySelector<HTMLSpanElement>('.dt-tm-pct-text');
        const barFg       = tokenMeter.querySelector<HTMLDivElement>('.dt-tm-bar-fg');
        const iqPctText   = tokenMeter.querySelector<HTMLSpanElement>('.dt-tm-iq-pct');
        const iqBarFg     = tokenMeter.querySelector<HTMLDivElement>('.dt-tm-iq-bar-fg');
        const meterTitle  = tokenMeter.querySelector<HTMLDivElement>('.dt-tm-title');
        const iqTitle     = tokenMeter.querySelector<HTMLSpanElement>('.dt-tm-iq-title');
        const iqDesc      = tokenMeter.querySelector<HTMLDivElement>('.dt-tm-iq-desc');

        if (ring && usageText && pctText && barFg) {
          if (meterTitle) meterTitle.textContent = i18n.t('token_meter_title');
          if (iqTitle)    iqTitle.textContent    = i18n.t('token_meter_iq_title');
          if (iqDesc)     iqDesc.textContent     = i18n.t('token_meter_iq_desc');

          const formattedUsed = (estimatedTokens / 1000).toFixed(1) + 'K';
          const formattedMax  = (MAX_VISUAL_TOKENS / 1000).toFixed(0) + 'K';
          usageText.textContent = i18n.t('token_meter_usage', { used: formattedUsed, max: formattedMax });
          pctText.textContent   = percentStr;
          barFg.style.width     = percentStr;

          // 圆周 = 2π × 14 ≈ 87.96
          const offset = 87.96 - (rawPercent / 100) * 87.96;
          ring.style.strokeDashoffset = String(offset);

          const color = rawPercent < 50 ? '#007bdd' : rawPercent < 80 ? '#ed6c02' : '#d32f2f';
          ring.style.stroke      = color;
          barFg.style.background = color;

          // 智力曲线：Lost in the Middle 研究
          const iqPercent = Math.max(0, Math.min(100, 100 - 70 * Math.pow(rawPercent / 100, 1.2)));
          const iqStr     = iqPercent.toFixed(0) + '%';
          if (iqPctText) iqPctText.textContent = iqStr;
          if (iqBarFg) {
            iqBarFg.style.width      = iqStr;
            iqBarFg.style.background = iqPercent > 80 ? '#2e7d32' : iqPercent > 60 ? '#ed6c02' : '#d32f2f';
          }
        }
        tokenMeter.removeAttribute('title');
      } catch (_) { /* ignore */ }

      // ── DT toggle ───────────────────────────────────────────────────────
      const sp  = btn.querySelector<HTMLElement>('.dt-tg-sp');
      const dot = btn.querySelector<HTMLElement>('.dt-tg-dot');
      const txt = btn.querySelector<HTMLElement>('.dt-tg-txt');
      if (!sp || !dot || !txt) return;

      if (phase === 'thinking' || phase === 'summarizing' || phase === 'clarifying') {
        sp.style.display  = 'block';
        dot.style.display = 'none';
        btn.style.color             = '#8B7355';
        btn.style.borderColor       = '#8B7355';
        btn.style.backgroundColor   = 'rgba(139,115,85,.08)';
        if (phase === 'clarifying') {
          txt.textContent = store.config.language === 'en' ? 'Waiting for input...' : '等待补充信息…';
        } else {
          txt.textContent = summarizing
            ? i18n.t('toggle_summarizing')
            : i18n.t('toggle_thinking', { loop: Math.max(1, loop) });
        }
        btn.title = store.config.language === 'en' ? 'Click to abort' : '点击中止';
      } else if (isActive) {
        sp.style.display  = 'none';
        dot.style.display = 'block';
        (dot as HTMLElement).style.background = '#8B7355';
        btn.style.color           = '#8B7355';
        btn.style.borderColor     = '#8B7355';
        btn.style.backgroundColor = 'rgba(139,115,85,.08)';
        txt.textContent = store.agentMode === 'auto' ? i18n.t('toggle_auto') : i18n.t('toggle_on');
        btn.title = store.config.language === 'en'
          ? 'Deep Think ON — click to switch/off'
          : '深度思考已开启 — 点击切换/关闭';
      } else {
        sp.style.display  = 'none';
        dot.style.display = 'block';
        (dot as HTMLElement).style.background = 'currentColor';
        btn.style.color           = '';
        btn.style.borderColor     = '';
        btn.style.backgroundColor = '';
        txt.textContent = i18n.t('toggle_off');
        btn.title = store.config.language === 'en' ? 'Enable Deep Think' : '开启深度思考';
      }

      // ── Tavily toggle ────────────────────────────────────────────────────
      const tvDot = tavilyBtn.querySelector<HTMLElement>('.dt-tv-dot');
      const tvTxt = tavilyBtn.querySelector<HTMLElement>('.dt-tv-txt');
      if (!tvDot || !tvTxt) return;

      const canUseTavily = store.agentMode !== 'off';
      tavilyBtn.disabled = !canUseTavily;

      if (!canUseTavily) {
        tavilyBtn.style.opacity         = '0.45';
        tavilyBtn.style.cursor          = 'not-allowed';
        tavilyBtn.style.color           = '';
        tavilyBtn.style.borderColor     = '';
        tavilyBtn.style.backgroundColor = '';
        tvDot.style.background = 'currentColor';
        tvTxt.textContent = 'Tavily';
        tavilyBtn.title = i18n.t('toggle_tavily_disabled');
      } else if (tavilyOn && !hasTavilyKey) {
        tavilyBtn.style.opacity         = '1';
        tavilyBtn.style.cursor          = 'pointer';
        tavilyBtn.style.color           = '#a36b00';
        tavilyBtn.style.borderColor     = '#e0b14a';
        tavilyBtn.style.backgroundColor = 'rgba(224,177,74,.16)';
        tvDot.style.background = '#e0b14a';
        tvTxt.textContent = 'Tavily ON';
        tavilyBtn.title = i18n.t('toggle_tavily_no_key');
      } else if (tavilyOn) {
        tavilyBtn.style.opacity         = '1';
        tavilyBtn.style.cursor          = 'pointer';
        tavilyBtn.style.color           = '#2e7d32';
        tavilyBtn.style.borderColor     = '#2e7d32';
        tavilyBtn.style.backgroundColor = 'rgba(46,125,50,.08)';
        tvDot.style.background = '#2e7d32';
        tvTxt.textContent = 'Tavily ON';
        tavilyBtn.title = i18n.t('toggle_tavily_on');
      } else {
        tavilyBtn.style.opacity         = '1';
        tavilyBtn.style.cursor          = 'pointer';
        tavilyBtn.style.color           = '';
        tavilyBtn.style.borderColor     = '';
        tavilyBtn.style.backgroundColor = '';
        tvDot.style.background = 'currentColor';
        tvTxt.textContent = 'Tavily';
        tavilyBtn.title = i18n.t('toggle_tavily_off');
      }
    }

    /* ── 注入按钮到 DeepSeek 输入工具栏 ── */
    function inject() {
      const toolbar = document.querySelector<HTMLElement>(DS_SEL.inputToolbar);
      if (!toolbar) return;

      /* 若已注入，复用引用并同步状态 */
      const existing       = document.querySelector<HTMLButtonElement>('#dt-toggle');
      const existingTavily = document.querySelector<HTMLButtonElement>('#dt-tavily-toggle');
      const existingMeter  = document.querySelector<HTMLDivElement>('#dt-token-meter');
      if (existing && existingTavily && existingMeter &&
          document.contains(existing) && document.contains(existingTavily) && document.contains(existingMeter)) {
        btn        = existing;
        tavilyBtn  = existingTavily;
        tokenMeter = existingMeter;
        sync();
        return;
      }
      existing?.remove();
      existingTavily?.remove();
      existingMeter?.remove();

      /* ── 创建 DT toggle ── */
      btn = document.createElement('button');
      btn.id   = 'dt-toggle';
      btn.type = 'button';
      btn.style.cssText = BASE_STYLE;
      btn.innerHTML = `
        <div class="dt-tg-sp"
          style="display:none;width:12px;height:12px;
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

      /* ── 创建 Tavily toggle ── */
      tavilyBtn = document.createElement('button');
      tavilyBtn.id   = 'dt-tavily-toggle';
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

      /* ── 创建 Token Meter ── */
      tokenMeter = document.createElement('div');
      tokenMeter.id        = 'dt-token-meter';
      tokenMeter.className = 'dt-token-meter-wrapper';
      tokenMeter.style.cssText = [
        'display:inline-flex',
        'align-items:center',
        'justify-content:center',
        'width:30px',
        'height:30px',
        'border-radius:50%',
        'position:relative',
        'cursor:pointer',
        'flex-shrink:0',
      ].join(';');
      tokenMeter.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 36 36" style="transform:rotate(-90deg);">
          <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" stroke-width="4" opacity="0.15"/>
          <circle class="dt-tm-ring" cx="18" cy="18" r="14" fill="none" stroke="#007bdd" stroke-width="4"
            stroke-dasharray="87.96" stroke-dashoffset="87.96" stroke-linecap="round"
            style="transition:stroke-dashoffset .3s ease,stroke .3s ease;"/>
        </svg>
        <div class="dt-tm-tooltip" style="display:none;position:absolute;bottom:calc(100% + 8px);right:0;background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:14px;box-shadow:0 4px 16px rgba(0,0,0,0.12);width:260px;z-index:10000;font-family:inherit;color:#333;cursor:default;">
          <div class="dt-tm-title" style="font-size:14px;font-weight:600;margin-bottom:12px;color:#333;">${i18n.t('token_meter_title')}</div>
          <div class="dt-tm-row" style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;">
            <span style="color:#777" class="dt-tm-usage-text">0K/64K Estimated Token</span>
            <span class="dt-tm-pct-text" style="font-weight:600;">0%</span>
          </div>
          <div class="dt-tm-bar-bg" style="width:100%;height:6px;background:#eaeff4;border-radius:3px;margin-top:10px;overflow:hidden;"><div class="dt-tm-bar-fg" style="height:100%;width:0%;background:#007bdd;transition:width .3s,background .3s;"></div></div>
          <div style="margin-top:12px;border-top:1px solid #eee;padding-top:10px;">
            <div class="dt-tm-row" style="display:flex;justify-content:space-between;margin-bottom:4px;">
              <span class="dt-tm-iq-title" style="color:#777;font-size:12px;">${i18n.t('token_meter_iq_title')}</span>
              <span class="dt-tm-iq-pct" style="font-weight:600;color:#2e7d32;">100%</span>
            </div>
            <div class="dt-tm-bar-bg" style="width:100%;height:6px;background:#eaeff4;border-radius:3px;overflow:hidden;"><div class="dt-tm-iq-bar-fg" style="height:100%;width:100%;background:#2e7d32;transition:width .3s,background .3s;"></div></div>
            <div class="dt-tm-iq-desc" style="margin-top:6px;font-size:10px;color:#999;line-height:1.4;">${i18n.t('token_meter_iq_desc')}</div>
          </div>
        </div>
      `;
      tokenMeter.addEventListener('mouseenter', () => {
        const tt = tokenMeter!.querySelector<HTMLElement>('.dt-tm-tooltip');
        if (tt) tt.style.display = 'block';
      });
      tokenMeter.addEventListener('mouseleave', () => {
        const tt = tokenMeter!.querySelector<HTMLElement>('.dt-tm-tooltip');
        if (tt) tt.style.display = 'none';
      });

      /* ── 插入到工具栏 ── */
      // DT + Tavily 插在工具栏最前面
      toolbar.insertBefore(tavilyBtn, toolbar.firstChild);
      toolbar.insertBefore(btn, toolbar.firstChild);
      // Token Meter 插入到附件上传按钮组（.bf38813a）之前，即附件按钮左侧
      const attachGroup = toolbar.querySelector<HTMLElement>('.bf38813a');
      if (attachGroup) {
        toolbar.insertBefore(tokenMeter, attachGroup);
      } else {
        toolbar.appendChild(tokenMeter);
      }

      sync();

      /* React 偶尔会在注入后重渲，延迟验证存活性 */
      setTimeout(() => {
        if (!btn || !document.contains(btn) || !tavilyBtn || !document.contains(tavilyBtn) || !tokenMeter || !document.contains(tokenMeter)) {
          btn = null; tavilyBtn = null; tokenMeter = null;
          inject();
        }
      }, 400);
    }

    /* MobX autorun：store 变化时同步按钮状态 */
    const disposeAutorun = autorun(sync);

    /* MutationObserver：工具栏销毁后立即重注入 */
    const mutObs = new MutationObserver(() => {
      if (!btn        || !document.contains(btn)        ||
          !tavilyBtn  || !document.contains(tavilyBtn)  ||
          !tokenMeter || !document.contains(tokenMeter)) {
        inject();
      }
    });
    mutObs.observe(document.body, { childList: true, subtree: true });

    /* 初始注入（等 React 渲染完成） */
    setTimeout(inject, 900);

    /* 心跳兜底 */
    const heartbeat = setInterval(() => {
      if (!btn        || !document.contains(btn)        ||
          !tavilyBtn  || !document.contains(tavilyBtn)  ||
          !tokenMeter || !document.contains(tokenMeter)) {
        inject();
      }
    }, 2500);

    /* Token Meter 独立刷新定时器（对话内容非 MobX observable） */
    const tokenRefresh = setInterval(() => sync(), 1500);

    return () => {
      disposeAutorun();
      mutObs.disconnect();
      clearInterval(heartbeat);
      clearInterval(tokenRefresh);
      btn?.remove();
      tavilyBtn?.remove();
      tokenMeter?.remove();
      btn = null; tavilyBtn = null; tokenMeter = null;
    };
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps
}
