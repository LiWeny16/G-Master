import type { ClarifyQuestion } from '../types';
import type { ParsedIntent } from './agent-orchestrator';

function normalizeLoopCount(raw: unknown): number {
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n)) return 1;
    return Math.max(1, Math.min(3, Math.round(n)));
}

/** 从模型回复中提取一行 JSON 意图结果 */
export function parseIntentJson(text: string): ParsedIntent | null {
    const cleaned = text.replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1');
    const lines = cleaned.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (!line.includes('{') || !line.includes('}')) continue;
        try {
            const raw: unknown = JSON.parse(line);
            if (raw === null || typeof raw !== 'object') continue;
            const o = raw as Record<string, unknown>;
            const routeRaw = typeof o.route === 'string' ? o.route.trim().toLowerCase() : '';
            const route: 'direct' | 'deep' = routeRaw === 'deep' ? 'deep' : 'direct';
            return {
                route,
                deep_loops: normalizeLoopCount(o.deep_loops),
                needs_web: Boolean(o.needs_web),
                needs_files: Boolean(o.needs_files),
                needs_code: Boolean(o.needs_code),
                summary: typeof o.summary === 'string' ? o.summary : '',
            };
        } catch {
            /* try previous line */
        }
    }
    return null;
}

/** 从模型回复中提取 [CLARIFY]...[/CLARIFY] 块并解析问题列表 */
export function parseClarifyBlock(text: string): ClarifyQuestion[] | null {
    const m = text.match(/\[CLARIFY\]([\s\S]*?)\[\/CLARIFY\]/i);
    if (!m) return null;
    const inner = m[1].trim();
    // 去掉可能的 markdown 代码块
    const cleaned = inner.replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1').trim();
    try {
        const arr = JSON.parse(cleaned);
        if (!Array.isArray(arr)) return null;
        const questions: ClarifyQuestion[] = [];
        for (const item of arr) {
            if (
                item &&
                typeof item === 'object' &&
                typeof item.question === 'string' &&
                Array.isArray(item.options) &&
                item.options.length >= 2
            ) {
                questions.push({
                    question: item.question,
                    options: [String(item.options[0]), String(item.options[1])],
                });
            }
        }
        return questions.length > 0 ? questions : null;
    } catch {
        return null;
    }
}
