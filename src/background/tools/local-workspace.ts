/**
 * local-workspace.ts — 本地工作区文件系统操作
 *
 * 基于 File System Access API (FileSystemDirectoryHandle)，
 * 在 content script 中直接执行，不经过 background service worker。
 *
 * 提供类 Linux 命令的文件操作：
 *   - listDirectory  (ls / tree)
 *   - readTextFile    (cat)
 *   - readMultipleFiles (cat a b c — 批量读取)
 *   - searchFiles     (find -name)
 *   - writeTextFile   (保留但默认禁用)
 */

// ── Handle 管理 ──

let workspaceRoot: FileSystemDirectoryHandle | null = null;
/** 工作区根目录名称（用于 UI 显示） */
let workspaceName = '';

export function setRoot(directoryHandle: FileSystemDirectoryHandle | null): void {
  workspaceRoot = directoryHandle;
  workspaceName = directoryHandle?.name ?? '';
}

export function getRoot(): FileSystemDirectoryHandle | null {
  return workspaceRoot;
}

export function getRootName(): string {
  return workspaceName;
}

export function hasRoot(): boolean {
  return workspaceRoot !== null;
}

// ── IndexedDB 持久化 ──

const IDB_NAME = 'g-master-workspace';
const IDB_STORE = 'handles';
const IDB_KEY = 'root';

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function persistHandle(): Promise<void> {
  if (!workspaceRoot) return;
  const db = await openIDB();
  const tx = db.transaction(IDB_STORE, 'readwrite');
  tx.objectStore(IDB_STORE).put(workspaceRoot, IDB_KEY);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function clearPersistedHandle(): Promise<void> {
  const db = await openIDB();
  const tx = db.transaction(IDB_STORE, 'readwrite');
  tx.objectStore(IDB_STORE).delete(IDB_KEY);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/**
 * 尝试从 IndexedDB 恢复之前授权的 FileSystemDirectoryHandle。
 * 返回 true 表示恢复成功且权限仍有效。
 */
export async function restoreHandle(): Promise<boolean> {
  try {
    const db = await openIDB();
    const tx = db.transaction(IDB_STORE, 'readonly');
    const handle = await new Promise<FileSystemDirectoryHandle | undefined>((resolve, reject) => {
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => resolve(req.result as FileSystemDirectoryHandle | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!handle) return false;

    // 检查权限是否仍有效
    const perm = await handle.queryPermission?.({ mode: 'read' });
    if (perm === 'granted') {
      setRoot(handle);
      return true;
    }
    // 尝试重新请求权限（需要用户手势上下文，此处可能失败）
    const reqPerm = await handle.requestPermission?.({ mode: 'read' });
    if (reqPerm === 'granted') {
      setRoot(handle);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ── 路径安全 ──

function sanitizedSegments(relativePath: string): string[] {
  const parts = relativePath.replace(/\\/gu, '/').split('/');
  const segments: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') {
      continue;
    }
    if (part === '..') {
      throw new Error('Path traversal is not allowed');
    }
    segments.push(part);
  }
  return segments; // 允许空（表示根目录）
}

async function resolveDirectory(relativePath: string): Promise<FileSystemDirectoryHandle> {
  if (!workspaceRoot) throw new Error('Workspace root is not set');
  const segments = sanitizedSegments(relativePath);
  let dir = workspaceRoot;
  for (const name of segments) {
    dir = await dir.getDirectoryHandle(name);
  }
  return dir;
}

async function getDirectoryForSegments(
  segments: string[],
  createIntermediate: boolean,
): Promise<{ dir: FileSystemDirectoryHandle; fileName: string }> {
  if (!workspaceRoot) {
    throw new Error('Workspace root is not set');
  }
  if (segments.length === 0) {
    throw new Error('Invalid path: empty after sanitization');
  }
  const fileName = segments[segments.length - 1]!;
  const dirSegments = segments.slice(0, -1);
  let dir = workspaceRoot;
  for (const name of dirSegments) {
    dir = await dir.getDirectoryHandle(name, createIntermediate ? { create: true } : undefined);
  }
  return { dir, fileName };
}

// ── 隐藏/二进制文件过滤 ──

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', '__pycache__',
  '.idea', '.vscode', '.DS_Store', 'dist', 'build', '.next',
  'coverage', '.cache', '.turbo',
]);

function shouldSkipEntry(name: string): boolean {
  return IGNORED_DIRS.has(name);
}

// ── 核心操作 ──

export interface DirEntry {
  name: string;
  kind: 'file' | 'directory';
  path: string;
  children?: DirEntry[];
}

/**
 * list_directory — 列出目录内容（类 `ls` / `tree`）
 */
export async function listDirectory(
  relativePath = '.',
  options: { recursive?: boolean; maxDepth?: number } = {},
): Promise<DirEntry[]> {
  const dir = await resolveDirectory(relativePath);
  const basePath = relativePath === '.' ? '' : relativePath.replace(/\\/g, '/').replace(/\/$/g, '');
  const maxDepth = options.recursive ? (options.maxDepth ?? 3) : 1;
  return listDirRecursive(dir, basePath, 0, maxDepth);
}

async function listDirRecursive(
  dir: FileSystemDirectoryHandle,
  parentPath: string,
  depth: number,
  maxDepth: number,
): Promise<DirEntry[]> {
  const entries: DirEntry[] = [];
  for await (const [name, handle] of dir.entries()) {
    if (shouldSkipEntry(name)) continue;
    const entryPath = parentPath ? `${parentPath}/${name}` : name;
    if (handle.kind === 'directory') {
      const entry: DirEntry = { name, kind: 'directory', path: entryPath };
      if (depth + 1 < maxDepth) {
        entry.children = await listDirRecursive(
          handle as FileSystemDirectoryHandle, entryPath, depth + 1, maxDepth,
        );
      }
      entries.push(entry);
    } else {
      entries.push({ name, kind: 'file', path: entryPath });
    }
  }
  // 目录优先，然后按名称排序
  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return entries;
}

/**
 * read_file — 读取单个文本文件（类 `cat`）
 * @param startLine 起始行（1-indexed，含，可选）
 * @param endLine   结束行（1-indexed，含，可选）
 */
export async function readTextFile(
  relativePath: string,
  startLine?: number,
  endLine?: number,
): Promise<string> {
  const segments = sanitizedSegments(relativePath);
  if (segments.length === 0) throw new Error('Invalid path: empty');
  const { dir, fileName } = await getDirectoryForSegments(segments, false);

  // 二进制文件（图片/音视频等）：提前返回友好提示，引导使用 attach_file_to_chat
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (BINARY_EXTENSIONS.has(ext)) {
    return `[Cannot read "${fileName}" as text] Binary files cannot be read as text. Use attach_file_to_chat to send this file to the AI chat input instead.`;
  }

  const fileHandle = await dir.getFileHandle(fileName);
  const file = await fileHandle.getFile();
  const text = await file.text();
  if (startLine === undefined && endLine === undefined) return text;
  const lines = text.split('\n');
  const s = Math.max(1, startLine ?? 1) - 1;
  const e = Math.min(lines.length, endLine ?? lines.length);
  return lines.slice(s, e).join('\n');
}

/**
 * read_files — 批量读取多个文本文件（减少对话轮次的关键）
 * 返回 { path: content } 的映射，读取失败的文件以 error 字符串标记。
 */
export async function readMultipleFiles(
  paths: string[],
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  // 并行读取所有文件
  const settled = await Promise.allSettled(
    paths.map(async (p) => {
      const content = await readTextFile(p);
      return { path: p, content };
    }),
  );
  for (const item of settled) {
    if (item.status === 'fulfilled') {
      result[item.value.path] = item.value.content;
    } else {
      // 从 rejection reason 提取路径
      const path = paths[settled.indexOf(item)]!;
      result[path] = `[ERROR] ${item.reason instanceof Error ? item.reason.message : String(item.reason)}`;
    }
  }
  return result;
}

/**
 * search_files — 按名称搜索文件（智能模式 + glob 兼容）
 *
 * 模式自动检测：
 *  - 含 * / ? 等 glob 元字符 → 走 glob 精确匹配（兼容旧行为）
 *  - 其余 → 智能搜索模式：
 *      1. 将 query 按空格拆成多个词，所有词均出现在文件名/路径中才算匹配（AND）
 *      2. 词的匹配忽略大小写，忽略连字符/下划线/点等分隔符差异
 *      3. 按「完全匹配 > 文件名开头 > 文件名包含 > 路径包含」打分排序
 *
 * @param pattern     glob 模式 或 自然语言关键词（空格分隔多词）
 * @param directory   搜索根目录（默认"."）
 * @param maxResults  最多返回结果数（默认 50）
 */
export async function searchFiles(
  pattern: string,
  directory = '.',
  maxResults = 50,
): Promise<string[]> {
  const dir = await resolveDirectory(directory);
  const basePath = directory === '.' ? '' : directory.replace(/\\/g, '/').replace(/\/$/g, '');

  const isGlob = /[*?[\]{}]/.test(pattern);
  if (isGlob) {
    // ── Glob 模式（兼容旧行为）──
    const regex = globToRegex(pattern);
    const matchFullPath = pattern.includes('/') || pattern.includes('**');
    const results: string[] = [];
    await searchDirRecursive(dir, basePath, regex, matchFullPath, results, maxResults);
    return results;
  }

  // ── 智能搜索模式 ──
  // 将 query 规范化：去除首尾空格后按连续空格拆词，过滤空词
  const terms = pattern.trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  // 规范化单个字符串，把连字符/下划线/点统一去掉用于比较
  const normalize = (s: string) => s.toLowerCase().replace(/[-_.]/g, '');
  const normTerms = terms.map((t) => normalize(t));

  interface Candidate { path: string; score: number }
  const candidates: Candidate[] = [];

  await smartSearchRecursive(dir, basePath, normTerms, normalize, candidates, maxResults * 4);

  // 按评分降序，同分保持字典序
  candidates.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return candidates.slice(0, maxResults).map((c) => c.path);
}

/**
 * 智能搜索评分规则（越高越靠前）：
 *  8 — 文件名（去扩展名）完全等于所有词拼接
 *  6 — 文件名以查询开头
 *  4 — 全部词均出现在文件名中
 *  2 — 全部词均出现在完整路径中
 */
async function smartSearchRecursive(
  dir: FileSystemDirectoryHandle,
  parentPath: string,
  normTerms: string[],
  normalize: (s: string) => string,
  candidates: Array<{ path: string; score: number }>,
  limit: number,
): Promise<void> {
  if (candidates.length >= limit) return;
  for await (const [name, handle] of dir.entries()) {
    if (candidates.length >= limit) break;
    if (shouldSkipEntry(name)) continue;
    const entryPath = parentPath ? `${parentPath}/${name}` : name;

    if (handle.kind === 'file') {
      const normName = normalize(name.replace(/\.[^.]*$/, '')); // 去扩展名再规范化
      const normFull = normalize(name);
      const normPath = normalize(entryPath);
      const queryConcat = normTerms.join('');

      // 每个词须在文件名或路径中出现（AND 语义）
      const allInName = normTerms.every((t) => normFull.includes(t));
      const allInPath = !allInName && normTerms.every((t) => normPath.includes(t));

      if (!allInName && !allInPath) continue;

      let score = 2;
      if (allInName) {
        score = 4;
        if (normName.startsWith(queryConcat)) score = 6;
        if (normName === queryConcat || normFull === queryConcat) score = 8;
      }
      candidates.push({ path: entryPath, score });
    } else {
      await smartSearchRecursive(
        handle as FileSystemDirectoryHandle, entryPath, normTerms, normalize, candidates, limit,
      );
    }
  }
}

function globToRegex(pattern: string): RegExp {
  // 将 glob 转换为正则：** → .*, * → [^/]*, ? → .
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '⟨GLOBSTAR⟩')
    .replace(/\*/g, '[^/]*')
    .replace(/⟨GLOBSTAR⟩/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

async function searchDirRecursive(
  dir: FileSystemDirectoryHandle,
  parentPath: string,
  regex: RegExp,
  matchFullPath: boolean,
  results: string[],
  maxResults: number,
): Promise<void> {
  if (results.length >= maxResults) return;
  for await (const [name, handle] of dir.entries()) {
    if (results.length >= maxResults) break;
    if (shouldSkipEntry(name)) continue;
    const entryPath = parentPath ? `${parentPath}/${name}` : name;
    if (handle.kind === 'file') {
      const testTarget = matchFullPath ? entryPath : name;
      if (regex.test(testTarget)) {
        results.push(entryPath);
      }
    } else {
      await searchDirRecursive(
        handle as FileSystemDirectoryHandle, entryPath, regex, matchFullPath, results, maxResults,
      );
    }
  }
}

// ── 内容搜索 ──

const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'zip', 'tar', 'gz', 'rar', '7z', 'mp3', 'mp4', 'wav', 'avi', 'mov',
  'woff', 'woff2', 'ttf', 'eot', 'exe', 'dll', 'so', 'dylib',
]);

function isBinaryExtension(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase();
  return ext ? BINARY_EXTENSIONS.has(ext) : false;
}

export interface GrepResult {
  path: string;
  line: number;
  content: string;
}

/**
 * grep_files — 在文件内容中搜索文本或正则（类 `grep -r`）
 * @param query        搜索关键词或正则表达式字符串
 * @param directory    搜索根目录（默认"."）
 * @param options.isRegex        是否将 query 作为正则解析（默认 false）
 * @param options.caseSensitive  区分大小写（默认 false）
 * @param options.includePattern 文件名 glob 过滤（如 "*.ts"）
 * @param options.maxResults     最多返回结果数（默认 100）
 * @param options.contextLines   匹配行上下各展示多少行（默认 0）
 */
export async function grepFiles(
  query: string,
  directory = '.',
  options: {
    isRegex?: boolean;
    caseSensitive?: boolean;
    includePattern?: string;
    maxResults?: number;
    contextLines?: number;
  } = {},
): Promise<GrepResult[]> {
  const dir = await resolveDirectory(directory);
  const basePath = directory === '.' ? '' : directory.replace(/\\/g, '/').replace(/\/$/g, '');
  const {
    isRegex = false,
    caseSensitive = false,
    includePattern,
    maxResults = 100,
    contextLines = 0,
  } = options;

  const flags = caseSensitive ? '' : 'i';
  const searchRegex = isRegex
    ? new RegExp(query, flags)
    : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);

  // includePattern 仅匹配文件名（不含路径），与 search_files 语义保持一致
  const fileFilter = includePattern
    ? globToRegex(includePattern.includes('/') ? includePattern : `**/${includePattern}`)
    : null;

  const results: GrepResult[] = [];
  await grepDirRecursive(dir, basePath, searchRegex, fileFilter, results, maxResults, contextLines);
  return results;
}

async function grepDirRecursive(
  dir: FileSystemDirectoryHandle,
  parentPath: string,
  searchRegex: RegExp,
  fileFilter: RegExp | null,
  results: GrepResult[],
  maxResults: number,
  contextLines: number,
): Promise<void> {
  if (results.length >= maxResults) return;
  for await (const [name, handle] of dir.entries()) {
    if (results.length >= maxResults) break;
    if (shouldSkipEntry(name)) continue;
    const entryPath = parentPath ? `${parentPath}/${name}` : name;
    if (handle.kind === 'file') {
      if (isBinaryExtension(name)) continue;
      if (fileFilter && !fileFilter.test(entryPath)) continue;
      try {
        const file = await (handle as FileSystemFileHandle).getFile();
        const text = await file.text();
        const lines = text.split('\n');
        const emitted = new Set<number>();
        for (let i = 0; i < lines.length && results.length < maxResults; i++) {
          if (searchRegex.test(lines[i]!)) {
            const start = Math.max(0, i - contextLines);
            const end = Math.min(lines.length - 1, i + contextLines);
            for (let j = start; j <= end && results.length < maxResults; j++) {
              if (!emitted.has(j)) {
                emitted.add(j);
                results.push({ path: entryPath, line: j + 1, content: lines[j]! });
              }
            }
          }
        }
      } catch {
        // 跳过无法读取的文件
      }
    } else {
      await grepDirRecursive(
        handle as FileSystemDirectoryHandle, entryPath, searchRegex, fileFilter, results, maxResults, contextLines,
      );
    }
  }
}

// ── 文件附加到聊天输入框 ──

/**
 * 根据文件扩展名推断 MIME 类型，未知类型降级为 application/octet-stream。
 * File System Access API 返回的 file.type 对部分格式为空，用此函数补全。
 */
const EXT_MIME: Record<string, string> = {
  // 图片
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  bmp: 'image/bmp', ico: 'image/x-icon', tiff: 'image/tiff', tif: 'image/tiff',
  // 文档
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // 视频 / 音频
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
  // 压缩
  zip: 'application/zip', gz: 'application/gzip',
};

function getMime(fileName: string, fileType: string): string {
  if (fileType) return fileType;
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MIME[ext] ?? 'application/octet-stream';
}

/** 各站点聊天输入框选择器（按优先级排列） */
const CHAT_INPUT_SELECTORS = [
  '.ql-editor',                              // Gemini
  'div#prompt-textarea[contenteditable]',    // ChatGPT
  'textarea[data-id]',                       // Doubao 等
  'textarea',                                // 通用兜底
];

/**
 * attach_file_to_chat — 将工作区文件粘贴到当前页面的 AI 输入框
 *
 * 通过合成 ClipboardEvent + DataTransfer 将文件注入 AI Web App。
 * 支持任意文件类型；Gemini 原生支持图片、PDF、文档、视频等格式上传。
 *
 * @param relativePath  工作区内的相对路径
 * @param targetSelector  可选：指定输入框 CSS 选择器（覆盖默认检测）
 */
export async function attachFileToChat(
  relativePath: string,
  targetSelector?: string,
): Promise<string> {
  const segments = sanitizedSegments(relativePath);
  if (segments.length === 0) throw new Error('Invalid path: empty');
  const { dir, fileName } = await getDirectoryForSegments(segments, false);
  const fileHandle = await dir.getFileHandle(fileName);
  const file = await fileHandle.getFile();

  const mimeType = getMime(fileName, file.type);
  const blob = new Blob([await file.arrayBuffer()], { type: mimeType });
  const attachFile = new File([blob], fileName, { type: mimeType });

  // 按优先级查找输入框
  const selectors = targetSelector
    ? [targetSelector, ...CHAT_INPUT_SELECTORS]
    : CHAT_INPUT_SELECTORS;
  let editorEl: Element | null = null;
  for (const sel of selectors) {
    editorEl = document.querySelector(sel);
    if (editorEl) break;
  }
  if (!editorEl) {
    throw new Error(
      'Chat input not found. Please ensure the AI chat page is open and an input field is visible.',
    );
  }

  // 构造合成粘贴事件
  const dt = new DataTransfer();
  dt.items.add(attachFile);
  const pasteEvent = new ClipboardEvent('paste', {
    bubbles: true,
    cancelable: true,
    clipboardData: dt,
  });

  (editorEl as HTMLElement).focus();
  editorEl.dispatchEvent(pasteEvent);

  return `Attached "${fileName}" (${mimeType}) to chat input`;
}

/**
 * write_file — 写入文件（保留但当前禁用，需要显式开启）
 */
export async function writeTextFile(relativePath: string, content: string): Promise<void> {
  const segments = sanitizedSegments(relativePath);
  if (segments.length === 0) throw new Error('Invalid path: empty');
  const { dir, fileName } = await getDirectoryForSegments(segments, true);
  const fileHandle = await dir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(content);
  } finally {
    await writable.close();
  }
}
