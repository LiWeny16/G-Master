/**
 * Strict message contracts for chrome.runtime messaging (popup/content ↔ background).
 */

export type BackgroundRequest =
  | {
      type: 'EXECUTE_TOOL';
      tool: string;
      args: Record<string, unknown>;
      tavilyApiKey?: string;
    }
  | {
      type: 'SET_WORKSPACE_ROOT';
      directoryHandle?: FileSystemDirectoryHandle | null;
    }
  | { type: 'PING' }
  | { type: 'OPEN_OPTIONS_PAGE' };

export type BackgroundResponse =
  | { ok: true; result: unknown }
  | { ok: false; error: string };
