const TOOL_CALL_PREFIX = '[TOOL_CALL:' as const;

/**
 * 匹配 `[TOOL_CALL: name(` 起点（全局）；完整参数需配合括号平衡解析。
 * 标志 `g` 时 `lastIndex` 会前进，若需重复测试请先 `lastIndex = 0`。
 */
export const TOOL_CALL_REGEX = new RegExp(
  `${TOOL_CALL_PREFIX.replace('[', '\\[')}\\s*([a-zA-Z_]\\w*)\\(`,
  'g',
);

function findBalancedCloseParen(s: string, openIdx: number): number {
  let depth = 0;
  let inString: '"' | "'" | null = null;
  let escape = false;
  for (let i = openIdx; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === '\\') {
        escape = true;
        continue;
      }
      if (c === inString) inString = null;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = c as '"' | "'";
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function parseArgObjectString(inner: string): Record<string, unknown> {
  const trimmed = inner.trim();
  if (trimmed === '') return {};
  try {
    const v: unknown = JSON.parse(trimmed);
    if (typeof v === 'string') return { query: v };
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
    return { value: v as unknown };
  } catch {
    return { raw: trimmed };
  }
}

/**
 * 计算文本中所有 markdown 代码块（```...```）的 [start, end] 范围。
 * 用于在解析工具调用时跳过代码块内的伪调用。
 */
function computeCodeBlockRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const re = /```[\s\S]*?```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}

function isInsideCodeBlock(pos: number, ranges: Array<[number, number]>): boolean {
  for (const [s, e] of ranges) {
    if (pos >= s && pos < e) return true;
    if (s > pos) break; // ranges are sorted
  }
  return false;
}

/**
 * 解析文本中的工具调用，格式示例：
 * - `[TOOL_CALL: foo({"a":"b"})]`
 * - `[TOOL_CALL: web_search("search query")]`
 *
 * 防误触：忽略 markdown 代码块（```...```）内的工具调用语法。
 */
export function parseToolCalls(text: string): Array<{ name: string; args: Record<string, unknown> }> {
  const out: Array<{ name: string; args: Record<string, unknown> }> = [];
  const codeBlockRanges = computeCodeBlockRanges(text);
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf(TOOL_CALL_PREFIX, i);
    if (start === -1) break;

    // 跳过代码块内的工具调用语法（模型可能在解释中引用）
    if (isInsideCodeBlock(start, codeBlockRanges)) {
      i = start + 1;
      continue;
    }

    const afterTag = start + TOOL_CALL_PREFIX.length;
    const nameMatch = text.slice(afterTag).match(/^\s*([a-zA-Z_]\w*)\s*\(/);
    if (!nameMatch) {
      i = start + 1;
      continue;
    }
    const name = nameMatch[1];
    const openParen = afterTag + nameMatch[0].length - 1;
    const closeParen = findBalancedCloseParen(text, openParen);
    if (closeParen < 0) break;
    if (text[closeParen + 1] !== ']') {
      i = start + 1;
      continue;
    }
    const argStr = text.slice(openParen + 1, closeParen);
    out.push({ name, args: parseArgObjectString(argStr) });
    i = closeParen + 2;
  }
  return out;
}

/**
 * 从全文移除 `[TOOL_CALL: ...]` 片段（支持同一行多处、内联）。
 */
export function stripToolCallsFromText(text: string): string {
  let i = 0;
  const parts: string[] = [];
  while (i < text.length) {
    const start = text.indexOf(TOOL_CALL_PREFIX, i);
    if (start === -1) {
      parts.push(text.slice(i));
      break;
    }
    parts.push(text.slice(i, start));
    const afterTag = start + TOOL_CALL_PREFIX.length;
    const nameMatch = text.slice(afterTag).match(/^\s*([a-zA-Z_]\w*)\s*\(/);
    if (!nameMatch) {
      parts.push(text.slice(start, start + TOOL_CALL_PREFIX.length));
      i = start + TOOL_CALL_PREFIX.length;
      continue;
    }
    const openParen = afterTag + nameMatch[0].length - 1;
    const closeParen = findBalancedCloseParen(text, openParen);
    if (closeParen < 0 || text[closeParen + 1] !== ']') {
      parts.push(text.slice(start, openParen + 1));
      i = openParen + 1;
      continue;
    }
    i = closeParen + 2;
  }
  return parts.join('').replace(/\n{3,}/g, '\n\n').trimEnd();
}
