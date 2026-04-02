/**
 * @deprecated — 已被 agent-loop.ts 的 AgentLoop 替代。
 * 此文件仅保留类型导出，供 parsers.ts / dom-beautifier.ts 编译使用。
 */

export type UserWorkflowPhase = 'none' | 'intent' | 'deep' | 'clarify';

export interface ParsedIntent {
  route: 'direct' | 'deep' | 'clarify';
  deep_loops: number;
  needs_web: boolean;
  needs_files: boolean;
  needs_code: boolean;
  summary: string;
}
