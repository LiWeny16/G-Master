import { ISiteAdapter } from './site-adapter';
import { GeminiAdapter } from './gemini-adapter';
import { DoubaoAdapter } from './doubao-adapter';
import { ChatGPTAdapter } from './chatgpt-adapter';

/**
 * 当前扩展支持的站点标识。
 * 新增站点时，在这里添加字面量并创建对应 Adapter。
 */
export type SiteId = 'gemini' | 'doubao' | 'chatgpt' | 'unknown';

/**
 * 根据 hostname 返回站点标识。
 *
 * Gemini 支持三种 URL 形态：
 *   - https://gemini.google.com/
 *   - https://gemini.google.com/app/...
 *   - https://gemini.google.com/u/{n}/app/...
 *
 * 豆包支持两种形态：
 *   - https://www.doubao.com/chat/
 *   - https://www.doubao.com/chat/{conversationId}
 *
 * ChatGPT 使用通配匹配：
 *   - https://chatgpt.com/*
 */
export function getSiteId(): SiteId {
  const hostname = window.location.hostname;
  if (hostname === 'gemini.google.com') return 'gemini';
  if (hostname === 'www.doubao.com') return 'doubao';
  if (hostname === 'chatgpt.com') return 'chatgpt';
  return 'unknown';
}

/**
 * 工厂函数：按站点返回对应适配器。
 * 如不支持当前站点，抛出错误（调用方可在 manifest.json 的 matches
 * 确保只在受支持页面注入 content script）。
 */
export function createSiteAdapter(): ISiteAdapter {
  const site = getSiteId();
  switch (site) {
    case 'gemini':
      return new GeminiAdapter();
    case 'doubao':
      return new DoubaoAdapter();
    case 'chatgpt':
      return new ChatGPTAdapter();
    default:
      // 兜底：默认使用 GeminiAdapter，实际不应走到此处
      console.warn('[G-Master] Unknown site, falling back to GeminiAdapter');
      return new GeminiAdapter();
  }
}
