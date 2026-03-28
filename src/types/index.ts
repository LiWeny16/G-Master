// ==========================================
// 数据模型与类型定义 / Data Models & Type Definitions
// ==========================================

export type AgentMode = 'off' | 'on' | 'auto';
export type LoopModel = 'fast' | 'think' | 'pro';
export type UserWorkflowPhase = 'none' | 'intent' | 'deep' | 'clarify';

/** 单条澄清问题（由 AI 返回，展示为问卷卡片） */
export interface ClarifyQuestion {
  /** 问题文本 */
  question: string;
  /** 两个预设选项 */
  options: [string, string];
}

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

export const DEFAULT_MARKERS: ActionMarkerConfig = {
  continueMarker: '[ACTION: THINK_MORE]',
  finishMarker: '[ACTION: GOAL_REACHED]',
  nextPromptPattern: '\\[NEXT_PROMPT:\\s*([\\s\\S]*?)\\]',
  dtMarkerPattern: '⟪DT:(.+?)⟫',
};

export const DEFAULT_REVIEW_PHASES_ZH: string[] = [
  '从【逻辑结构】角度：找出论证链条中的跳跃、循环论证或未被证明的前提假设',
  '从【反驳视角】角度：扮演最强烈的反对者，给出最具破坏力的反例或反驳论点',
  '从【边界情况】角度：找出哪些特殊场景、极端条件或例外情况会让当前结论失效',
  '从【事实核查】角度：挑战你援引的数据、来源和案例，是否有更权威或更新的信息',
  '从【可行性】角度：评估方案落地时会遇到的实际阻力、成本与取舍',
];

export const DEFAULT_REVIEW_PHASES_EN: string[] = [
  'From a [Logical Structure] perspective: find leaps in the argument, circular reasoning, or unproven assumptions',
  'From a [Rebuttal] perspective: play the strongest opponent, providing the most destructive counterexamples',
  'From a [Boundary Cases] perspective: identify special scenarios, extreme conditions, or exceptions',
  'From a [Fact Checking] perspective: challenge the data, sources, and cases cited',
  'From a [Feasibility] perspective: assess practical resistance, costs, and trade-offs during implementation',
];

export function getReviewPhases(lang: 'zh' | 'en'): string[] {
  return lang === 'en' ? [...DEFAULT_REVIEW_PHASES_EN] : [...DEFAULT_REVIEW_PHASES_ZH];
}

export function getSystemPromptTemplate(lang: 'zh' | 'en', markers: ActionMarkerConfig): string {
  if (lang === 'en') {
    return `⟪DT:🧠 Deep Think Mode Activated⟫\n[System Directive]: Please enter "Deep Reflection and Self-Review" mode. Strictly adhere to:
1. No fabrication. If unsure, say "I don't know".
2. Claims must provide credible data sources or reference URLs.
3. [Anchor Principle] All thinking must revolve around the user's original query. Do not deviate.
4. [Self-Questioning] After answering, proactively check: Are there logical leaps? Counterexamples? Missing boundary cases? If any doubt exists, append ${markers.continueMarker} at the VERY END, and on a new line output [NEXT_PROMPT: specific question]
5. [Strict Exit Criteria] Output ${markers.finishMarker} ONLY IF all conditions are met: (a) Core points have factual backing; (b) Tested against counterarguments; (c) Key edge cases covered; (d) Complete response to the query. Otherwise, keep outputting ${markers.continueMarker}.
6. [Clarification] If critical info is missing, output at the end: \n[CLARIFY]\n[{"question":"...","options":["A","B"]}]\n[/CLARIFY]\nMax 3 questions. DO NOT output if info is sufficient.
Strictly adhere.`;
  }
  return `⟪DT:🧠 深度思考模式已激活⟫\n[系统指令]：请进入"深度反思与自我审查"模式。严格遵守：
1. 严禁胡编乱造。不确定就说"我不确定"。
2. 论点须提供可信数据来源或参考 URL。
3. 【锚定原则】所有思考必须围绕用户原始问题展开，禁止偏离。
4. 【自我质疑】【强制多轮思考】在回答后，必须主动检查：逻辑链是否有跳跃？是否存在反例？是否有遗漏的边界情况？若任何一项存疑，在回答【最末尾】附上 ${markers.continueMarker}，并另起一行输出 [NEXT_PROMPT: 具体质疑问题]
5. 【高标准结束条件】只有同时满足以下全部条件才能输出 ${markers.finishMarker}：(a) 核心论点有事实依据支撑；(b) 已从反对角度检验并无法推翻；(c) 主要边界情况已被覆盖；(d) 对原始问题有直接、完整的回应。如有任何条件未满足，必须继续输出 ${markers.continueMarker}。
6. 【澄清问卷】若缺少关键信息，可在最末尾输出：\n[CLARIFY]\n[{"question":"...","options":["A","B"]}]\n[/CLARIFY]\n最多3题，信息足够时请勿输出。
严格遵守。`;
}

const systemLang: 'zh' | 'en' = (typeof navigator !== 'undefined' && navigator.language && navigator.language.toLowerCase().startsWith('en')) ? 'en' : 'zh';

export const DEFAULT_CONFIG: DeepThinkConfig = {
  maxLoops: 3,
  minLoops: 1,
  loopDelay: 1500,
  loopModel: 'pro',
  reviewPhases: getReviewPhases(systemLang),
  systemPromptTemplate: getSystemPromptTemplate(systemLang, DEFAULT_MARKERS),
  markers: { ...DEFAULT_MARKERS },
  tavilyApiKey: '',
  tavilyEnabled: false,
  localFolderEnabled: false,
  maxToolRoundsPerTurn: 8,
  language: systemLang,
  pinnedMemories: [],
};
