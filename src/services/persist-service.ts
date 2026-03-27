import { AgentMode, DeepThinkConfig } from '../types';

const STORAGE_KEY = 'dt-extension-config';
const MODE_STORAGE_KEY = 'dt-extension-agent-mode';

export class PersistService {
  static async load(): Promise<DeepThinkConfig | null> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      return (result[STORAGE_KEY] as DeepThinkConfig | undefined) ?? null;
    } catch (e) {
      console.warn('[DeepThink] Failed to load config from storage:', e);
      return null;
    }
  }

  static async save(config: DeepThinkConfig): Promise<void> {
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: config });
    } catch (e) {
      console.warn('[DeepThink] Failed to save config to storage:', e);
    }
  }

  static async loadAgentMode(): Promise<AgentMode | null> {
    try {
      const result = await chrome.storage.local.get(MODE_STORAGE_KEY);
      const mode = result[MODE_STORAGE_KEY];
      if (mode === 'off' || mode === 'on' || mode === 'auto') {
        return mode;
      }
      return null;
    } catch (e) {
      console.warn('[DeepThink] Failed to load agent mode from storage:', e);
      return null;
    }
  }

  static async saveAgentMode(mode: AgentMode): Promise<void> {
    try {
      await chrome.storage.local.set({ [MODE_STORAGE_KEY]: mode });
    } catch (e) {
      console.warn('[DeepThink] Failed to save agent mode to storage:', e);
    }
  }

  static async clear(): Promise<void> {
    try {
      await chrome.storage.local.remove([STORAGE_KEY, MODE_STORAGE_KEY]);
    } catch (e) {
      console.warn('[DeepThink] Failed to clear config storage:', e);
    }
  }
}
