// ==========================================
// 数据模型与类型定义
// ==========================================

export type AgentMode = 'off' | 'on' | 'auto';
export type LoopModel = 'fast' | 'think' | 'pro';

export interface ActionMarkerConfig {
  continueMarker: string;
  finishMarker: string;
  nextPromptPattern: string;
  dtMarkerPattern: string;
}

export interface DeepThinkConfig {
  maxLoops: number;
  minLoops: number;
  loopDelay: number;
  loopModel: LoopModel;
  reviewPhases: string[];
  systemPromptTemplate: string;
  markers: ActionMarkerConfig;
  /** Tavily API Key，用户本地填写 */
  tavilyApiKey: string;
  /** Tavily 工具开关 */
  tavilyEnabled: boolean;
  /** 文件夹读取开关 */
  localFolderEnabled: boolean;
  /** 单轮回复内工具链最大次数，防止死循环 */
  maxToolRoundsPerTurn: number;
}

export type EnginePhase = 'idle' | 'waiting' | 'thinking' | 'summarizing';

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

export const DEFAULT_MARKERS: ActionMarkerConfig = {
  continueMarker: '[ACTION: THINK_MORE]',
  finishMarker: '[ACTION: GOAL_REACHED]',
  nextPromptPattern: '\\[NEXT_PROMPT:\\s*([\\s\\S]*?)\\]',
  dtMarkerPattern: '⟪DT:(.+?)⟫',
};

export const DEFAULT_REVIEW_PHASES: string[] = [
  '从【逻辑结构】角度：找出论证链条中的跳跃、循环论证或未被证明的前提假设',
  '从【反驳视角】角度：扮演最强烈的反对者，给出最具破坏力的反例或反驳论点',
  '从【边界情况】角度：找出哪些特殊场景、极端条件或例外情况会让当前结论失效',
  '从【事实核查】角度：挑战你援引的数据、来源和案例，是否有更权威或更新的信息',
  '从【可行性】角度：评估方案落地时会遇到的实际阻力、成本与取舍',
];

export function buildDefaultSystemPromptTemplate(markers: ActionMarkerConfig): string {
  return `\n\n⟪DT:🧠 深度思考模式已激活⟫\n[系统指令]：请进入"深度反思与自我审查"模式。严格遵守：
1. 严禁胡编乱造。不确定就说"我不确定"。
2. 论点须提供可信数据来源或参考 URL。
3. 【锚定原则】所有思考必须围绕用户原始问题展开，禁止偏离。
4. 【自我质疑】【强制多轮思考】在回答后，必须主动检查：逻辑链是否有跳跃？是否存在反例？是否有遗漏的边界情况？若任何一项存疑，在回答【最末尾】附上 ${markers.continueMarker}，并另起一行输出 [NEXT_PROMPT: 具体质疑问题]
5. 【高标准结束条件】只有同时满足以下全部条件才能输出 ${markers.finishMarker}：(a) 核心论点有事实依据支撑；(b) 已从反对角度检验并无法推翻；(c) 主要边界情况已被覆盖；(d) 对原始问题有直接、完整的回应。如有任何条件未满足，必须继续输出 ${markers.continueMarker}。
严格遵守。`;
}

export const DEFAULT_CONFIG: DeepThinkConfig = {
  maxLoops: 3,
  minLoops: 1,
  loopDelay: 1500,
  loopModel: 'pro',
  reviewPhases: [...DEFAULT_REVIEW_PHASES],
  systemPromptTemplate: buildDefaultSystemPromptTemplate(DEFAULT_MARKERS),
  markers: { ...DEFAULT_MARKERS },
  tavilyApiKey: '',
  tavilyEnabled: false,
  localFolderEnabled: false,
  maxToolRoundsPerTurn: 8,
};
