// ==UserScript==
// @name         Gemini Agentic Loop V8 (UI-Friendly 可视化版)
// @namespace    https://docs.scriptcat.org/
// @version      8.0.0
// @description  系统提示词对用户不可见，ACTION标记替换为可视化UI徽章，输入区显示思考状态
// @author       You & Gemini
// @match        https://gemini.google.com/app/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=gemini.google.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // ==========================================
    // 1. 全局配置与状态机
    // ==========================================
    const CONFIG = {
        continueMarker: "[ACTION: THINK_MORE]",
        finishMarker: "[ACTION: GOAL_REACHED]",
        nextPromptPattern: /\[NEXT_PROMPT:\s*([\s\S]*?)\]/,
        dtMarkerPattern: /⟪DT:(.+?)⟫/,
        maxLoops: 10,
        minLoops: 3,        // 强制最少思考轮次，低于此轮次时 GOAL_REACHED 会被拦截
        loopDelay: 1500,
        // 轮换式审查视角：每轮从不同维度挑战答案，防止每次都问同一个问题
        reviewPhases: [
            "从【逻辑结构】角度：找出论证链条中的跳跃、循环论证或未被证明的前提假设",
            "从【反驳视角】角度：扮演最强烈的反对者，给出最具破坏力的反例或反驳论点",
            "从【边界情况】角度：找出哪些特殊场景、极端条件或例外情况会让当前结论失效",
            "从【事实核查】角度：挑战你援引的数据、来源和案例，是否有更权威或更新的信息",
            "从【可行性】角度：评估方案落地时会遇到的实际阻力、成本与取舍"
        ]
    };

    const SYSTEM_TAIL = `\n\n⟪DT:🧠 深度思考模式已激活⟫\n[系统指令]：请进入"深度反思与自我审查"模式。严格遵守：
1. 严禁胡编乱造。不确定就说"我不确定"。
2. 论点须提供可信数据来源或参考 URL。
3. 【锚定原则】所有思考必须围绕用户原始问题展开，禁止偏离。
4. 【自我质疑】【强制多轮思考】在回答后，必须主动检查：逻辑链是否有跳跃？是否存在反例？是否有遗漏的边界情况？若任何一项存疑，在回答【最末尾】附上 ${CONFIG.continueMarker}，并另起一行输出 [NEXT_PROMPT: 具体质疑问题]
5. 【高标准结束条件】只有同时满足以下全部条件才能输出 ${CONFIG.finishMarker}：(a) 核心论点有事实依据支撑；(b) 已从反对角度检验并无法推翻；(c) 主要边界情况已被覆盖；(d) 对原始问题有直接、完整的回应。如有任何条件未满足，必须继续输出 ${CONFIG.continueMarker}。
严格遵守。`;

    let state = {
        isAgentEnabled: false,
        isGenerating: false,
        currentLoop: 0,
        userAborted: false,
        originalQuestion: '',
        isSummarizing: false,
        lastRawText: ''
    };

    let uiButton = null;
    let statusBarEl = null;
    let processDOMTimer = null;

    // ==========================================
    // 2. CSS 样式注入
    // ==========================================
    function injectStyles() {
        if (document.querySelector('#dt-agentic-style')) return;
        const style = document.createElement('style');
        style.id = 'dt-agentic-style';
        style.innerHTML = `
@keyframes dtSpin { 100% { transform: rotate(360deg); } }
@keyframes dtPulse { 0%,100% { opacity:1 } 50% { opacity:.5 } }
@keyframes dtFadeIn { from { opacity:0; transform:translateY(4px) } to { opacity:1; transform:translateY(0) } }

.dt-hidden { display:none !important; }
.dt-auto-bubble .expand-button { display:none !important; }
.dt-auto-bubble .query-text { max-height:none !important; overflow:visible !important; -webkit-line-clamp:unset !important; }

.dt-bubble-tag { margin-top:6px; animation:dtFadeIn .3s ease; }
.dt-tag {
    display:inline-flex; align-items:center; gap:5px;
    padding:4px 12px; border-radius:14px;
    font-size:12px; font-weight:600; line-height:1.5;
    letter-spacing:.3px;
}
.dt-tag-green  { background:rgba(30,163,98,.1);  color:#1ea362; border:1px solid rgba(30,163,98,.2); }
.dt-tag-blue   { background:rgba(66,133,244,.1);  color:#4285f4; border:1px solid rgba(66,133,244,.2); }
.dt-tag-orange { background:rgba(251,188,4,.12);  color:#e8a000; border:1px solid rgba(251,188,4,.25); }

.dt-resp-badge {
    display:flex; align-items:center; gap:8px;
    padding:10px 16px; margin-top:16px; border-radius:12px;
    font-size:13px; font-weight:500;
    animation:dtFadeIn .4s ease;
}
.dt-badge-think {
    background:linear-gradient(135deg,rgba(30,163,98,.05),rgba(30,163,98,.13));
    color:#1ea362; border-left:3px solid #1ea362;
}
.dt-badge-done {
    background:linear-gradient(135deg,rgba(66,133,244,.05),rgba(66,133,244,.13));
    color:#4285f4; border-left:3px solid #4285f4;
}
.dt-badge-final {
    background:linear-gradient(135deg,rgba(156,39,176,.05),rgba(156,39,176,.13));
    color:#9c27b0; border-left:3px solid #9c27b0;
}

.dt-status-bar {
    display:none; align-items:center; gap:6px;
    margin-left:12px; animation:dtFadeIn .3s ease;
}
.dt-status-pill {
    display:inline-flex; align-items:center; gap:4px;
    padding:3px 11px; border-radius:12px;
    font-size:11px; font-weight:600;
    animation:dtPulse 2s ease-in-out infinite;
}
.dt-pill-green { background:rgba(30,163,98,.1); color:#1ea362; }
.dt-pill-blue  { background:rgba(66,133,244,.1); color:#4285f4; }
`;
        document.head.appendChild(style);
    }

    // ==========================================
    // 3. 构建最终总结 Prompt
    // ==========================================
    function buildSummaryPrompt() {
        return `[最终总结指令]：深度思考已结束。回顾从原始问题到现在的全部思考与修正，针对：

「${state.originalQuestion}」

给出全面最终总结。要求：
1. 结构清晰，善用标题、表格等排版。
2. 整合已验证的核心结论，剔除已推翻的错误。
3. 标注不确定部分。
4. 附上引用来源和链接。
5. 直接完整回应原始问题。

直接输出总结，无需附加任何 ACTION 标记。`;
    }

    // ==========================================
    // 4. DOM 美化处理系统
    // ==========================================

    // 防止我们自己的 DOM 操作触发 observer 形成反馈死循环
    let _domBusy = false;

    function processDOM() {
        if (_domBusy) return;
        _domBusy = true;
        processUserBubbles();
        processResponseMarkers();
        updateStatusBar();
        // 100ms 后解锁，让本轮 DOM 变化的 mutation 静默通过
        setTimeout(() => { _domBusy = false; }, 100);
    }

    function debouncedProcessDOM() {
        clearTimeout(processDOMTimer);
        // 缩短到 80ms，减少初次渲染看到原始文本的时间
        processDOMTimer = setTimeout(processDOM, 80);
    }

    function processUserBubbles() {
        document.querySelectorAll('.query-text').forEach(qt => {
            // 已处理过就跳过，避免反复操作
            if (qt.dataset.dtDone === '1') return;

            const fullText = qt.innerText;
            const m = fullText.match(CONFIG.dtMarkerPattern);
            if (!m) return;

            const label = m[1];
            const lines = qt.querySelectorAll('.query-text-line');
            let foundMarker = false;
            let hasUserContent = false;

            for (const line of lines) {
                if (line.textContent.includes('⟪DT:')) foundMarker = true;
                if (foundMarker) {
                    line.classList.add('dt-hidden');
                } else if (line.textContent.trim()) {
                    hasUserContent = true;
                }
            }

            if (!hasUserContent) {
                lines.forEach(l => l.classList.add('dt-hidden'));
                const bubble = qt.closest('.user-query-bubble-with-background');
                if (bubble) bubble.classList.add('dt-auto-bubble');
            }

            let cls = 'dt-tag-green';
            if (label.includes('总结')) cls = 'dt-tag-blue';
            if (label.includes('纠偏') || label.includes('警告')) cls = 'dt-tag-orange';

            const tag = document.createElement('div');
            tag.className = 'dt-bubble-tag';
            tag.innerHTML = `<span class="dt-tag ${cls}">${label}</span>`;
            qt.appendChild(tag);

            // 标记已处理，防止 observer 重复触发
            qt.dataset.dtDone = '1';
        });
    }

    function processResponseMarkers() {
        if (state.isGenerating) return;

        document.querySelectorAll('message-content').forEach(msg => {
            // 已完全处理过（markers 已从文本删除，badge 已稳定）则跳过
            if (msg.dataset.dtDone === '1') return;

            const text = msg.innerText;
            const hasContinue = text.includes(CONFIG.continueMarker);
            const hasFinish = text.includes(CONFIG.finishMarker);
            const hasNextPrompt = text.includes('[NEXT_PROMPT:');

            if (!hasContinue && !hasFinish && !hasNextPrompt) return;

            // 移除旧 badge（只在首次处理时有效，之后有 dtDone 保护）
            msg.querySelectorAll('.dt-resp-badge').forEach(b => b.remove());

            const walker = document.createTreeWalker(msg, NodeFilter.SHOW_TEXT);
            const textNodes = [];
            while (walker.nextNode()) textNodes.push(walker.currentNode);

            for (const node of textNodes) {
                if (node.closest?.('.dt-resp-badge')) continue;
                let t = node.textContent;
                let changed = false;
                if (t.includes(CONFIG.continueMarker)) { t = t.replace(CONFIG.continueMarker, ''); changed = true; }
                if (t.includes(CONFIG.finishMarker))   { t = t.replace(CONFIG.finishMarker, '');   changed = true; }
                if (changed) node.textContent = t;
            }

            msg.querySelectorAll('p, li, span').forEach(el => {
                if (el.closest('.dt-resp-badge')) return;
                if (el.textContent.includes('[NEXT_PROMPT:')) el.classList.add('dt-hidden');
            });

            const children = Array.from(msg.children);
            for (let i = children.length - 1; i >= 0; i--) {
                const c = children[i];
                if (c.classList?.contains('dt-resp-badge')) continue;
                if (c.textContent.trim() === '' && !c.querySelector('img,table,pre,code')) {
                    c.classList.add('dt-hidden');
                } else {
                    break;
                }
            }

            const badge = document.createElement('div');
            if (hasContinue) {
                badge.className = 'dt-resp-badge dt-badge-think';
                badge.textContent = `🔄 继续深入思考 · 第 ${state.currentLoop} 轮`;
                msg.appendChild(badge);
            } else if (hasFinish) {
                badge.className = 'dt-resp-badge dt-badge-done';
                badge.textContent = '✅ 深度思考完成 · 正在生成最终总结...';
                msg.appendChild(badge);
            }

            // 标记为已处理，防止 observer 引发的重复调用再次删除/添加 badge
            msg.dataset.dtDone = '1';
        });
    }

    function updateStatusBar() {
        if (!statusBarEl) return;
        if (!state.isAgentEnabled || state.currentLoop === 0) {
            statusBarEl.style.display = 'none';
            return;
        }
        statusBarEl.style.display = 'flex';
        if (state.isSummarizing) {
            statusBarEl.innerHTML = `<span class="dt-status-pill dt-pill-blue">📋 正在生成最终总结</span>`;
        } else {
            statusBarEl.innerHTML = `<span class="dt-status-pill dt-pill-green">🧠 第 ${state.currentLoop} 轮深度思考中</span>`;
        }
    }

    // ==========================================
    // 5. 拦截手动停止操作
    // ==========================================
    document.addEventListener('click', (e) => {
        if (!state.isAgentEnabled) return;
        if (e.target.closest('.send-button.stop')) {
            state.userAborted = true;
            toggleAgent(false);
        }
    }, true);

    // ==========================================
    // 6. 拦截首次发送 + 记录原始问题
    // ==========================================
    function interceptFirstSend(e) {
        if (!state.isAgentEnabled || state.currentLoop > 0) return;

        const editor = document.querySelector('.ql-editor');
        if (!editor || editor.innerText.trim() === '') return;

        e.preventDefault();
        e.stopPropagation();

        state.originalQuestion = editor.innerText.trim();

        editor.focus();
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);

        document.execCommand('insertText', false, SYSTEM_TAIL);
        editor.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));

        state.currentLoop = 1;
        state.userAborted = false;
        state.isSummarizing = false;
        updateUIState();

        setTimeout(() => {
            const btn = document.querySelector('.send-button');
            if (btn && !btn.disabled && !btn.classList.contains('stop')) btn.click();
        }, 150);
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && document.activeElement?.closest('.ql-editor')) {
            interceptFirstSend(e);
        }
    }, true);

    document.addEventListener('click', (e) => {
        if (e.target.closest('.send-button:not(.stop)')) interceptFirstSend(e);
    }, true);

    // ==========================================
    // 7. 发送 Prompt（支持 DT 标签前缀）
    // ==========================================
    function sendPrompt(text, dtLabel) {
        const editor = document.querySelector('.ql-editor');
        if (!editor) return;

        const finalText = dtLabel ? `⟪DT:${dtLabel}⟫\n${text}` : text;

        editor.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, finalText);
        editor.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));

        let checks = 0;
        const trySend = setInterval(() => {
            if (state.userAborted) { clearInterval(trySend); return; }
            const btn = document.querySelector('.send-button');
            checks++;
            if (btn && !btn.disabled && !btn.classList.contains('stop')) {
                clearInterval(trySend);
                setTimeout(() => btn.click(), 150);
            } else if (checks > 15) {
                clearInterval(trySend);
            }
        }, 200);
    }

    // ==========================================
    // 8. 核心逻辑：解析反思结果并推进
    // ==========================================
    function evaluateAndAct() {
        if (!state.isAgentEnabled || state.userAborted) return;

        const rawText = state.lastRawText;
        if (!rawText) return;

        if (state.isSummarizing) {
            processDOM();
            state.isSummarizing = false;
            state.currentLoop = 0;
            toggleAgent(false);
            return;
        }

        if (rawText.includes(CONFIG.continueMarker)) {
            state.currentLoop++;
            if (state.currentLoop > CONFIG.maxLoops) {
                state.isSummarizing = true;
                updateUIState();
                processDOM();
                sendPrompt(buildSummaryPrompt(), '📋 生成最终总结（达到上限）');
                return;
            }
            updateUIState();
            processDOM();

            // 优先使用 AI 自己提出的下一步问题；若没有，则从 reviewPhases 轮换取一个维度
            const pm = rawText.match(CONFIG.nextPromptPattern);
            const phaseIdx = (state.currentLoop - 2) % CONFIG.reviewPhases.length;
            const phaseFallback = CONFIG.reviewPhases[Math.max(0, phaseIdx)];
            const next = pm?.[1]?.trim() || phaseFallback;

            sendPrompt(
                `[自我审查任务]：${next}\n\n` +
                `【锚定提醒】所有反思必须围绕原始问题「${state.originalQuestion}」展开。\n\n` +
                `请严苛自我挑刺与修正。补充事实来源和URL。不懂就说不懂。\n` +
                `只有同时满足：(a)论点有依据 (b)反驳角度已检验 (c)边界情况已覆盖，才可输出 ${CONFIG.finishMarker} 结束。\n` +
                `否则输出 ${CONFIG.continueMarker} + [NEXT_PROMPT: ...] 继续。`,
                `🔄 第${state.currentLoop}轮 · 自我审查`
            );

        } else if (rawText.includes(CONFIG.finishMarker)) {
            // 强制最小轮次：未达到 minLoops 时拦截 GOAL_REACHED，注入下一轮审查
            if (state.currentLoop < CONFIG.minLoops) {
                state.currentLoop++;
                const phaseIdx = (state.currentLoop - 2) % CONFIG.reviewPhases.length;
                const forcedTask = CONFIG.reviewPhases[Math.max(0, phaseIdx)];
                updateUIState();
                processDOM();
                sendPrompt(
                    `[强制深化审查]：你过早得出结论，系统要求至少完成 ${CONFIG.minLoops} 轮审查（当前第 ${state.currentLoop} 轮）。\n\n` +
                    `本轮强制审查视角：${forcedTask}\n\n` +
                    `【锚定提醒】所有反思必须围绕原始问题「${state.originalQuestion}」展开。\n\n` +
                    `完成后，若发现新问题输出 ${CONFIG.continueMarker} + [NEXT_PROMPT: ...]；若已满足全部结束条件则输出 ${CONFIG.finishMarker}。`,
                    `🔍 第${state.currentLoop}轮 · 强制深化`
                );
                return;
            }
            state.isSummarizing = true;
            updateUIState();
            processDOM();
            sendPrompt(buildSummaryPrompt(), '📋 生成最终总结');

        } else {
            processDOM();
            sendPrompt(
                `[系统警告]：未检测到动作标记。请围绕原始问题「${state.originalQuestion}」思考。\n` +
                `必须在末尾加上 ${CONFIG.continueMarker} + [NEXT_PROMPT: ...] 继续，或 ${CONFIG.finishMarker} 结束。`,
                '⚠️ 系统纠偏'
            );
        }
    }

    // ==========================================
    // 9. 状态监听 (MutationObserver)
    // ==========================================
    const observer = new MutationObserver((mutations) => {
        let shouldCheckUI = false;
        for (const mutation of mutations) {
            if (mutation.target.classList?.contains('send-button')) {
                const isStop = mutation.target.classList.contains('stop');

                if (state.isGenerating && !isStop) {
                    state.isGenerating = false;
                    const msgs = document.querySelectorAll('message-content');
                    if (msgs.length > 0) {
                        state.lastRawText = msgs[msgs.length - 1].innerText;
                    }
                    processDOM();
                    if (state.isAgentEnabled && (state.currentLoop > 0 || state.isSummarizing) && !state.userAborted) {
                        setTimeout(evaluateAndAct, CONFIG.loopDelay);
                    }
                } else if (!state.isGenerating && isStop) {
                    state.isGenerating = true;
                }
            }
            if (mutation.addedNodes.length > 0) shouldCheckUI = true;
            // 监听我们的按钮或其容器被移除（Angular SPA 导航时旧 wrapper 被销毁）
            if (!shouldCheckUI) {
                for (const node of mutation.removedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE &&
                        (node.id === 'dt-toggle' || node.id === 'dt-status-bar' ||
                         node.classList?.contains('leading-actions-wrapper') ||
                         node.querySelector?.('#dt-toggle'))) {
                        shouldCheckUI = true;
                        break;
                    }
                }
            }
        }
        if (shouldCheckUI) {
            injectUI();
            // 如果当前正在我们自己改 DOM，忽略 observer 反馈，避免闪烁
            if (!_domBusy) debouncedProcessDOM();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

    // ==========================================
    // 10. UI 控制
    // ==========================================
    function toggleAgent(force = null) {
        state.isAgentEnabled = force !== null ? force : !state.isAgentEnabled;
        if (!state.isAgentEnabled) {
            state.currentLoop = 0;
            state.userAborted = false;
            state.isSummarizing = false;
            state.lastRawText = '';
        }
        updateUIState();
    }

    function updateUIState() {
        if (!uiButton || !document.contains(uiButton)) return;
        const icon = uiButton.querySelector('mat-icon');
        const text = uiButton.querySelector('span');
        uiButton.style.opacity = state.isAgentEnabled ? '1' : '0.7';

        if (state.isAgentEnabled) {
            uiButton.style.color = '#1ea362';
            uiButton.style.borderColor = '#1ea362';
            uiButton.style.backgroundColor = 'rgba(30,163,98,.08)';
            if (state.isSummarizing) {
                icon.style.animation = 'dtSpin 1.5s linear infinite';
                text.innerText = '正在生成最终总结...';
            } else if (state.currentLoop > 0) {
                icon.style.animation = 'dtSpin 2s linear infinite';
                text.innerText = `深度思考中 (第 ${state.currentLoop} 轮)`;
            } else {
                icon.style.animation = 'none';
                text.innerText = '深度思考: ON';
            }
        } else {
            uiButton.style.color = 'inherit';
            uiButton.style.borderColor = 'currentColor';
            uiButton.style.backgroundColor = 'transparent';
            icon.style.animation = 'none';
            text.innerText = '深度思考: OFF';
        }
        updateStatusBar();
    }

    function injectUI() {
        injectStyles();
        // 取 querySelectorAll 的最后一个，避免 Angular SPA 导航时新旧 wrapper 并存
        // 期间 querySelector 可能返回正在被移除的旧 wrapper 而非新 wrapper
        const wrappers = document.querySelectorAll('.leading-actions-wrapper');
        if (!wrappers.length) return;
        const wrapper = wrappers[wrappers.length - 1];

        // 找 toolbox-drawer 作为锚点，把按钮插在它后面，紧邻"工具"按钮
        const toolbox = wrapper.querySelector('toolbox-drawer');

        if (!wrapper.querySelector('#dt-toggle')) {
            uiButton = document.createElement('button');
            uiButton.id = 'dt-toggle';
            uiButton.className = 'mdc-button mat-mdc-button-base';
            uiButton.style.cssText = `
                border-radius:20px; border:1px solid currentColor;
                padding:0 16px; height:40px; margin-left:8px;
                cursor:pointer; display:inline-flex; align-items:center;
                opacity:.7; transition:all .2s ease; flex-shrink:0;
            `;
            uiButton.innerHTML = `
                <mat-icon class="mat-icon google-symbols" style="font-size:20px;margin-right:6px;">policy</mat-icon>
                <span style="font-size:14px;font-weight:500;">深度思考: OFF</span>
            `;
            uiButton.addEventListener('click', () => toggleAgent());

            // 插到 toolbox-drawer 之后；若找不到则直接追加
            if (toolbox && toolbox.nextSibling) {
                wrapper.insertBefore(uiButton, toolbox.nextSibling);
            } else {
                wrapper.appendChild(uiButton);
            }
            updateUIState();

            // 延迟验证：Angular 偶尔会在注入后立刻重渲染 wrapper，导致按钮被销毁
            setTimeout(() => {
                if (uiButton && !document.contains(uiButton)) {
                    uiButton = null;
                    statusBarEl = null;
                    injectUI();
                }
            }, 400);
        } else {
            uiButton = wrapper.querySelector('#dt-toggle');
        }

        if (!wrapper.querySelector('#dt-status-bar')) {
            statusBarEl = document.createElement('div');
            statusBarEl.id = 'dt-status-bar';
            statusBarEl.className = 'dt-status-bar';
            // status bar 跟在按钮后面
            if (uiButton && uiButton.nextSibling) {
                wrapper.insertBefore(statusBarEl, uiButton.nextSibling);
            } else {
                wrapper.appendChild(statusBarEl);
            }
            updateStatusBar();
        } else {
            statusBarEl = wrapper.querySelector('#dt-status-bar');
        }
    }

    // 初始注入
    setTimeout(injectUI, 1000);
    // 心跳：每 2 秒检查一次，应对 Angular 重渲后按钮消失的情况
    setInterval(injectUI, 2000);

})();
