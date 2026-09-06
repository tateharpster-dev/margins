/**
 * Durable storage for the app's state document.
 *
 * Phase 1 keeps the whole database in one JSON document (see src/domain/db.ts
 * for why that is adequate at personal scale). This module is the only place
 * that knows where that document physically lives, so swapping in SQLite later
 * touches nothing else.
 *
 * Native uses the app's document directory, which is backed up and survives
 * updates. Web uses IndexedDB, which has no practical size ceiling, falling
 * back to localStorage where IndexedDB is unavailable (private browsing, or a
 * browser configured to block site data).
 */
import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';

const FILE_NAME = 'margins-state.json';
const DB_NAME = 'margins';
const STORE_NAME = 'state';
const KEY = 'document';

export interface Storage {
  read(): Promise<string | null>;
  write(contents: string): Promise<void>;
}

/* ---------------------------------- native --------------------------------- */

const nativeStorage: Storage = {
  async read() {
    const file = new File(Paths.document, FILE_NAME);
    if (!file.exists) return null;
    return file.text();
  },
  async write(contents) {
    const dir = new Directory(Paths.document);
    if (!dir.exists) dir.create({ intermediates: true });
    const file = new File(Paths.document, FILE_NAME);
    if (!file.exists) file.create();
    file.write(contents);
  },
};

/* ----------------------------------- web ----------------------------------- */

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const webStorage: Storage = {
  async read() {
    try {
      const db = await openDatabase();
      return await new Promise<string | null>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).get(KEY);
        request.onsuccess = () => resolve((request.result as string | undefined) ?? null);
        request.onerror = () => reject(request.error);
      });
    } catch {
      // IndexedDB can be entirely absent, not merely empty.
      try {
        return globalThis.localStorage?.getItem(`${DB_NAME}:${KEY}`) ?? null;
      } catch {
        return null;
      }
    }
  },
  async write(contents) {
    try {
      const db = await openDatabase();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(contents, KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      try {
        globalThis.localStorage?.setItem(`${DB_NAME}:${KEY}`, contents);
      } catch {
        // Nothing durable is available. The session still works in memory;
        // surfacing a failed write on every keystroke would be worse.
      }
    }
  },
};

export const storage: Storage = Platform.OS === 'web' ? webStorage : nativeStorage;
