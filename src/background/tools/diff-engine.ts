// ==========================================
// 轻量行级 Unified Diff 引擎 / Lightweight Line-based Unified Diff Engine
// ==========================================

export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

/**
 * Compute the longest common subsequence (LCS) of two string arrays
 * using a simple DP approach. Returns index pairs [oldIdx, newIdx][].
 */
function lcs(a: string[], b: string[]): [number, number][] {
  const m = a.length;
  const n = b.length;

  // dp[i][j] = length of LCS of a[0..i-1] and b[0..j-1]
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find the actual pairs
  const pairs: [number, number][] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      pairs.push([i - 1, j - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  pairs.reverse();
  return pairs;
}

/**
 * Split text into lines. Preserves the line content without trailing newlines.
 */
function splitLines(text: string): string[] {
  if (text === '') return [];
  // Remove a single trailing newline to avoid a phantom empty line
  const normalized = text.endsWith('\n') ? text.slice(0, -1) : text;
  return normalized.split('\n');
}

/**
 * Compute a line-by-line diff between oldText and newText.
 */
export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);
  const common = lcs(oldLines, newLines);

  const result: DiffLine[] = [];
  let oldIdx = 0;
  let newIdx = 0;

  for (const [oi, ni] of common) {
    // Emit removed lines before this common pair
    while (oldIdx < oi) {
      result.push({ type: 'removed', content: oldLines[oldIdx], oldLineNum: oldIdx + 1 });
      oldIdx++;
    }
    // Emit added lines before this common pair
    while (newIdx < ni) {
      result.push({ type: 'added', content: newLines[newIdx], newLineNum: newIdx + 1 });
      newIdx++;
    }
    // Emit the common line
    result.push({
      type: 'unchanged',
      content: oldLines[oi],
      oldLineNum: oldIdx + 1,
      newLineNum: newIdx + 1,
    });
    oldIdx = oi + 1;
    newIdx = ni + 1;
  }

  // Remaining removed lines
  while (oldIdx < oldLines.length) {
    result.push({ type: 'removed', content: oldLines[oldIdx], oldLineNum: oldIdx + 1 });
    oldIdx++;
  }
  // Remaining added lines
  while (newIdx < newLines.length) {
    result.push({ type: 'added', content: newLines[newIdx], newLineNum: newIdx + 1 });
    newIdx++;
  }

  return result;
}

interface Hunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: string[];
}

/**
 * Generate a unified diff string (like `diff -u`) with file headers and @@ hunks.
 * @param filePath File path shown in the header
 * @param oldText Original text
 * @param newText Modified text
 * @param contextLines Number of surrounding unchanged lines per hunk (default 3)
 */
export function generateUnifiedDiff(
  filePath: string,
  oldText: string,
  newText: string,
  contextLines: number = 3,
): string {
  const diffLines = computeLineDiff(oldText, newText);

  if (diffLines.every((l) => l.type === 'unchanged')) {
    return '';
  }

  // Find ranges of changed lines (indices into diffLines)
  const changeIndices: number[] = [];
  for (let i = 0; i < diffLines.length; i++) {
    if (diffLines[i].type !== 'unchanged') {
      changeIndices.push(i);
    }
  }

  // Group changes into hunks with surrounding context
  const hunks: { start: number; end: number }[] = [];
  let hunkStart = changeIndices[0];
  let hunkEnd = changeIndices[0];

  for (let i = 1; i < changeIndices.length; i++) {
    if (changeIndices[i] - hunkEnd <= contextLines * 2) {
      // Merge into current hunk
      hunkEnd = changeIndices[i];
    } else {
      hunks.push({ start: hunkStart, end: hunkEnd });
      hunkStart = changeIndices[i];
      hunkEnd = changeIndices[i];
    }
  }
  hunks.push({ start: hunkStart, end: hunkEnd });

  // Build output
  const output: string[] = [];
  output.push(`--- a/${filePath}`);
  output.push(`+++ b/${filePath}`);

  for (const hunk of hunks) {
    const ctxStart = Math.max(0, hunk.start - contextLines);
    const ctxEnd = Math.min(diffLines.length - 1, hunk.end + contextLines);

    const hunkLines: string[] = [];
    let oldStart = 0;
    let oldCount = 0;
    let newStart = 0;
    let newCount = 0;
    let oldStartSet = false;
    let newStartSet = false;

    for (let i = ctxStart; i <= ctxEnd; i++) {
      const dl = diffLines[i];
      switch (dl.type) {
        case 'unchanged':
          hunkLines.push(` ${dl.content}`);
          if (!oldStartSet && dl.oldLineNum != null) {
            oldStart = dl.oldLineNum;
            oldStartSet = true;
          }
          if (!newStartSet && dl.newLineNum != null) {
            newStart = dl.newLineNum;
            newStartSet = true;
          }
          oldCount++;
          newCount++;
          break;
        case 'removed':
          hunkLines.push(`-${dl.content}`);
          if (!oldStartSet && dl.oldLineNum != null) {
            oldStart = dl.oldLineNum;
            oldStartSet = true;
          }
          oldCount++;
          break;
        case 'added':
          hunkLines.push(`+${dl.content}`);
          if (!newStartSet && dl.newLineNum != null) {
            newStart = dl.newLineNum;
            newStartSet = true;
          }
          newCount++;
          break;
      }
    }

    if (!oldStartSet) oldStart = 1;
    if (!newStartSet) newStart = 1;

    output.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);
    output.push(...hunkLines);
  }

  return output.join('\n');
}

/**
 * Apply a unified diff to original text. Throws if the patch doesn't apply cleanly.
 */
export function applyUnifiedDiff(originalText: string, diff: string): string {
  if (!diff.trim()) return originalText;

  const oldLines = splitLines(originalText);
  const diffLinesList = diff.split('\n');

  // Parse hunks
  const parsedHunks: Hunk[] = [];
  let idx = 0;

  // Skip header lines (--- and +++)
  while (idx < diffLinesList.length && !diffLinesList[idx].startsWith('@@')) {
    idx++;
  }

  while (idx < diffLinesList.length) {
    const hunkHeader = diffLinesList[idx];
    const match = hunkHeader.match(/@@ -(\d+),(\d+) \+(\d+),(\d+) @@/);
    if (!match) {
      idx++;
      continue;
    }

    const hunk: Hunk = {
      oldStart: parseInt(match[1], 10),
      oldCount: parseInt(match[2], 10),
      newStart: parseInt(match[3], 10),
      newCount: parseInt(match[4], 10),
      lines: [],
    };
    idx++;

    while (idx < diffLinesList.length && !diffLinesList[idx].startsWith('@@')) {
      const line = diffLinesList[idx];
      if (line.startsWith(' ') || line.startsWith('-') || line.startsWith('+')) {
        hunk.lines.push(line);
      } else if (line === '') {
        // Empty context line (empty string after split)
        break;
      }
      idx++;
    }

    parsedHunks.push(hunk);
  }

  // Apply hunks in reverse order so line numbers stay valid
  const result = [...oldLines];
  const sortedHunks = [...parsedHunks].sort((a, b) => b.oldStart - a.oldStart);

  for (const hunk of sortedHunks) {
    const startIdx = hunk.oldStart - 1; // 0-based

    // Verify context lines match
    let oldOffset = 0;
    for (const line of hunk.lines) {
      if (line.startsWith(' ')) {
        const expected = line.slice(1);
        const actual = result[startIdx + oldOffset];
        if (actual !== expected) {
          throw new Error(
            `Patch does not apply cleanly at line ${startIdx + oldOffset + 1}: ` +
              `expected "${expected}", got "${actual}"`,
          );
        }
        oldOffset++;
      } else if (line.startsWith('-')) {
        const expected = line.slice(1);
        const actual = result[startIdx + oldOffset];
        if (actual !== expected) {
          throw new Error(
            `Patch does not apply cleanly at line ${startIdx + oldOffset + 1}: ` +
              `expected to remove "${expected}", got "${actual}"`,
          );
        }
        oldOffset++;
      }
      // '+' lines don't consume old lines
    }

    // Build replacement lines
    const newLines: string[] = [];
    for (const line of hunk.lines) {
      if (line.startsWith(' ')) {
        newLines.push(line.slice(1));
      } else if (line.startsWith('+')) {
        newLines.push(line.slice(1));
      }
      // '-' lines are removed (not added to newLines)
    }

    result.splice(startIdx, hunk.oldCount, ...newLines);
  }

  return result.join('\n') + (originalText.endsWith('\n') ? '\n' : '');
}
