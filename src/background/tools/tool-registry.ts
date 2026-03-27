import { readTextFile, writeTextFile } from './local-workspace.ts';
import { tavilySearch } from './tavily-search.ts';

function requireString(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== 'string' || v.length === 0) {
    throw new Error(`Missing or invalid string arg: ${key}`);
  }
  return v;
}

function requireStringContent(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== 'string') {
    throw new Error(`Missing or invalid string arg: ${key}`);
  }
  return v;
}

function optionalNumber(args: Record<string, unknown>, key: string): number | undefined {
  const v = args[key];
  if (v === undefined) {
    return undefined;
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`Invalid number arg: ${key}`);
  }
  return v;
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: { tavilyApiKey?: string },
): Promise<unknown> {
  switch (name) {
    case 'web_search': {
      const apiKey = ctx.tavilyApiKey;
      if (!apiKey) {
        throw new Error('tavilyApiKey is required for web_search');
      }
      const query = requireString(args, 'query');
      const maxResults = optionalNumber(args, 'maxResults');
      return tavilySearch(apiKey, query, { maxResults });
    }
    case 'read_local_file': {
      const path = requireString(args, 'path');
      return readTextFile(path);
    }
    case 'write_local_file': {
      const path = requireString(args, 'path');
      const content = requireStringContent(args, 'content');
      await writeTextFile(path, content);
      return null;
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
