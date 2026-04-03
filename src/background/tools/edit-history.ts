// ==========================================
// IndexedDB 编辑历史存储 / IndexedDB Edit History Storage
// ==========================================

import type { FileEdit, EditSession } from '../../types';

const IDB_NAME = 'g-master-edit-history';
const IDB_STORE = 'edits';

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        const store = db.createObjectStore(IDB_STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('sessionId', 'sessionId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Save a file edit record. Returns the auto-incremented id.
 */
export async function saveEdit(edit: FileEdit): Promise<number> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    const req = store.add(edit);
    req.onsuccess = () => resolve(req.result as number);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Get all edits for a session, ordered by timestamp ascending.
 */
export async function getSessionEdits(sessionId: string): Promise<FileEdit[]> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const store = tx.objectStore(IDB_STORE);
    const index = store.index('sessionId');
    const req = index.getAll(sessionId);
    req.onsuccess = () => {
      const edits = (req.result as FileEdit[]).sort((a, b) => a.timestamp - b.timestamp);
      resolve(edits);
    };
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Update the status of a specific edit by id.
 */
export async function updateEditStatus(
  editId: number,
  status: 'applied' | 'rejected',
): Promise<void> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    const getReq = store.get(editId);
    getReq.onsuccess = () => {
      const record = getReq.result as FileEdit | undefined;
      if (!record) {
        reject(new Error(`Edit with id ${editId} not found`));
        return;
      }
      record.status = status;
      const putReq = store.put(record);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Get a single edit by id.
 */
export async function getEdit(editId: number): Promise<FileEdit | undefined> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const store = tx.objectStore(IDB_STORE);
    const req = store.get(editId);
    req.onsuccess = () => resolve(req.result as FileEdit | undefined);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Clear all edits for a given session.
 */
export async function clearSession(sessionId: string): Promise<void> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    const index = store.index('sessionId');
    const req = index.openCursor(sessionId);
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/**
 * List all sessions with their edit counts and last edit timestamp.
 */
export async function getAllSessions(): Promise<EditSession[]> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const store = tx.objectStore(IDB_STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      const allEdits = req.result as FileEdit[];
      const sessionMap = new Map<string, { editCount: number; lastEdit: number }>();

      for (const edit of allEdits) {
        const existing = sessionMap.get(edit.sessionId);
        if (existing) {
          existing.editCount++;
          existing.lastEdit = Math.max(existing.lastEdit, edit.timestamp);
        } else {
          sessionMap.set(edit.sessionId, { editCount: 1, lastEdit: edit.timestamp });
        }
      }

      const sessions: EditSession[] = [];
      for (const [sessionId, data] of sessionMap) {
        sessions.push({ sessionId, ...data });
      }

      resolve(sessions);
    };
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}
