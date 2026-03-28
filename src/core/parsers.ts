import type { ClarifyQuestion } from '../types';
import type { ParsedIntent } from './agent-orchestrator';

export const ROUTER_TAG = 'router_config';
export const CLARIFY_TAG = 'CLARIFY';
export const NEXT_PROMPT_TAG = 'NEXT_PROMPT';

const MARKDOWN_CODE_BLOCK_RE = /```(?:json)?\s*([\s\S]*?)```/gi;

function normalizeLoopCount(raw: unknown): number {
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n)) return 1;
    return Math.max(1, Math.min(3, Math.round(n)));
}

function stripMarkdownCodeBlocks(text: string): string {
    return text.replace(MARKDOWN_CODE_BLOCK_RE, '$1');
}

export function escapeRegexLiteral(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isAngleTagStyle(tag: string): boolean {
    return tag === tag.toLowerCase();
}

export function extractTaggedPayload(text: string, tag: string): string | null {
    if (isAngleTagStyle(tag)) {
        const escapedTag = escapeRegexLiteral(tag.toLowerCase());
        const xmlRe = new RegExp(`<${escapedTag}>\\s*([\\s\\S]*?)\\s*<\\/${escapedTag}>`, 'i');
        const xmlMatch = text.match(xmlRe);
        if (xmlMatch?.[1]) return xmlMatch[1].trim();
        return null;
    }

    const escapedTag = escapeRegexLiteral(tag);
    const canonicalRe = new RegExp(`\\[${escapedTag}\\]\\s*([\\s\\S]*?)\\s*\\[${escapedTag}\\]`, 'i');
    const canonicalMatch = text.match(canonicalRe);
    if (canonicalMatch?.[1]) return canonicalMatch[1].trim();

    // 兼容旧格式：[TAG] ... [/TAG]
    const legacyRe = new RegExp(`\\[${escapedTag}\\]\\s*([\\s\\S]*?)\\s*\\[\\/${escapedTag}\\]`, 'i');
    const legacyMatch = text.match(legacyRe);
    if (legacyMatch?.[1]) return legacyMatch[1].trim();

    return null;
}

function normalizeMarkerLine(line: string): string {
    return line.replace(/\s+/g, '').toUpperCase();
}

function toIntentObject(raw: unknown): Record<string, unknown> | null {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        return raw as Record<string, unknown>;
    }
    if (Array.isArray(raw) && raw.length > 0) {
        const first = raw[0];
        if (first && typeof first === 'object' && !Array.isArray(first)) {
            return first as Record<string, unknown>;
        }
    }
    return null;
}

function parseIntentObject(raw: unknown): ParsedIntent | null {
    const o = toIntentObject(raw);
    if (!o) return null;

    const routeRaw = typeof o.route === 'string' ? o.route.trim().toLowerCase() : '';
    let route: 'direct' | 'deep' | 'clarify' = 'direct';
    if (routeRaw === 'deep') route = 'deep';
    if (routeRaw === 'clarify' || routeRaw === 'question' || routeRaw === 'plan') route = 'clarify';

    return {
        route,
        deep_loops: normalizeLoopCount(o.deep_loops),
        needs_web: Boolean(o.needs_web),
        needs_files: Boolean(o.needs_files),
        needs_code: Boolean(o.needs_code),
        summary: typeof o.summary === 'string' ? o.summary : '',
    };
}

export function parseTagBoundary(
    line: string,
    tag: string,
    inBlock: boolean,
): { isMarker: boolean; nextInBlock: boolean } {
    if (isAngleTagStyle(tag)) {
        const normalized = line.trim().toLowerCase();
        const lowerTag = tag.toLowerCase();
        const openTag = `<${lowerTag}>`;
        const closeTag = `</${lowerTag}>`;

        if (normalized === closeTag) return { isMarker: true, nextInBlock: false };
        if (normalized === openTag) return { isMarker: true, nextInBlock: !inBlock };

        return { isMarker: false, nextInBlock: inBlock };
    }

    const normalized = normalizeMarkerLine(line);
    const upperTag = tag.toUpperCase();
    const openTag = `[${upperTag}]`;
    const closeTag = `[/${upperTag}]`;

    if (normalized === closeTag) return { isMarker: true, nextInBlock: false };
    if (normalized === openTag) return { isMarker: true, nextInBlock: !inBlock };

    return { isMarker: false, nextInBlock: inBlock };
}

export function removeTaggedBlock(text: string, tag: string): string {
    if (isAngleTagStyle(tag)) {
        const escapedTag = escapeRegexLiteral(tag.toLowerCase());
        const xmlRe = new RegExp(`<${escapedTag}>[\\s\\S]*?<\\/${escapedTag}>`, 'gi');
        return text.replace(xmlRe, '');
    }

    const escapedTag = escapeRegexLiteral(tag);
    const legacyRe = new RegExp(`\\[${escapedTag}\\][\\s\\S]*?\\[\\/${escapedTag}\\]`, 'gi');
    const canonicalRe = new RegExp(`\\[${escapedTag}\\][\\s\\S]*?\\[${escapedTag}\\]`, 'gi');
    return text.replace(legacyRe, '').replace(canonicalRe, '');
}

function extractFirstJsonArray(text: string): string | null {
    const start = text.indexOf('[');
    if (start < 0) return null;

    let inString = false;
    let escaped = false;
    let depth = 0;

    for (let i = start; i < text.length; i++) {
        const ch = text[i];

        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (ch === '\\') {
                escaped = true;
            } else if (ch === '"') {
                inString = false;
            }
            continue;
        }

        if (ch === '"') {
            inString = true;
            continue;
        }

        if (ch === '[') {
            depth += 1;
            continue;
        }

        if (ch === ']') {
            depth -= 1;
            if (depth === 0) {
                return text.slice(start, i + 1).trim();
            }
        }
    }

    return null;
}

/** 从模型回复中提取一行 JSON 意图结果 */
export function parseIntentJson(text: string): ParsedIntent | null {
    const cleaned = stripMarkdownCodeBlocks(text);

    const routerPayload = extractTaggedPayload(cleaned, ROUTER_TAG);
    if (routerPayload) {
        try {
            const raw: unknown = JSON.parse(routerPayload);
            const parsed = parseIntentObject(raw);
            if (parsed) return parsed;
        } catch {
            /* fallback to legacy plain-line parsing */
        }
    }

    const lines = cleaned.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (!line.includes('{') || !line.includes('}')) continue;
        try {
            const raw: unknown = JSON.parse(line);
            const parsed = parseIntentObject(raw);
            if (parsed) return parsed;
        } catch {
            /* try previous line */
        }
    }
    return null;
}

/** 从模型回复中提取 [CLARIFY]...[CLARIFY]（兼容旧 [/CLARIFY]）块并解析问题列表 */
export function parseClarifyBlock(text: string): ClarifyQuestion[] | null {
    const cleaned = stripMarkdownCodeBlocks(text);
    let payload = extractTaggedPayload(cleaned, CLARIFY_TAG);

    if (!payload) {
        const openOnlyMatch = cleaned.match(/\[CLARIFY\]\s*([\s\S]*)$/i);
        if (openOnlyMatch?.[1]) {
            payload = extractFirstJsonArray(openOnlyMatch[1]);
        }
    }

    if (!payload) return null;

    try {
        const arr = JSON.parse(payload);
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
