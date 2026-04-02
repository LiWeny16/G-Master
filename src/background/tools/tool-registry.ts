import { readTextFile, readMultipleFiles, listDirectory, searchFiles, grepFiles, attachFileToChat } from './local-workspace.ts';
import { tavilySearch } from './tavily-search.ts';

function requireString(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== 'string' || v.length === 0) {
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

function optionalBool(args: Record<string, unknown>, key: string): boolean | undefined {
  const v = args[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'boolean') throw new Error(`Invalid boolean arg: ${key}`);
  return v;
}

/**
 * 判断工具是否为本地文件系统工具（应在 content script 本地执行）
 */
export function isLocalFileTool(name: string): boolean {
  return ['list_directory', 'read_file', 'read_files', 'search_files', 'grep_files', 'attach_file_to_chat',
          'read_local_file', 'write_local_file'].includes(name);
}

/**
 * 在 content script 上下文中执行本地文件工具。
 * 不走 background service worker，避免 FileSystemDirectoryHandle 序列化问题。
 */
export async function executeLocalTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case 'list_directory': {
      const path = typeof args.path === 'string' ? args.path : '.';
      const recursive = optionalBool(args, 'recursive') ?? false;
      const maxDepth = optionalNumber(args, 'maxDepth') ?? 2;
      return listDirectory(path, { recursive, maxDepth });
    }
    case 'read_file':
    case 'read_local_file': {
      const path = requireString(args, 'path');
      const startLine = optionalNumber(args, 'startLine');
      const endLine = optionalNumber(args, 'endLine');
      return readTextFile(path, startLine, endLine);
    }
    case 'read_files': {
      const paths = args.paths;
      if (!Array.isArray(paths) || paths.length === 0) {
        throw new Error('read_files requires non-empty "paths" array');
      }
      const validPaths = paths.filter((p): p is string => typeof p === 'string' && p.length > 0);
      if (validPaths.length === 0) throw new Error('No valid paths in the array');
      return readMultipleFiles(validPaths);
    }
    case 'search_files': {
      const pattern = requireString(args, 'pattern');
      const directory = typeof args.directory === 'string' ? args.directory : '.';
      const maxResults = optionalNumber(args, 'maxResults') ?? 50;
      return searchFiles(pattern, directory, maxResults);
    }
    case 'grep_files': {
      const query = requireString(args, 'query');
      const directory = typeof args.directory === 'string' ? args.directory : '.';
      const isRegex = optionalBool(args, 'isRegex') ?? false;
      const caseSensitive = optionalBool(args, 'caseSensitive') ?? false;
      const includePattern = typeof args.includePattern === 'string' ? args.includePattern : undefined;
      const maxResults = optionalNumber(args, 'maxResults') ?? 100;
      const contextLines = optionalNumber(args, 'contextLines') ?? 0;
      return grepFiles(query, directory, { isRegex, caseSensitive, includePattern, maxResults, contextLines });
    }
    case 'attach_file_to_chat': {
      const path = requireString(args, 'path');
      const targetSelector = typeof args.targetSelector === 'string' ? args.targetSelector : undefined;
      return attachFileToChat(path, targetSelector);
    }
    case 'write_local_file': {
      // 写入操作保留但当前抛错禁用
      throw new Error('File writing is currently disabled for safety. Only read operations are allowed.');
    }
    default:
      throw new Error(`Unknown local tool: ${name}`);
  }
}

/**
 * 通过 background service worker 执行的工具（目前仅 web_search）。
 */
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
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
