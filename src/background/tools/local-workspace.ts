let workspaceRoot: FileSystemDirectoryHandle | null = null;

export function setRoot(directoryHandle: FileSystemDirectoryHandle | null): void {
  workspaceRoot = directoryHandle;
}

export function getRoot(): FileSystemDirectoryHandle | null {
  return workspaceRoot;
}

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
  if (segments.length === 0) {
    throw new Error('Invalid path: empty after sanitization');
  }
  return segments;
}

async function getDirectoryForSegments(
  segments: string[],
  createIntermediate: boolean,
): Promise<{ dir: FileSystemDirectoryHandle; fileName: string }> {
  if (!workspaceRoot) {
    throw new Error('Workspace root is not set');
  }
  const fileName = segments[segments.length - 1]!;
  const dirSegments = segments.slice(0, -1);
  let dir = workspaceRoot;
  for (const name of dirSegments) {
    dir = await dir.getDirectoryHandle(name, createIntermediate ? { create: true } : undefined);
  }
  return { dir, fileName };
}

export async function readTextFile(relativePath: string): Promise<string> {
  const segments = sanitizedSegments(relativePath);
  const { dir, fileName } = await getDirectoryForSegments(segments, false);
  const fileHandle = await dir.getFileHandle(fileName);
  const file = await fileHandle.getFile();
  return file.text();
}

export async function writeTextFile(relativePath: string, content: string): Promise<void> {
  const segments = sanitizedSegments(relativePath);
  const { dir, fileName } = await getDirectoryForSegments(segments, true);
  const fileHandle = await dir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(content);
  } finally {
    await writable.close();
  }
}
