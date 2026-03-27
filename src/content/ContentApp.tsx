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
import { useInlineToggle } from './useInlineToggle';

const store = new StateStore();
const adapter = new GeminiAdapter();
const engine = new DeepThinkEngine(adapter, store);
const beautifier = new DOMBeautifier(adapter, store);
const orchestrator = new AgentOrchestrator(adapter, store, engine);

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

  const handleInterceptSend = (e: Event) => {
    if (!store.isAgentEnabled || store.currentLoop > 0) return;
    if (store.userWorkflowPhase === 'intent') return;

    const editor = document.querySelector('.ql-editor') as HTMLElement | null;
    if (!editor || editor.innerText.trim() === '') return;

    e.preventDefault();
    e.stopPropagation();

    const userText = editor.innerText.trim();

    if (store.agentMode === 'auto') {
      void orchestrator.beginIntentPhase(userText);
      return;
    }

    const finalText = engine.interceptFirstSend(userText);
    if (!finalText) return;

    editor.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    sel?.removeAllRanges();
    sel?.addRange(range);
    document.execCommand('insertText', false, store.config.systemPromptTemplate);
    editor.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));

    setTimeout(() => {
      const btn = document.querySelector('.send-button') as HTMLButtonElement | null;
      if (btn && !btn.disabled && !btn.classList.contains('stop')) btn.click();
    }, 150);
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
    </>
  );
});

export default ContentApp;
