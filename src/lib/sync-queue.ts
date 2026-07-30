import {
  buildNoteMarkdown,
  interviewFileBase,
  interviewsFolder,
  uploadFileToGithub,
} from "@/lib/github";
import { blobToBase64, isOnline } from "@/lib/idb";
import {
  getRecordingAudio,
  useRecordings,
  type RecordingEntry,
  type TranscribeEngine,
} from "@/lib/recordings-store";
import { sessionKindMeta } from "@/lib/session-kind";
import { useSettings, type AppSettings } from "@/lib/settings-store";
import { transcribeWithGrok, transcribeWithWhisper } from "@/lib/transcribe";
import { slugify } from "@/lib/utils";

type ProgressFn = (message: string) => void;

let processing = false;
let scheduled = false;
let processingStartedAt = 0;
const LOCK_STALE_MS = 3 * 60_000;
const JOB_TIMEOUT_MS = 100_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () =>
        reject(
          new Error(`${label} timed out after ${Math.round(ms / 1000)}s`),
        ),
      ms,
    );
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export function isSyncProcessing() {
  return processing;
}

export function scheduleSyncQueue(opts?: { onProgress?: ProgressFn }) {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    void processSyncQueue(opts);
  });
}

function recoverStuckJobs() {
  const store = useRecordings.getState();
  for (const item of store.items) {
    if (item.transcribeStatus === "running") {
      store.update(item.id, {
        pendingTranscribe: true,
        transcribeStatus: "pending",
        transcribeError: "Previous run interrupted — retrying…",
      });
    }
    if (item.pushStatus === "running") {
      store.update(item.id, {
        pendingPush: true,
        pushStatus: "pending",
        pushError: "Previous run interrupted — retrying…",
      });
    }
  }
}

export async function processSyncQueue(opts?: {
  onProgress?: ProgressFn;
  force?: boolean;
}) {
  if (processing) {
    if (Date.now() - processingStartedAt > LOCK_STALE_MS) {
      processing = false;
    } else {
      return { ran: false, reason: "busy" as const };
    }
  }
  if (!opts?.force && !isOnline()) {
    return { ran: false, reason: "offline" as const };
  }

  processing = true;
  processingStartedAt = Date.now();
  const onProgress = opts?.onProgress;
  let transcribed = 0;
  let pushed = 0;
  let errors = 0;

  try {
    recoverStuckJobs();
    const settings = useSettings.getState();

    for (;;) {
      if (!isOnline() && !opts?.force) break;
      const job = useRecordings
        .getState()
        .items.find(
          (i) =>
            i.pendingPush ||
            i.pushStatus === "pending" ||
            i.pushStatus === "running",
        );
      if (!job) break;

      if (job.pushStatus === "running" && !job.pendingPush) {
        useRecordings.getState().update(job.id, {
          pendingPush: true,
          pushStatus: "pending",
        });
      }

      if (!settings.isGithubReady()) {
        useRecordings.getState().update(job.id, {
          pendingPush: false,
          pushStatus: "error",
          pushError: "GitHub not configured",
        });
        errors += 1;
        continue;
      }

      useRecordings.getState().update(job.id, {
        pendingPush: true,
        pushStatus: "running",
        pushError: undefined,
      });
      onProgress?.(`Pushing “${job.title}” to GitHub…`);

      try {
        await withTimeout(
          pushRecordingToGithub(job, settings),
          JOB_TIMEOUT_MS,
          "GitHub push",
        );
        pushed += 1;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "GitHub upload failed";
        const fatal = /401|403|Bad credentials|not found|404/i.test(message);
        useRecordings.getState().update(job.id, {
          pendingPush: !fatal,
          pushStatus: "error",
          pushError: message,
        });
        errors += 1;
        if (fatal) break;
        if (!isOnline()) break;
      }
    }

    for (;;) {
      if (!isOnline() && !opts?.force) break;
      const job = useRecordings
        .getState()
        .items.find(
          (i) =>
            i.pendingTranscribe ||
            i.transcribeStatus === "pending" ||
            i.transcribeStatus === "running",
        );
      if (!job) break;

      if (job.transcribeStatus === "running" && !job.pendingTranscribe) {
        useRecordings.getState().update(job.id, {
          pendingTranscribe: true,
          transcribeStatus: "pending",
        });
      }

      const engine: TranscribeEngine =
        job.transcribeEngine ??
        (settings.xaiApiKey.trim()
          ? "grok"
          : settings.openaiApiKey.trim()
            ? "whisper"
            : "grok");

      const apiKey =
        engine === "grok"
          ? settings.xaiApiKey.trim()
          : settings.openaiApiKey.trim();

      if (!apiKey) {
        useRecordings.getState().update(job.id, {
          pendingTranscribe: false,
          transcribeStatus: "error",
          transcribeError:
            engine === "grok"
              ? "Missing xAI API key — add it under Destination & transcription"
              : "Missing OpenAI API key",
        });
        errors += 1;
        continue;
      }

      const diarize = sessionKindMeta(job.sessionKind).diarize;

      useRecordings.getState().update(job.id, {
        pendingTranscribe: true,
        transcribeStatus: "running",
        transcribeError: undefined,
      });
      onProgress?.(
        `Transcribing “${job.title}” with ${engine === "grok" ? "Grok" : "Whisper"}${
          diarize && engine === "grok" ? " (diarized)" : ""
        }…`,
      );

      try {
        const audio = await getRecordingAudio(job.id);
        if (!audio) throw new Error("Audio missing from local storage");

        const audioBase64 = await blobToBase64(audio);
        const payload = {
          audioBase64,
          mimeType: job.mimeType,
          filename: `${slugify(job.title) || "recording"}.${job.extension}`,
          apiKey,
          diarize: engine === "grok" ? diarize : false,
        };

        const result =
          engine === "grok"
            ? await withTimeout(
                transcribeWithGrok({ data: payload }),
                JOB_TIMEOUT_MS,
                "Grok STT",
              )
            : await withTimeout(
                transcribeWithWhisper({ data: payload }),
                JOB_TIMEOUT_MS,
                "Whisper",
              );

        const text = result.text || job.transcript;
        useRecordings.getState().update(job.id, {
          transcript: text,
          transcriptSource: engine,
          pendingTranscribe: false,
          transcribeStatus: "done",
          transcribeError: undefined,
        });
        transcribed += 1;

        const after = useRecordings
          .getState()
          .items.find((i) => i.id === job.id);
        if (
          after &&
          (after.pushStatus === "done" || after.githubMarkdownUrl) &&
          settings.isGithubReady() &&
          text
        ) {
          try {
            onProgress?.(`Updating GitHub notes for “${job.title}”…`);
            await withTimeout(
              pushRecordingToGithub(after, settings),
              JOB_TIMEOUT_MS,
              "GitHub re-push",
            );
          } catch {
            // non-fatal
          }
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Transcription failed";
        const fatal = /401|403|invalid.*key|missing.*key|api key/i.test(
          message,
        );
        useRecordings.getState().update(job.id, {
          pendingTranscribe: !fatal,
          transcribeStatus: "error",
          transcribeError: message,
        });
        errors += 1;
        if (fatal) break;
        if (!isOnline()) break;
      }
    }

    return { ran: true, transcribed, pushed, errors };
  } finally {
    processing = false;
    processingStartedAt = 0;
  }
}

export async function pushRecordingToGithub(
  entry: RecordingEntry,
  settings: AppSettings & {
    isGithubReady: () => boolean;
  },
) {
  const audio = await getRecordingAudio(entry.id);
  if (!audio) throw new Error("Audio missing from local storage");

  const fresh =
    useRecordings.getState().items.find((i) => i.id === entry.id) ?? entry;

  const created = new Date(fresh.createdAt);
  const folder = interviewsFolder(settings.githubPath || "interviews");
  const base = interviewFileBase({
    personSlug: fresh.personSlug,
    title: fresh.title,
    createdAt: created,
    sessionKind: fresh.sessionKind,
  });

  const audioName = `${base}.${fresh.extension}`;
  const mdName = `${base}.md`;
  const audioPath = folder ? `${folder}/${audioName}` : audioName;
  const mdPath = folder ? `${folder}/${mdName}` : mdName;

  const owner = settings.githubOwner.trim();
  const repo = settings.githubRepo.trim();
  const branch = settings.githubBranch.trim() || "main";
  const token = settings.githubToken.trim();
  const kindTag = sessionKindMeta(fresh.sessionKind).fileTag;
  const messageBase = settings.commitPrefix.trim() || kindTag;
  const who = fresh.personName || fresh.personSlug || "general";

  const audioBase64 = await blobToBase64(audio);
  const audioResult = await uploadFileToGithub({
    owner,
    repo,
    branch,
    path: audioPath,
    contentBase64: audioBase64,
    message: `${messageBase}(${who}/${kindTag}): audio ${fresh.title}`,
    token,
  });

  const markdown = buildNoteMarkdown({
    title: fresh.title,
    createdAt: created,
    durationMs: fresh.durationMs,
    audioPath: audioName,
    transcript: fresh.transcript,
    source: fresh.transcriptSource,
    personSlug: fresh.personSlug,
    personName: fresh.personName,
    personProfilePath: fresh.personProfilePath,
    interviewsPath: folder,
    sessionKind: fresh.sessionKind,
  });
  const mdBase64 = btoa(unescape(encodeURIComponent(markdown)));

  const mdResult = await uploadFileToGithub({
    owner,
    repo,
    branch,
    path: mdPath,
    contentBase64: mdBase64,
    message: `${messageBase}(${who}/${kindTag}): notes ${fresh.title}`,
    token,
  });

  useRecordings.getState().update(fresh.id, {
    githubAudioUrl: audioResult.htmlUrl,
    githubMarkdownUrl: mdResult.htmlUrl,
    pushedAt: new Date().toISOString(),
    pendingPush: false,
    pushStatus: "done",
    pushError: undefined,
  });
}
