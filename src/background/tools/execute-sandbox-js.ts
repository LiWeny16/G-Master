function isLikelySimpleExpression(code: string): boolean {
  const t = code.trim();
  if (!t) {
    return false;
  }
  if (t.includes('\n')) {
    return false;
  }
  const withoutTrailingSemi = t.replace(/;$/u, '');
  if (withoutTrailingSemi.includes(';')) {
    return false;
  }
  if (/\b(?:function|class)\b/u.test(withoutTrailingSemi)) {
    return false;
  }
  if (/=>/u.test(withoutTrailingSemi)) {
    return false;
  }
  if (
    /^(?:if|for|while|try|switch|catch|finally|else|do|return|throw|let|const|var)\b/u.test(
      withoutTrailingSemi,
    )
  ) {
    return false;
  }
  return true;
}

function runUserCode(code: string): unknown {
  const trimmed = code.trim();
  if (!trimmed) {
    return undefined;
  }
  const indirectEval = globalThis.eval as (s: string) => unknown;

  if (isLikelySimpleExpression(trimmed) && !trimmed.startsWith('{')) {
    const expr = trimmed.replace(/;$/u, '');
    return indirectEval.call(globalThis as unknown as typeof globalThis, expr);
  }

  if (trimmed.startsWith('{')) {
    const fn = new Function(`"use strict"; return ${trimmed}`);
    return fn();
  }

  const fn = new Function(`"use strict"; ${trimmed}`);
  return fn();
}

export function runSandboxJs(code: string, timeoutMs: number): Promise<unknown> {
  return Promise.race([
    Promise.resolve().then(() => runUserCode(code)),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('JavaScript execution timed out')), timeoutMs);
    }),
  ]);
}
