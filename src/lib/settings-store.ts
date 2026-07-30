import { create } from "zustand";
import { persist } from "zustand/middleware";

/** How transcripts are produced after / during a take */
export type TranscribeMode =
  | "browser"
  | "grok"
  | "whisper"
  | "browser_grok"
  | "browser_whisper";

export type AppSettings = {
  githubOwner: string;
  githubRepo: string;
  githubBranch: string;
  /**
   * Folder where audio + transcript markdown are deposited.
   * When a person is selected: {githubPath}/{person-slug}/
   * Default: interviews
   */
  githubPath: string;
  /**
   * Folder listing people (markdown files or subfolders with bio + questions).
   * Default: people
   */
  peoplePath: string;
  githubToken: string;
  /** xAI API key for Grok Speech-to-Text */
  xaiApiKey: string;
  openaiApiKey: string;
  transcribeMode: TranscribeMode;
  autoTranscribe: boolean;
  /**
   * When true, each new take is queued for GitHub upload and will push
   * automatically once connectivity returns (if GitHub is configured).
   */
  queuePushOnSave: boolean;
  commitPrefix: string;
};

type SettingsState = AppSettings & {
  setField: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  setMany: (patch: Partial<AppSettings>) => void;
  isGithubReady: () => boolean;
  isGrokReady: () => boolean;
  isWhisperReady: () => boolean;
};

const defaults: AppSettings = {
  githubOwner: "",
  githubRepo: "",
  githubBranch: "main",
  githubPath: "interviews",
  peoplePath: "people",
  githubToken: "",
  xaiApiKey: "",
  openaiApiKey: "",
  transcribeMode: "browser_grok",
  autoTranscribe: true,
  queuePushOnSave: true,
  commitPrefix: "interview",
};

/** Migrate older mode ids stored in localStorage */
function migrateMode(mode: string | undefined): TranscribeMode {
  if (mode === "both") return "browser_whisper";
  if (
    mode === "browser" ||
    mode === "grok" ||
    mode === "whisper" ||
    mode === "browser_grok" ||
    mode === "browser_whisper"
  ) {
    return mode;
  }
  return "browser_grok";
}

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...defaults,
      setField: (key, value) => set({ [key]: value } as Partial<AppSettings>),
      setMany: (patch) => set(patch),
      isGithubReady: () => {
        const s = get();
        return Boolean(s.githubOwner && s.githubRepo && s.githubToken);
      },
      isGrokReady: () => Boolean(get().xaiApiKey.trim()),
      isWhisperReady: () => Boolean(get().openaiApiKey.trim()),
    }),
    {
      name: "repovoice-settings-v1",
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppSettings> & {
          transcribeMode?: string;
        };
        return {
          ...current,
          ...p,
          transcribeMode: migrateMode(p.transcribeMode),
          xaiApiKey: p.xaiApiKey ?? current.xaiApiKey,
          queuePushOnSave: p.queuePushOnSave ?? current.queuePushOnSave,
          peoplePath: p.peoplePath ?? current.peoplePath,
          // Migrate old default "recordings" only if user never set path — keep their value
          githubPath: p.githubPath ?? current.githubPath,
        };
      },
      partialize: (state) => ({
        githubOwner: state.githubOwner,
        githubRepo: state.githubRepo,
        githubBranch: state.githubBranch,
        githubPath: state.githubPath,
        peoplePath: state.peoplePath,
        githubToken: state.githubToken,
        xaiApiKey: state.xaiApiKey,
        openaiApiKey: state.openaiApiKey,
        transcribeMode: state.transcribeMode,
        autoTranscribe: state.autoTranscribe,
        queuePushOnSave: state.queuePushOnSave,
        commitPrefix: state.commitPrefix,
      }),
    },
  ),
);

export function modeUsesBrowser(mode: TranscribeMode): boolean {
  return (
    mode === "browser" ||
    mode === "browser_grok" ||
    mode === "browser_whisper"
  );
}

export function modeUsesGrok(mode: TranscribeMode): boolean {
  return mode === "grok" || mode === "browser_grok";
}

export function modeUsesWhisper(mode: TranscribeMode): boolean {
  return mode === "whisper" || mode === "browser_whisper";
}
