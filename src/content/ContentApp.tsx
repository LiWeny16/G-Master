import React, { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { StateStore } from '../stores/state-store';
import { createSiteAdapter, getSiteId } from '../adapters/adapter-factory';
import { AgentLoop } from '../core/agent-loop';
import { DOMBeautifier } from '../core/dom-beautifier';
import { DOMObserver } from '../core/dom-observer';
import FloatingBall from '../components/FloatingBall';
import Panel from '../components/Panel';
import ClarifyModal from '../components/ClarifyModal';
import FileOpApprovalModal from '../components/FileOpApprovalModal';
import { useInlineToggle } from './useInlineToggle';
import { useDoubaoInlineToggle } from './useDoubaoInlineToggle';
import { useChatGPTInlineToggle } from './useChatGPTInlineToggle';
import { useZhipuInlineToggle } from './useZhipuInlineToggle';
import { useDeepseekInlineToggle } from './useDeepseekInlineToggle';
import { useGeminiEnterpriseInlineToggle } from './useGeminiEnterpriseInlineToggle';
import { GeminiConversationBulkDeleteController } from './gemini-bulk-delete';
import i18n from '../i18n';
import { restoreHandle, hasRoot } from '../background/tools/local-workspace';
import { updateEditStatus } from '../background/tools/edit-history';
import { writeTextFile } from '../background/tools/local-workspace';
import { createRoot } from 'react-dom/client';
import DiffBlock from '../components/DiffBlock';
import '../components/DiffBlock.css';

const store = new StateStore();
const adapter = createSiteAdapter();
const siteId = getSiteId();
const agentLoop = new AgentLoop(adapter, store);
const beautifier = new DOMBeautifier(adapter, store);
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

  // Phase 1.5: 配置加载后，若启用了本地工作区则静默恢复上次授权的文件夹
  useEffect(() => {
    if (!configLoaded) return;
    if (store.config.localFolderEnabled && !hasRoot()) {
      restoreHandle().catch(() => { /* 静默失败，用户可手动重新授权 */ });
    }
  }, [configLoaded]);

  // 配置加载完成后才判断当前站点是否被用户关闭
  const isSiteEnabled = configLoaded
    ? (store.config.siteEnabled?.[siteId as 'gemini' | 'gemini-enterprise' | 'doubao' | 'chatgpt' | 'zhipu' | 'deepseek'] ?? true)
    : false;

  // Phase 2: 仅在站点启用时才挂载 DOM Observer + 键盘/点击事件
  useEffect(() => {
    if (!configLoaded) return;
    if (!isSiteEnabled) return;

    // 启动 DOM Observer
    const domObserver = new DOMObserver(adapter, store, agentLoop, beautifier, () => {
      // reinject UI callback — React handles this, no-op
    });
    domObserver.start();
    observerRef.current = domObserver;

    // 监听 diff 挂载点出现，自动渲染 DiffBlock
    const diffObserver = new MutationObserver(() => {
      renderDiffMounts();
    });
    diffObserver.observe(document.body, { childList: true, subtree: true });

    // 对话侧边栏多选批量删除增强（仅 Gemini）
    if (siteId === 'gemini' || siteId === 'gemini-enterprise') {
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
      // composedPath()[0] 是事件的真实最深来源元素，能穿透 Shadow DOM 边界；
      // e.target 在 shadow boundary 处会被 retarget 为 shadow host，无法用于判断内部按钮。
      const target = (e.composedPath?.()[0] ?? e.target) as HTMLElement;
      if (adapter.isSendButton(target)) {
        handleInterceptSend(e);
      }
      // 拦截停止按钮
      if (adapter.isStopButton(target) && store.isAgentEnabled) {
        const isAutoStop = e.composedPath?.().some(
          (el) => (el as HTMLElement)?.hasAttribute?.('data-dt-auto-stop'),
        ) ?? !!(target).closest?.('[data-dt-auto-stop]');
        if (!isAutoStop) {
          agentLoop.abort();
        }
      }
    };

    document.addEventListener('keydown', handleKeydown, true);
    document.addEventListener('click', handleClick, true);

    return () => {
      document.removeEventListener('keydown', handleKeydown, true);
      document.removeEventListener('click', handleClick, true);
      diffObserver.disconnect();
      if (siteId === 'gemini' || siteId === 'gemini-enterprise') {
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
    // Agent 循环运行中：禁止重复发送
    if (store.userWorkflowPhase === 'running') return;
    // 问卷/文件审批模式中：禁止用户直接发送
    if (store.userWorkflowPhase === 'clarify' || store.userWorkflowPhase === 'awaiting_file_op') {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    const userText = adapter.getEditorText();
    if (!userText) return;
    const effectiveMode = siteId === 'zhipu' && store.agentMode === 'auto' ? 'on' : store.agentMode;
    const isAgentEnabled = effectiveMode !== 'off';

    // === Case 1: Agent 启用 — AUTO / ON 统一入口 ===
    if (isAgentEnabled) {
      e.preventDefault();
      e.stopPropagation();

      _injecting = true;
      void (async () => {
        try {
          const promptSuffix = await agentLoop.start(userText);
          if (!promptSuffix) return;
          await adapter.appendTextAndSend(promptSuffix);
        } finally {
          setTimeout(() => { _injecting = false; }, 300);
        }
      })();
      return;
    }

    // === Case 2: Agent 关闭 — 但仍然注入记忆（如果有） ===
    const memoryText = buildMemoryInjection();
    if (!memoryText) return;

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
    agentLoop.abort();
  };

  /** 问卷提交 */
  const handleClarifySubmit = (answers: string[]) => {
    void agentLoop.resumeAfterClarify(answers);
  };

  /** 跳过问卷，直接继续（携带空答案） */
  const handleClarifySkip = () => {
    void agentLoop.resumeAfterClarify([]);
  };

  /** 拒绝编辑（回滚到原始内容） */
  const handleEditReject = async (editId: number) => {
    try {
      const edit = store.pendingEdits.find(e => e.id === editId);
      if (!edit) return;
      // 写回原始内容
      await writeTextFile(edit.path, edit.originalContent);
      await updateEditStatus(editId, 'rejected');
      store.updatePendingEditStatus(editId, 'rejected');
      // 更新 DOM 中的 diff 挂载点状态
      document.querySelectorAll(`[data-dt-edit-id="${editId}"]`).forEach(el => {
        (el as HTMLElement).dataset.dtStatus = 'rejected';
      });
      renderDiffMounts();
    } catch (e) {
      console.error('[G-Master] Edit reject failed:', e);
    }
  };

  /** 重新应用编辑 */
  const handleEditAccept = async (editId: number) => {
    try {
      const edit = store.pendingEdits.find(e => e.id === editId);
      if (!edit) return;
      // 写入新内容
      await writeTextFile(edit.path, edit.newContent);
      await updateEditStatus(editId, 'applied');
      store.updatePendingEditStatus(editId, 'applied');
      // 更新 DOM 中的 diff 挂载点状态
      document.querySelectorAll(`[data-dt-edit-id="${editId}"]`).forEach(el => {
        (el as HTMLElement).dataset.dtStatus = 'applied';
      });
      renderDiffMounts();
    } catch (e) {
      console.error('[G-Master] Edit accept failed:', e);
    }
  };

  /** 扫描并挂载所有 .dt-diff-mount 节点为 React DiffBlock */
  const renderDiffMounts = () => {
    document.querySelectorAll('.dt-diff-mount').forEach(mount => {
      const el = mount as HTMLElement;
      const editId = parseInt(el.dataset.dtEditId || '0', 10);
      const filePath = el.dataset.dtFilePath || '';
      const diff = el.dataset.dtDiff || '';
      const status = (el.dataset.dtStatus || 'applied') as 'applied' | 'rejected';
      if (!editId || el.dataset.dtRendered === '1') return;
      el.dataset.dtRendered = '1';
      const root = createRoot(el);
      root.render(
        <DiffBlock
          filePath={filePath}
          diff={diff}
          editId={editId}
          status={status}
          onReject={handleEditReject}
          onAccept={handleEditAccept}
          lang={store.config.language}
        />
      );
    });
  };

  /* 工具栏内联开关：各站点各自注入，配置未加载完或站点被禁用时传 false */
  useInlineToggle(store, handleToggleEngine, handleAbort, isSiteEnabled && siteId === 'gemini');
  useGeminiEnterpriseInlineToggle(store, handleToggleEngine, handleAbort, isSiteEnabled && siteId === 'gemini-enterprise');
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
        onEditReject={handleEditReject}
        onEditAccept={handleEditAccept}
      />
      <ClarifyModal
        store={store}
        onSubmit={handleClarifySubmit}
        onSkip={handleClarifySkip}
      />
      <FileOpApprovalModal
        store={store}
        onApprove={(opId) => agentLoop.resolveFileOp(opId, true)}
        onReject={(opId) => agentLoop.resolveFileOp(opId, false)}
      />
    </>
  );
});

export default ContentApp;
