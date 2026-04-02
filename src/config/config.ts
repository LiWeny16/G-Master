// ==========================================
// G-Master — 全局配置开关 / Global Feature Flags
// 所有关键默认值集中在此处，方便统一控制。
// ==========================================

// ── 网站 Key 类型 ──────────────────────────────────────────

/** 所有支持的网站 Key（与 siteEnabled 字段保持一致） */
export type SiteKey = 'gemini' | 'gemini-enterprise' | 'doubao' | 'chatgpt' | 'zhipu' | 'deepseek';

// ── 网站开关默认值 ─────────────────────────────────────────

/**
 * 各网站插件的默认开启状态。
 *   true  = 默认开启
 *   false = 默认关闭
 */
export const SITE_DEFAULTS: Record<SiteKey, boolean> = {
    'gemini': true,
    'gemini-enterprise': false,
    'doubao': true,
    'chatgpt': true,
    'zhipu': true,
    'deepseek': true,
};

/**
 * WIP 网站集合：集合内的网站在 UI 上占位显示，
 * 但按钮处于 disabled 状态，用户无法切换。
 * 从集合中移除 key 即可恢复为正常可切换状态。
 *
 * 示例（取消注释即生效）：
 *   'chatgpt'  — ChatGPT 功能开发中
 *   'deepseek' — DeepSeek 功能开发中
 */
export const WIP_SITES = new Set<SiteKey>([
    // 'chatgpt',
    // 'deepseek',
    "gemini-enterprise"
]);

// ── 核心数值默认 ──────────────────────────────────────────

/** 最大思考轮次（maxLoops） */
export const DEFAULT_MAX_LOOPS = 3;

/** 最少强制轮次（minLoops） */
export const DEFAULT_MIN_LOOPS = 1;

/** 轮次间延迟，单位 ms（loopDelay） */
export const DEFAULT_LOOP_DELAY = 1500;

/** 单轮工具链最大调用次数（maxToolRoundsPerTurn） */
export const DEFAULT_MAX_TOOL_ROUNDS = 8;

/** 循环思考使用的模型（loopModel） */
export const DEFAULT_LOOP_MODEL = 'pro' as const;
