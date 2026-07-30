const DB_NAME = "repovoice-idb-v2";
const DB_VERSION = 1;
const STORE_META = "meta";
const STORE_AUDIO = "audio";

type StoreName = typeof STORE_META | typeof STORE_AUDIO;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this environment."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META);
      }
      if (!db.objectStoreNames.contains(STORE_AUDIO)) {
        db.createObjectStore(STORE_AUDIO);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

function runStore<T>(
  storeName: StoreName,
  mode: IDBTransactionMode,
  exec: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const request = exec(store);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
          reject(request.error ?? new Error("IndexedDB request failed"));
        tx.onabort = () =>
          reject(tx.error ?? new Error("IndexedDB transaction aborted"));
      }),
  );
}

export async function idbGetMeta<T>(key: string): Promise<T | undefined> {
  return runStore(STORE_META, "readonly", (store) => store.get(key));
}

export async function idbSetMeta<T>(key: string, value: T): Promise<void> {
  await runStore(STORE_META, "readwrite", (store) => store.put(value, key));
}

export async function idbDeleteMeta(key: string): Promise<void> {
  await runStore(STORE_META, "readwrite", (store) => store.delete(key));
}

export async function idbPutAudio(id: string, blob: Blob): Promise<void> {
  await runStore(STORE_AUDIO, "readwrite", (store) => store.put(blob, id));
}

export async function idbGetAudio(id: string): Promise<Blob | undefined> {
  return runStore(STORE_AUDIO, "readonly", (store) => store.get(id));
}

export async function idbDeleteAudio(id: string): Promise<void> {
  await runStore(STORE_AUDIO, "readwrite", (store) => store.delete(id));
}

/** Zustand-compatible async storage backed by IndexedDB (no-ops on SSR) */
export function createIdbStorage(metaKey: string) {
  return {
    getItem: async (name: string): Promise<string | null> => {
      if (typeof indexedDB === "undefined") return null;
      try {
        const value = await idbGetMeta<string>(`${metaKey}:${name}`);
        return value ?? null;
      } catch {
        return null;
      }
    },
    setItem: async (name: string, value: string): Promise<void> => {
      if (typeof indexedDB === "undefined") return;
      await idbSetMeta(`${metaKey}:${name}`, value);
    },
    removeItem: async (name: string): Promise<void> => {
      if (typeof indexedDB === "undefined") return;
      await idbDeleteMeta(`${metaKey}:${name}`);
    },
  };
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}
