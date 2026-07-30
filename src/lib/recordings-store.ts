import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  dataUrlToBlob,
  idbDeleteAudio,
  idbGetAudio,
  idbPutAudio,
} from "@/lib/idb";
import type { SessionKind } from "@/lib/session-kind";

export type TranscribeEngine = "grok" | "whisper";

export type JobStatus = "idle" | "pending" | "running" | "done" | "error";

export type RecordingEntry = {
  id: string;
  title: string;
  createdAt: string;
  durationMs: number;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  transcript: string;
  transcriptSource?: "browser" | "grok" | "whisper" | "manual";
  githubAudioUrl?: string;
  githubMarkdownUrl?: string;
  pushedAt?: string;
  personSlug?: string;
  personName?: string;
  personProfilePath?: string;
  sessionKind?: SessionKind;
  pendingTranscribe: boolean;
  pendingPush: boolean;
  transcribeEngine?: TranscribeEngine;
  transcribeStatus: JobStatus;
  pushStatus: JobStatus;
  transcribeError?: string;
  pushError?: string;
  audioDataUrl?: string;
};

type RecordingsState = {
  items: RecordingEntry[];
  hydrated: boolean;
  setHydrated: (v: boolean) => void;
  add: (entry: RecordingEntry, audio: Blob) => Promise<void>;
  update: (id: string, patch: Partial<RecordingEntry>) => void;
  remove: (id: string) => Promise<void>;
  clear: () => Promise<void>;
  queueTranscribe: (id: string, engine: TranscribeEngine) => void;
  queuePush: (id: string) => void;
  clearQueueFlags: (id: string, kind: "transcribe" | "push") => void;
};

const META_NAME = "repovoice-recordings-meta-v3";

function stripAudioFromEntry(entry: RecordingEntry): RecordingEntry {
  const { audioDataUrl: _drop, ...rest } = entry;
  return rest;
}

function safeLocalStorage(): Storage {
  if (typeof window === "undefined") {
    return {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    };
  }
  try {
    const k = "__rv_test__";
    window.localStorage.setItem(k, "1");
    window.localStorage.removeItem(k);
    return window.localStorage;
  } catch {
    const mem = new Map<string, string>();
    return {
      getItem: (name) => mem.get(name) ?? null,
      setItem: (name, value) => {
        mem.set(name, value);
      },
      removeItem: (name) => {
        mem.delete(name);
      },
      clear: () => mem.clear(),
      key: (i) => Array.from(mem.keys())[i] ?? null,
      length: mem.size,
    };
  }
}

export function createRecordingDefaults(
  partial: Omit<
    RecordingEntry,
    | "pendingTranscribe"
    | "pendingPush"
    | "transcribeStatus"
    | "pushStatus"
  > &
    Partial<
      Pick<
        RecordingEntry,
        | "pendingTranscribe"
        | "pendingPush"
        | "transcribeStatus"
        | "pushStatus"
        | "transcribeEngine"
        | "personSlug"
        | "personName"
        | "personProfilePath"
        | "sessionKind"
      >
    >,
): RecordingEntry {
  return {
    pendingTranscribe: false,
    pendingPush: false,
    transcribeStatus: "idle",
    pushStatus: "idle",
    sessionKind: partial.sessionKind ?? "interview",
    ...partial,
  };
}

export const useRecordings = create<RecordingsState>()(
  persist(
    (set, get) => ({
      items: [],
      hydrated: false,
      setHydrated: (v) => set({ hydrated: v }),

      add: async (entry, audio) => {
        try {
          await idbPutAudio(entry.id, audio);
        } catch (err) {
          console.warn("[repovoice] audio store failed", err);
        }
        set((state) => ({
          items: [stripAudioFromEntry(entry), ...state.items].slice(0, 80),
        }));
      },

      update: (id, patch) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, ...patch } : item,
          ),
        })),

      remove: async (id) => {
        try {
          await idbDeleteAudio(id);
        } catch {
          // ignore
        }
        set((state) => ({
          items: state.items.filter((i) => i.id !== id),
        }));
      },

      clear: async () => {
        const ids = get().items.map((i) => i.id);
        await Promise.all(
          ids.map((id) => idbDeleteAudio(id).catch(() => undefined)),
        );
        set({ items: [] });
      },

      queueTranscribe: (id, engine) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? {
                  ...item,
                  pendingTranscribe: true,
                  transcribeEngine: engine,
                  transcribeStatus: "pending" as JobStatus,
                  transcribeError: undefined,
                }
              : item,
          ),
        })),

      queuePush: (id) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? {
                  ...item,
                  pendingPush: true,
                  pushStatus: "pending" as JobStatus,
                  pushError: undefined,
                }
              : item,
          ),
        })),

      clearQueueFlags: (id, kind) =>
        set((state) => ({
          items: state.items.map((item) => {
            if (item.id !== id) return item;
            if (kind === "transcribe") {
              return {
                ...item,
                pendingTranscribe: false,
                transcribeStatus:
                  item.transcribeStatus === "running" ||
                  item.transcribeStatus === "pending"
                    ? ("idle" as JobStatus)
                    : item.transcribeStatus,
              };
            }
            return {
              ...item,
              pendingPush: false,
              pushStatus:
                item.pushStatus === "running" || item.pushStatus === "pending"
                  ? ("idle" as JobStatus)
                  : item.pushStatus,
            };
          }),
        })),
    }),
    {
      name: META_NAME,
      storage: createJSONStorage(() => safeLocalStorage()),
      partialize: (state) => ({
        items: state.items.map(stripAudioFromEntry),
      }),
      onRehydrateStorage: () => (state, error) => {
        // Always clear the badge — even if rehydrate failed on Safari
        if (error) {
          console.warn("[repovoice] recordings rehydrate failed", error);
        }
        useRecordings.getState().setHydrated(true);
        if (state?.items) {
          for (const item of state.items) {
            if (item.audioDataUrl) {
              void dataUrlToBlob(item.audioDataUrl)
                .then((blob) => idbPutAudio(item.id, blob))
                .catch(() => undefined);
            }
          }
        }
      },
      merge: (persisted, current) => {
        const p = persisted as Partial<RecordingsState> | undefined;
        return {
          ...current,
          ...p,
          items: (p?.items ?? current.items).map((item) => ({
            ...item,
            sessionKind:
              item.sessionKind === "reflection" ? "reflection" : "interview",
            pendingTranscribe: item.pendingTranscribe ?? false,
            pendingPush: item.pendingPush ?? false,
            transcribeStatus: item.transcribeStatus ?? "idle",
            pushStatus:
              item.pushStatus ?? (item.githubMarkdownUrl ? "done" : "idle"),
          })),
        };
      },
    },
  ),
);

/** Call once on mount — guarantees "Loading library…" never sticks forever */
export function ensureRecordingsHydrated() {
  // Already done (SSR/client race)
  if (useRecordings.getState().hydrated) return () => undefined;

  // Fast path: if persist already finished
  try {
    // zustand persist v4 exposes hasHydrated on the store API when available
    const anyStore = useRecordings as unknown as {
      persist?: { hasHydrated?: () => boolean; onFinishHydration?: (cb: () => void) => () => void };
    };
    if (anyStore.persist?.hasHydrated?.()) {
      useRecordings.getState().setHydrated(true);
    }
    const unsub = anyStore.persist?.onFinishHydration?.(() => {
      useRecordings.getState().setHydrated(true);
    });
    const t = window.setTimeout(() => {
      useRecordings.getState().setHydrated(true);
    }, 400);
    return () => {
      window.clearTimeout(t);
      unsub?.();
    };
  } catch {
    const t = window.setTimeout(() => {
      useRecordings.getState().setHydrated(true);
    }, 400);
    return () => window.clearTimeout(t);
  }
}

export async function getRecordingAudio(id: string): Promise<Blob | null> {
  try {
    const fromIdb = await idbGetAudio(id);
    if (fromIdb) return fromIdb;
  } catch {
    // fall through
  }
  const entry = useRecordings.getState().items.find((i) => i.id === id);
  if (entry?.audioDataUrl) {
    try {
      return await dataUrlToBlob(entry.audioDataUrl);
    } catch {
      return null;
    }
  }
  return null;
}

export async function getRecordingObjectUrl(
  id: string,
): Promise<string | null> {
  const blob = await getRecordingAudio(id);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

export function countPendingJobs(items: RecordingEntry[]) {
  let transcribe = 0;
  let push = 0;
  for (const item of items) {
    if (item.pendingTranscribe || item.transcribeStatus === "pending") {
      transcribe += 1;
    }
    if (item.pendingPush || item.pushStatus === "pending") {
      push += 1;
    }
  }
  return { transcribe, push, total: transcribe + push };
}

export function hasPendingWork(item: RecordingEntry) {
  return (
    item.pendingTranscribe ||
    item.pendingPush ||
    item.transcribeStatus === "pending" ||
    item.transcribeStatus === "running" ||
    item.pushStatus === "pending" ||
    item.pushStatus === "running"
  );
}
