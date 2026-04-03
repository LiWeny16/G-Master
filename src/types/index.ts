// ==========================================
// 数据模型与类型定义 / Data Models & Type Definitions
// ==========================================

import {
  SiteKey,
  SITE_DEFAULTS,
  DEFAULT_MAX_LOOPS,
  DEFAULT_MIN_LOOPS,
  DEFAULT_LOOP_DELAY,
  DEFAULT_MAX_TOOL_ROUNDS,
  DEFAULT_LOOP_MODEL,
  ActionMarkerConfig,
  DEFAULT_MARKERS,
} from '../config/config';
import { getReviewPhases, getSystemPromptTemplate } from '../config/prompts';

export type { SiteKey };

// 从 config 层统一转发（供外部按原有路径使用）
export type { ActionMarkerConfig } from '../config/config';
export { DEFAULT_MARKERS } from '../config/config';
export { getReviewPhases, getSystemPromptTemplate } from '../config/prompts';

export type AgentMode = 'off' | 'on' | 'auto';
export type LoopModel = 'fast' | 'think' | 'pro';
export type UserWorkflowPhase = 'idle' | 'running' | 'clarify';

/** 单条澄清问题（由 AI 返回，展示为问卷卡片） */
export interface ClarifyQuestion {
  /** 问题文本 */
  question: string;
  /** 两个预设选项 */
  options: [string, string];
}

export interface DeepThinkConfig {
  maxLoops: number;
  minLoops: number;
  loopDelay: number;
  loopModel: LoopModel;
  reviewPhases: string[];
  systemPromptTemplate: string;
  markers: ActionMarkerConfig;
  /** Tavily API Key，用户本地填写 / Tavily API Key, filled locally by user */
  tavilyApiKey: string;
  /** Tavily 工具开关 / Tavily tool switch */
  tavilyEnabled: boolean;
  /** 文件夹读取开关 / Local folder switch */
  localFolderEnabled: boolean;
  /** 单轮回复内工具链最大次数，防止死循环 / Max tool calls per turn to prevent infinite loops */
  maxToolRoundsPerTurn: number;
  /** 语言设置 / Language setting */
  language: 'zh' | 'en';
  /** 重要的 System Prompt 记忆和固定设置 / Pinned Memories and fixed System Prompts */
  pinnedMemories?: { id: string; content: string; enabled: boolean; title: string }[];
  /** 每个支持网站的插件启用开关 / Per-site plugin enable switch */
  siteEnabled?: Partial<Record<SiteKey, boolean>>;
}

export type EnginePhase = 'idle' | 'waiting' | 'thinking' | 'summarizing' | 'clarifying';

export interface FloatingBallPosition {
  x: number;
  y: number;
  edge: 'left' | 'right';
}

export interface ParsedMarkers {
  hasContinue: boolean;
  hasFinish: boolean;
  nextPrompt: string | null;
}

const systemLang: 'zh' | 'en' = (typeof navigator !== 'undefined' && navigator.language && navigator.language.toLowerCase().startsWith('en')) ? 'en' : 'zh';

export const DEFAULT_CONFIG: DeepThinkConfig = {
  maxLoops: DEFAULT_MAX_LOOPS,
  minLoops: DEFAULT_MIN_LOOPS,
  loopDelay: DEFAULT_LOOP_DELAY,
  loopModel: DEFAULT_LOOP_MODEL,
  reviewPhases: getReviewPhases(systemLang),
  systemPromptTemplate: getSystemPromptTemplate(systemLang, DEFAULT_MARKERS),
  markers: { ...DEFAULT_MARKERS },
  tavilyApiKey: '',
  tavilyEnabled: false,
  localFolderEnabled: false,
  maxToolRoundsPerTurn: DEFAULT_MAX_TOOL_ROUNDS,
  language: systemLang,
  pinnedMemories: [],
  siteEnabled: { ...SITE_DEFAULTS },
};

// ==========================================
// 文件编辑与 Diff 相关类型 / File Edit & Diff Types
// ==========================================

export interface FileEdit {
  id?: number;
  sessionId: string;
  path: string;
  originalContent: string;
  newContent: string;
  diff: string;
  timestamp: number;
  status: 'applied' | 'rejected';
}

export interface EditSession {
  sessionId: string;
  editCount: number;
  lastEdit: number;
}

// ==========================================
// 文件操作审批相关类型 / File Op Approval Types
// ==========================================

export type FileOpType =
  | 'create_file'
  | 'write_local_file'
  | 'rename_file'
  | 'move_file'
  | 'delete_file'
  | 'create_directory'
  | 'batch_rename';

export interface PendingFileOp {
  /** 唯一标识，用于 resolve Promise */
  id: string;
  type: FileOpType;
  /** 原始工具调用参数 */
  args: Record<string, unknown>;
  timestamp: number;
}
