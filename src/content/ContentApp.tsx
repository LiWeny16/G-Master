import React, { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { StateStore } from '../stores/state-store';
import { GeminiAdapter } from '../adapters/gemini-adapter';
import { AgentOrchestrator } from '../core/agent-orchestrator';
import { DeepThinkEngine } from '../core/deep-think-engine';
import { DOMBeautifier } from '../core/dom-beautifier';
import { DOMObserver } from '../core/dom-observer';
import FloatingBall from '../components/FloatingBall';
import Panel from '../components/Panel';
import ClarifyModal from '../components/ClarifyModal';
import { useInlineToggle } from './useInlineToggle';
import i18n from '../i18n';

const store = new StateStore();
const adapter = new GeminiAdapter();
const engine = new DeepThinkEngine(adapter, store);
const beautifier = new DOMBeautifier(adapter, store);
const orchestrator = new AgentOrchestrator(adapter, store, engine);

/**
 * 防止 handleInterceptSend 重入的全局锁。
 * 当我们注入文字后 setTimeout 点击 send-button 时，
 * 事件会再次触发 handleClick → handleInterceptSend，
 * 导致无限循环注入。用此标志阻断。
 */
let _injecting = false;

const ContentApp: React.FC = observer(() => {
  const [panelOpen, setPanelOpen] = useState(false);
  const [ballPos, setBallPos] = useState({ x: 0, y: 0 });
  const observerRef = useRef<DOMObserver | null>(null);

  useEffect(() => {
    // 加载持久化配置
    store.loadConfig();

    // 启动 DOM Observer
    const domObserver = new DOMObserver(adapter, store, engine, beautifier, () => {
      // reinject UI callback — React handles this, no-op
    }, orchestrator);
    domObserver.start();
    observerRef.current = domObserver;

    // 拦截 Enter 键发送
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && document.activeElement?.closest('.ql-editor')) {
        handleInterceptSend(e);
      }
    };

    // 拦截发送按钮点击
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.send-button:not(.stop)')) {
        handleInterceptSend(e);
      }
      // 拦截停止按钮
      if (target.closest('.send-button.stop') && store.isAgentEnabled) {
        engine.abort();
      }
    };

    document.addEventListener('keydown', handleKeydown, true);
    document.addEventListener('click', handleClick, true);

    return () => {
      document.removeEventListener('keydown', handleKeydown, true);
      document.removeEventListener('click', handleClick, true);
      domObserver.stop();
    };
  }, []);

  /** 构建需要注入的记忆文本（无论 agent 是否开启都可用） */
  const buildMemoryInjection = (): string => {
    const activeMemories = store.config.pinnedMemories?.filter(m => m.enabled && m.content.trim()) || [];
    if (activeMemories.length === 0) return '';
    const memoriesText = activeMemories.map(m => `[${m.title || i18n.t('app_memory_default_title')}]: ${m.content}`).join('\n\n');
    return `\n\n${i18n.t('app_memory_prefix')}\n${memoriesText}`;
  };

  /**
   * 用 insertText + 延迟点击的方式将追加文本和用户消息一起发送。
   * 内部已做 _injecting 锁防止重入。
   */
  const appendTextAndSend = (editor: HTMLElement, textToAppend: string) => {
    _injecting = true;

    editor.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    sel?.removeAllRanges();
    sel?.addRange(range);
    document.execCommand('insertText', false, textToAppend);
    editor.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));

    setTimeout(() => {
      const btn = document.querySelector('.send-button') as HTMLButtonElement | null;
      if (btn && !btn.disabled && !btn.classList.contains('stop')) btn.click();
      // 等发送完成再释放锁，给充裕的时间
      setTimeout(() => { _injecting = false; }, 300);
    }, 150);
  };

  const handleInterceptSend = (e: Event) => {
    // 防重入：如果正在注入过程中，不拦截
    if (_injecting) return;
    if (store.currentLoop > 0) return;
    if (store.userWorkflowPhase === 'intent') return;
    // 问卷模式中：禁止用户直接发送，必须通过问卷 UI
    if (store.userWorkflowPhase === 'clarify') {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    const editor = document.querySelector('.ql-editor') as HTMLElement | null;
    if (!editor || editor.innerText.trim() === '') return;

    const userText = editor.innerText.trim();

    // === Case 1: 深度思考开启 — 走 AUTO 或 ON 流程 ===
    if (store.isAgentEnabled) {
      e.preventDefault();
      e.stopPropagation();

      if (store.agentMode === 'auto') {
        // AUTO 模式：beginIntentPhase 会在内部注入记忆
        _injecting = true;
        void orchestrator.beginIntentPhase(userText).finally(() => {
          setTimeout(() => { _injecting = false; }, 300);
        });
        return;
      }

      // ON 模式：interceptFirstSend
      const finalText = engine.interceptFirstSend(userText);
      if (!finalText) return;

      appendTextAndSend(editor, store.config.systemPromptTemplate);
      return;
    }

    // === Case 2: 深度思考关闭 — 但仍然注入记忆/系统 Prompt（如果有） ===
    const memoryText = buildMemoryInjection();
    if (!memoryText) return; // 没有记忆则不拦截，让原生送出

    e.preventDefault();
    e.stopPropagation();

    appendTextAndSend(editor, memoryText);
  };

  const handleTogglePanel = () => {
    const ball = document.getElementById('dt-floating-ball');
    if (ball) {
      const rect = ball.getBoundingClientRect();
      setBallPos({ x: rect.left, y: rect.top });
    }
    setPanelOpen((prev) => !prev);
  };

  const handleToggleEngine = () => {
    store.setAgentMode('on');
  };

  const handleAbort = () => {
    engine.abort();
  };

  /** 问卷提交 */
  const handleClarifySubmit = (answers: string[]) => {
    void orchestrator.resumeAfterClarify(answers);
  };

  /** 跳过问卷，直接继续（携带空答案） */
  const handleClarifySkip = () => {
    void orchestrator.resumeAfterClarify([]);
  };

  /* 工具栏内联开关（仿 main.js injectUI，带旋转圈状态显示） */
  useInlineToggle(store, handleToggleEngine, handleAbort);

  return (
    <>
      <FloatingBall store={store} onTogglePanel={handleTogglePanel} />
      <Panel
        store={store}
        open={panelOpen}
        anchorPos={ballPos}
        onClose={() => setPanelOpen(false)}
        onAbort={handleAbort}
      />
      <ClarifyModal
        store={store}
        onSubmit={handleClarifySubmit}
        onSkip={handleClarifySkip}
      />
    </>
  );
});

export default ContentApp;
