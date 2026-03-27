import type { BackgroundRequest, BackgroundResponse } from '../types/messages.ts';

export function invokeBackground(req: BackgroundRequest): Promise<BackgroundResponse> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(req, (response: BackgroundResponse | undefined) => {
      const lastError = chrome.runtime.lastError;
      if (lastError?.message) {
        reject(new Error(lastError.message));
        return;
      }
      if (response === undefined) {
        reject(new Error('Background 未返回响应'));
        return;
      }
      resolve(response);
    });
  });
}
