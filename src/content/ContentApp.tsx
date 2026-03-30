import React, { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { StateStore } from '../stores/state-store';
import { createSiteAdapter, getSiteId } from '../adapters/adapter-factory';
import { AgentOrchestrator } from '../core/agent-orchestrator';
import { DeepThinkEngine } from '../core/deep-think-engine';
import { DOMBeautifier } from '../core/dom-beautifier';
import { DOMObserver } from '../core/dom-observer';
import FloatingBall from '../components/FloatingBall';
import Panel from '../components/Panel';
import ClarifyModal from '../components/ClarifyModal';
import { useInlineToggle } from './useInlineToggle';
import { useDoubaoInlineToggle } from './useDoubaoInlineToggle';
import { useChatGPTInlineToggle } from './useChatGPTInlineToggle';
import { useZhipuInlineToggle } from './useZhipuInlineToggle';
import { useDeepseekInlineToggle } from './useDeepseekInlineToggle';
import { GeminiConversationBulkDeleteController } from './gemini-bulk-delete';
import i18n from '../i18n';

const store = new StateStore();
const adapter = createSiteAdapter();
const siteId = getSiteId();
const engine = new DeepThinkEngine(adapter, store);
const beautifier = new DOMBeautifier(adapter, store);
const orchestrator = new AgentOrchestrator(adapter, store, engine);
const bulkDeleteController = new GeminiConversationBulkDeleteController();

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
  // configLoaded 用于延迟所有副作用，直到持久化配置读取完成
  const [configLoaded, setConfigLoaded] = useState(false);

  // Phase 1: 仅加载配置，不做任何 DOM 操作
  useEffect(() => {
    store.loadConfig().then(() => setConfigLoaded(true));
  }, []);

  // 配置加载完成后才判断当前站点是否被用户关闭
  const isSiteEnabled = configLoaded
    ? (store.config.siteEnabled?.[siteId as 'gemini' | 'doubao' | 'chatgpt' | 'zhipu' | 'deepseek'] ?? true)
    : false;

  // Phase 2: 仅在站点启用时才挂载 DOM Observer + 键盘/点击事件
  useEffect(() => {
    if (!configLoaded) return;
    if (!isSiteEnabled) return;

    // 启动 DOM Observer
    const domObserver = new DOMObserver(adapter, store, engine, beautifier, () => {
      // reinject UI callback — React handles this, no-op
    }, orchestrator);
    domObserver.start();
    observerRef.current = domObserver;

    // 对话侧边栏多选批量删除增强（仅 Gemini）
    if (siteId === 'gemini') {
      bulkDeleteController.start();
    }

    // 拦截 Enter 键发送
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && adapter.isEditorFocused()) {
        handleInterceptSend(e);
      }
    };

    // 拦截发送按钮点击
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (adapter.isSendButton(target)) {
        handleInterceptSend(e);
      }
      // 拦截停止按钮
      if (adapter.isStopButton(target) && store.isAgentEnabled) {
        // 兼容 button（ChatGPT/豆包）和 div（Kimi）两种停止容器：
        // 找到携带 data-dt-auto-stop 的最近祖先元素来判断是否为程序自动触发。
        const isAutoStop = !!(target as HTMLElement).closest?.('[data-dt-auto-stop]');
        if (!isAutoStop) {
          engine.abort();
        }
      }
    };

    document.addEventListener('keydown', handleKeydown, true);
    document.addEventListener('click', handleClick, true);

    return () => {
      document.removeEventListener('keydown', handleKeydown, true);
      document.removeEventListener('click', handleClick, true);
      if (siteId === 'gemini') {
        bulkDeleteController.stop();
      }
      domObserver.stop();
    };
  }, [configLoaded, isSiteEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  /** 构建需要注入的记忆文本（无论 agent 是否开启都可用） */
  const buildMemoryInjection = (): string => {
    const activeMemories = store.config.pinnedMemories?.filter(m => m.enabled && m.content.trim()) || [];
    if (activeMemories.length === 0) return '';
    const memoriesText = activeMemories.map(m => `[${m.title || i18n.t('app_memory_default_title')}]: ${m.content}`).join('\n\n');
    return `\n\n${i18n.t('app_memory_prefix')}\n${memoriesText}`;
  };

  /**
   * 用 adapter.appendTextAndSend 追加文本后发送。
   * 内部已做 _injecting 锁防止重入。
   */
  const doAppendTextAndSend = async (textToAppend: string) => {
    _injecting = true;
    await adapter.appendTextAndSend(textToAppend);
    setTimeout(() => { _injecting = false; }, 300);
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

    const userText = adapter.getEditorText();
    if (!userText) return;
    const effectiveMode = siteId === 'zhipu' && store.agentMode === 'auto' ? 'on' : store.agentMode;
    const isAgentEnabled = effectiveMode !== 'off';

    // === Case 1: 深度思考开启 — 走 AUTO 或 ON 流程 ===
    if (isAgentEnabled) {
      e.preventDefault();
      e.stopPropagation();

      if (effectiveMode === 'auto') {
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

      void doAppendTextAndSend(store.config.systemPromptTemplate);
      return;
    }

    // === Case 2: 深度思考关闭 — 但仍然注入记忆/系统 Prompt（如果有） ===
    const memoryText = buildMemoryInjection();
    if (!memoryText) return; // 没有记忆则不拦截，让原生送出

    e.preventDefault();
    e.stopPropagation();

    void doAppendTextAndSend(memoryText);
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

  /* 工具栏内联开关：各站点各自注入，配置未加载完或站点被禁用时传 false */
  useInlineToggle(store, handleToggleEngine, handleAbort, isSiteEnabled && siteId === 'gemini');
  useDoubaoInlineToggle(store, handleToggleEngine, handleAbort, isSiteEnabled && siteId === 'doubao');
  useChatGPTInlineToggle(store, handleToggleEngine, handleAbort, isSiteEnabled && siteId === 'chatgpt');
  useZhipuInlineToggle(store, handleToggleEngine, handleAbort, isSiteEnabled && siteId === 'zhipu');
  useDeepseekInlineToggle(store, handleToggleEngine, handleAbort, isSiteEnabled && siteId === 'deepseek');

  // 配置未加载完或站点被关闭时不渲染任何 UI
  if (!isSiteEnabled) return null;

  return (
    <>
      <FloatingBall store={store} onTogglePanel={handleTogglePanel} />
      <Panel
        store={store}
        open={panelOpen}
        anchorPos={ballPos}
        allowAutoMode={siteId !== 'zhipu'}
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
