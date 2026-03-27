import type { BackgroundRequest, BackgroundResponse } from '../types/messages.ts';
import { setRoot } from './tools/local-workspace.ts';
import { executeTool } from './tools/tool-registry.ts';

chrome.runtime.onInstalled.addListener(() => {
  console.log('[DeepThink] Extension installed');
});

function isBackgroundRequest(msg: unknown): msg is BackgroundRequest {
  if (msg === null || typeof msg !== 'object') {
    return false;
  }
  const m = msg as { type?: unknown };
  return m.type === 'EXECUTE_TOOL' || m.type === 'SET_WORKSPACE_ROOT' || m.type === 'PING' || m.type === 'OPEN_OPTIONS_PAGE';
}

async function handleRequest(req: BackgroundRequest): Promise<BackgroundResponse> {
  try {
    switch (req.type) {
      case 'PING':
        return { ok: true, result: 'pong' };
      case 'OPEN_OPTIONS_PAGE':
        if (chrome.runtime.openOptionsPage) {
          chrome.runtime.openOptionsPage();
        } else {
          window.open(chrome.runtime.getURL('src/optionsPage/optionsPage.html'));
        }
        return { ok: true, result: null };
      case 'SET_WORKSPACE_ROOT': {
        setRoot(req.directoryHandle ?? null);
        return { ok: true, result: null };
      }
      case 'EXECUTE_TOOL': {
        const result = await executeTool(req.tool, req.args, {
          tavilyApiKey: req.tavilyApiKey,
        });
        return { ok: true, result };
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
}

chrome.runtime.onMessage.addListener(
  (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: BackgroundResponse) => void,
  ): boolean => {
    if (!isBackgroundRequest(message)) {
      sendResponse({ ok: false, error: 'Invalid message' });
      return true;
    }
    void handleRequest(message).then(sendResponse);
    return true;
  },
);
