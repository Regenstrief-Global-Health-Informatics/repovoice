import { useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  BookOpen,
  CloudOff,
  Download,
  Github,
  Loader2,
  MessagesSquare,
  Mic,
  MicOff,
  RefreshCw,
  Square,
  Sparkles,
  Upload,
  User,
  Wand2,
  Wifi,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import { LevelMeter } from "@/components/level-meter";
import { HistoryList } from "@/components/history-list";
import { IosInstallCard } from "@/components/ios-install-card";
import { DesktopAudioGuide } from "@/components/desktop-audio-guide";
import {
  PersonPicker,
  type SelectedPerson,
} from "@/components/person-picker";
import { SettingsPanel } from "@/components/settings-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AudioRecorder } from "@/lib/audio-recorder";
import {
  buildNoteMarkdown,
  interviewFileBase,
  interviewsFolder,
} from "@/lib/github";
import { isOnline } from "@/lib/idb";
import {
  countPendingJobs,
  createRecordingDefaults,
  ensureRecordingsHydrated,
  getRecordingAudio,
  getRecordingObjectUrl,
  useRecordings,
  type RecordingEntry,
  type TranscribeEngine,
} from "@/lib/recordings-store";
import {
  defaultTitleForKind,
  SESSION_KINDS,
  sessionKindMeta,
  type SessionKind,
} from "@/lib/session-kind";
import {
  modeUsesBrowser,
  modeUsesGrok,
  modeUsesWhisper,
  useSettings,
} from "@/lib/settings-store";
import {
  isBrowserSpeechSupported,
  isIOSDevice,
  LiveSpeechSession,
} from "@/lib/speech-recognition";
import { startNativeAppHooks } from "@/lib/native";
import { processSyncQueue, scheduleSyncQueue } from "@/lib/sync-queue";
import { cn, downloadBlob, formatDuration } from "@/lib/utils";

type Status = "idle" | "recording" | "stopping";

function hardAbortSpeech(session: LiveSpeechSession | null) {
  if (!session) return;
  try {
    session.abort();
  } catch {
    try {
      session.stop();
    } catch {
      // ignore
    }
  }
}

export function RecorderApp() {
  const settings = useSettings();
  const items = useRecordings((s) => s.items);
  const hydrated = useRecordings((s) => s.hydrated);
  const addRecording = useRecordings((s) => s.add);
  const updateRecording = useRecordings((s) => s.update);
  const queueTranscribe = useRecordings((s) => s.queueTranscribe);
  const queuePush = useRecordings((s) => s.queuePush);

  const recorderRef = useRef<AudioRecorder | null>(null);
  const speechRef = useRef<LiveSpeechSession | null>(null);
  const timerRef = useRef<number | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const stoppingRef = useRef(false);

  const [status, setStatus] = useState<Status>("idle");
  const [level, setLevel] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [sessionKind, setSessionKind] = useState<SessionKind>("interview");
  const [title, setTitle] = useState(() =>
    defaultTitleForKind("interview", undefined),
  );
  const [transcript, setTranscript] = useState("");
  const [livePartial, setLivePartial] = useState("");
  const [active, setActive] = useState<RecordingEntry | null>(null);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [onIOS, setOnIOS] = useState(false);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<SelectedPerson | null>(
    null,
  );

  const pending = countPendingJobs(items);
  const interviewsRoot = interviewsFolder(settings.githubPath || "interviews");
  const peopleRoot = settings.peoplePath || "people";
  const kindMeta = sessionKindMeta(sessionKind);
  const exampleName = selectedPerson
    ? `${selectedPerson.slug}_${kindMeta.fileTag}_…`
    : `unassigned_${kindMeta.fileTag}_…`;

  useEffect(() => {
    if (!active) return;
    const fresh = items.find((i) => i.id === active.id);
    if (!fresh) return;
    setActive(fresh);
    if (status === "idle" && fresh.transcript !== transcript) {
      if (
        fresh.transcriptSource === "grok" ||
        fresh.transcriptSource === "whisper"
      ) {
        setTranscript(fresh.transcript);
      }
    }
  }, [items, active?.id, status]);

  useEffect(() => {
    return ensureRecordingsHydrated();
  }, []);

  useEffect(() => {
    setOnIOS(isIOSDevice());
    setSpeechSupported(isBrowserSpeechSupported());
    setOnline(isOnline());

    const onOnline = () => {
      setOnline(true);
      toast.message("Back online — syncing queued jobs in Library…");
      setSyncing(true);
      void processSyncQueue().finally(() => setSyncing(false));
    };
    const onOffline = () => {
      setOnline(false);
      toast.message(
        "You are offline. Recordings will queue until connectivity returns.",
      );
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    if (isOnline()) {
      scheduleSyncQueue();
    }

    const stopNativeHooks = startNativeAppHooks(() => {
      if (isOnline()) scheduleSyncQueue();
    });

    return () => {
      stopNativeHooks();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      if (timerRef.current) window.clearInterval(timerRef.current);
      hardAbortSpeech(speechRef.current);
      speechRef.current = null;
      recorderRef.current?.cancel();
      recorderRef.current = null;
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const displayTranscript = useMemo(() => {
    if (status === "recording" && livePartial) return livePartial;
    return transcript;
  }, [status, livePartial, transcript]);

  const activePushLabel = useMemo(() => {
    if (!active) return null;
    if (active.pushStatus === "running") return "Pushing to GitHub…";
    if (active.pendingPush || active.pushStatus === "pending")
      return "GitHub push queued";
    if (active.pushStatus === "done" || active.githubMarkdownUrl)
      return "Pushed to GitHub";
    if (active.pushStatus === "error") return "Push failed — see Library";
    return null;
  }, [active]);

  const activeSttLabel = useMemo(() => {
    if (!active) return null;
    if (active.transcribeStatus === "running") return "Transcribing…";
    if (active.pendingTranscribe || active.transcribeStatus === "pending")
      return "Transcription queued";
    if (active.transcribeStatus === "error") return "Transcription failed";
    return null;
  }, [active]);

  function applySessionKind(next: SessionKind) {
    setSessionKind(next);
    if (status === "idle" && !active) {
      setTitle(defaultTitleForKind(next, selectedPerson?.name));
    }
  }

  function resetStudioForNextTake() {
    setSelectedPerson(null);
    setTranscript("");
    setLivePartial("");
    setActive(null);
    setTitle(defaultTitleForKind(sessionKind, undefined));
    setElapsedMs(0);
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setPlaybackUrl(null);
  }

  function handleSelectPerson(person: SelectedPerson) {
    setSelectedPerson(person);
    if (status === "idle" && !active) {
      setTitle(defaultTitleForKind(sessionKind, person.name));
    }
  }

  async function loadPlayback(id: string) {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    const url = await getRecordingObjectUrl(id);
    objectUrlRef.current = url;
    setPlaybackUrl(url);
  }

  function kickBackgroundSync() {
    if (!isOnline()) return;
    setSyncing(true);
    void processSyncQueue()
      .then((result) => {
        if (
          result.ran &&
          ((result.transcribed ?? 0) > 0 || (result.pushed ?? 0) > 0)
        ) {
          toast.message(
            `Library updated · ${result.transcribed ?? 0} transcript(s), ${result.pushed ?? 0} push(es)`,
          );
        }
      })
      .finally(() => setSyncing(false));
  }

  async function startRecording() {
    if (status !== "idle" || stoppingRef.current) return;

    hardAbortSpeech(speechRef.current);
    speechRef.current = null;
    recorderRef.current?.cancel();
    recorderRef.current = null;

    try {
      const recorder = new AudioRecorder();
      recorderRef.current = recorder;
      setElapsedMs(0);
      setLivePartial("");
      setTranscript("");
      setActive(null);
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      setPlaybackUrl(null);
      setTitle(defaultTitleForKind(sessionKind, selectedPerson?.name));
      setLevel(0);

      await recorder.start((l) => setLevel(l));
      setStatus("recording");

      const started = performance.now();
      timerRef.current = window.setInterval(() => {
        setElapsedMs(performance.now() - started);
      }, 200);

      const wantsBrowser =
        settings.autoTranscribe &&
        modeUsesBrowser(settings.transcribeMode) &&
        isBrowserSpeechSupported();

      if (wantsBrowser) {
        try {
          const session = new LiveSpeechSession({
            onPartial: (text) => setLivePartial(text),
            onFinal: (text) => {
              setTranscript(text);
              setLivePartial(text);
            },
            onError: (msg) => {
              console.warn("[repovoice] live STT:", msg);
            },
          });
          speechRef.current = session;
          session.start();
        } catch {
          // speech unavailable
        }
      }
    } catch (err) {
      hardAbortSpeech(speechRef.current);
      speechRef.current = null;
      recorderRef.current?.cancel();
      recorderRef.current = null;
      setStatus("idle");
      toast.error(
        err instanceof Error
          ? err.message
          : "Could not access the microphone. Allow mic permission and try again.",
      );
    }
  }

  async function stopRecording() {
    if (status !== "recording" || !recorderRef.current || stoppingRef.current) {
      return;
    }
    stoppingRef.current = true;
    setStatus("stopping");
    setLevel(0);

    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const speech = speechRef.current;
    speechRef.current = null;
    const browserText =
      speech?.getFinalText() || livePartial.trim() || transcript.trim();
    hardAbortSpeech(speech);

    const personAtStop = selectedPerson;
    const titleAtStop = title;
    const kindAtStop = sessionKind;
    const recorder = recorderRef.current;

    try {
      const snapshot = await recorder.stop();
      recorderRef.current = null;

      hardAbortSpeech(speechRef.current);
      speechRef.current = null;

      const finalText = browserText;
      const source: RecordingEntry["transcriptSource"] = browserText
        ? "browser"
        : undefined;

      const wantsGrok =
        settings.autoTranscribe && modeUsesGrok(settings.transcribeMode);
      const wantsWhisper =
        settings.autoTranscribe && modeUsesWhisper(settings.transcribeMode);

      const engine: TranscribeEngine | undefined = wantsGrok
        ? "grok"
        : wantsWhisper
          ? "whisper"
          : undefined;

      const id = crypto.randomUUID();
      const willQueuePush = Boolean(
        settings.queuePushOnSave && settings.isGithubReady(),
      );
      const entry = createRecordingDefaults({
        id,
        title:
          titleAtStop.trim() ||
          defaultTitleForKind(kindAtStop, personAtStop?.name),
        createdAt: new Date().toISOString(),
        durationMs: snapshot.durationMs,
        mimeType: snapshot.mimeType,
        extension: snapshot.extension,
        sizeBytes: snapshot.blob.size,
        transcript: finalText,
        transcriptSource: source,
        personSlug: personAtStop?.slug,
        personName: personAtStop?.name,
        personProfilePath: personAtStop?.profilePath,
        sessionKind: kindAtStop,
        pendingTranscribe: Boolean(engine),
        transcribeEngine: engine,
        transcribeStatus: engine ? "pending" : "idle",
        pendingPush: willQueuePush,
        pushStatus: willQueuePush ? "pending" : "idle",
      });

      await addRecording(entry, snapshot.blob);

      resetStudioForNextTake();
      setStatus("idle");
      stoppingRef.current = false;

      const fileHint = interviewFileBase({
        personSlug: personAtStop?.slug,
        title: entry.title,
        createdAt: new Date(entry.createdAt),
        sessionKind: kindAtStop,
      });

      toast.success(
        kindAtStop === "reflection"
          ? personAtStop
            ? `Reflection saved · ${personAtStop.name}`
            : "Reflection saved"
          : personAtStop
            ? `Interview saved · ${personAtStop.name}`
            : "Interview saved",
      );

      if (engine || willQueuePush) {
        const parts: string[] = [];
        if (engine) {
          parts.push(
            isOnline()
              ? `${engine === "grok" ? "Grok (diarized)" : "Whisper"} in background`
              : "STT queued offline",
          );
        }
        if (willQueuePush) {
          parts.push(
            isOnline()
              ? `GitHub push → ${interviewsRoot}/${fileHint}.*`
              : "GitHub push queued offline",
          );
        }
        toast.message(`${parts.join(" · ")} · see Library`);
        kickBackgroundSync();
      }
    } catch (err) {
      hardAbortSpeech(speechRef.current);
      speechRef.current = null;
      recorderRef.current?.cancel();
      recorderRef.current = null;
      setStatus("idle");
      stoppingRef.current = false;
      toast.error(
        err instanceof Error ? err.message : "Failed to save recording",
      );
    }
  }

  function requestCloudTranscribe(engine: TranscribeEngine) {
    if (!active) {
      toast.message("Select a take from Library first.");
      return;
    }
    if (engine === "grok" && !settings.xaiApiKey.trim()) {
      toast.error("Add an xAI API key under settings.");
      return;
    }
    if (engine === "whisper" && !settings.openaiApiKey.trim()) {
      toast.error("Add an OpenAI API key under settings.");
      return;
    }

    queueTranscribe(active.id, engine);
    toast.message(
      isOnline()
        ? `${engine === "grok" ? "Grok" : "Whisper"} started — watch Library`
        : `Queued ${engine === "grok" ? "Grok" : "Whisper"} offline`,
    );
    kickBackgroundSync();
  }

  function persistTranscript(next: string) {
    setTranscript(next);
    if (active) {
      setActive({ ...active, transcript: next, transcriptSource: "manual" });
      updateRecording(active.id, {
        transcript: next,
        transcriptSource: "manual",
      });
    }
  }

  function persistTitle(next: string) {
    setTitle(next);
    if (active) {
      setActive({ ...active, title: next });
      updateRecording(active.id, { title: next });
    }
  }

  function requestPush() {
    if (!active) {
      toast.message("Select a take from Library first.");
      return;
    }
    if (!settings.isGithubReady()) {
      toast.error("Fill in GitHub owner, repo, and token in settings.");
      return;
    }

    queuePush(active.id);
    toast.message(
      isOnline()
        ? `Push started — see Library for status`
        : "Push queued offline",
    );
    kickBackgroundSync();
  }

  async function downloadLocal() {
    if (!active) {
      toast.message("Select a take from Library first.");
      return;
    }
    setActionBusy("download");
    try {
      const audio = await getRecordingAudio(active.id);
      if (!audio) {
        toast.error("Audio not found in local storage.");
        return;
      }
      const base = interviewFileBase({
        personSlug: active.personSlug,
        title: active.title,
        createdAt: new Date(active.createdAt),
        sessionKind: active.sessionKind,
      });
      downloadBlob(audio, `${base}.${active.extension}`);

      const md = buildNoteMarkdown({
        title: active.title,
        createdAt: new Date(active.createdAt),
        durationMs: active.durationMs,
        audioPath: `${base}.${active.extension}`,
        transcript: transcript || active.transcript,
        source: active.transcriptSource,
        personSlug: active.personSlug,
        personName: active.personName,
        personProfilePath: active.personProfilePath,
        interviewsPath: interviewsRoot,
        sessionKind: active.sessionKind,
      });
      downloadBlob(
        new Blob([md], { type: "text/markdown;charset=utf-8" }),
        `${base}.md`,
      );
      toast.success("Downloaded audio + markdown");
    } finally {
      setActionBusy(null);
    }
  }

  async function selectEntry(entry: RecordingEntry) {
    if (status === "recording" || status === "stopping") {
      toast.message("Stop the current recording first.");
      return;
    }
    setActive(entry);
    setTitle(entry.title);
    setTranscript(entry.transcript);
    setLivePartial("");
    setElapsedMs(entry.durationMs);
    setSessionKind(
      entry.sessionKind === "reflection" ? "reflection" : "interview",
    );
    if (entry.personSlug) {
      setSelectedPerson({
        slug: entry.personSlug,
        name: entry.personName || entry.personSlug,
        profilePath: entry.personProfilePath || "",
        profileMarkdown: entry.personProfilePath
          ? `Linked profile: \`${entry.personProfilePath}\`\n\n_Re-select from People list to reload full bio/questions._`
          : "_No profile path stored._",
      });
    } else {
      setSelectedPerson(null);
    }
    await loadPlayback(entry.id);
  }

  async function syncNow() {
    if (!isOnline()) {
      toast.message("Still offline — jobs will wait.");
      return;
    }
    setSyncing(true);
    const result = await processSyncQueue({ force: true });
    setSyncing(false);
    if (result.ran) {
      toast.success(
        `Done — ${result.transcribed ?? 0} transcript(s), ${result.pushed ?? 0} push(es)${
          result.errors ? `, ${result.errors} error(s)` : ""
        }`,
      );
    }
  }

  const isRecording = status === "recording";
  const isStopping = status === "stopping";
  const canStart = status === "idle" && !stoppingRef.current;
  const kindLocked = isRecording || isStopping;

  return (
    <div
      className="min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-bg text-fg"
      style={{ backgroundColor: "#0a0a0b", color: "#f4f4f5" }}
    >
      <Toaster
        theme="dark"
        position="top-center"
        toastOptions={{
          className:
            "!bg-bg-elevated !text-fg !border-border !shadow-[var(--shadow-soft)]",
        }}
      />

      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-64 overflow-hidden"
        aria-hidden
      >
        <div className="mx-auto h-48 w-full max-w-md rounded-full bg-[radial-gradient(ellipse_at_center,color-mix(in_oklab,var(--color-accent)_14%,transparent),transparent_70%)] blur-2xl opacity-80" />
      </div>

      <div
        className="relative mx-auto w-full max-w-6xl min-w-0 px-4 sm:px-6 lg:px-8"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 1.75rem)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 4rem)",
          paddingLeft: "max(1rem, env(safe-area-inset-left, 0px))",
          paddingRight: "max(1rem, env(safe-area-inset-right, 0px))",
        }}
      >
        <header className="mb-8 flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-bg-elevated/90 px-3 py-1.5 text-xs text-fg-muted shadow-[var(--shadow-soft)] backdrop-blur-sm">
              <Sparkles className="size-3.5 shrink-0 text-accent" />
              RepoVoice
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
              Interview. Reflect. Commit.
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-fg-muted sm:text-base">
              Toggle <strong className="font-medium text-fg">Interview</strong>{" "}
              or <strong className="font-medium text-fg">Reflection</strong>.
              Both support multi-speaker diarization with Grok STT.
            </p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {online ? (
              <Badge variant="success" className="gap-1">
                <Wifi className="size-3" />
                Online
              </Badge>
            ) : (
              <Badge variant="recording" className="gap-1">
                <CloudOff className="size-3" />
                Offline
              </Badge>
            )}
            <Badge variant="accent" className="gap-1">
              {sessionKind === "interview" ? (
                <MessagesSquare className="size-3" />
              ) : (
                <BookOpen className="size-3" />
              )}
              {kindMeta.shortLabel}
            </Badge>
            {selectedPerson ? (
              <Badge variant="accent" className="gap-1 max-w-[12rem]">
                <User className="size-3 shrink-0" />
                <span className="truncate">{selectedPerson.name}</span>
              </Badge>
            ) : null}
            {pending.total > 0 ? (
              <Badge variant="accent" className="gap-1">
                {syncing ? <Loader2 className="size-3 animate-spin" /> : null}
                {pending.total} queued
              </Badge>
            ) : (
              <Badge>Queue clear</Badge>
            )}
            {settings.isGithubReady() ? (
              <Badge variant="success">GitHub ready</Badge>
            ) : (
              <Badge>Configure GitHub</Badge>
            )}
            {hydrated ? null : <Badge>Loading library…</Badge>}
          </div>
        </header>

        {pending.total > 0 ? (
          <div className="mb-5 flex min-w-0 flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-bg-elevated px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 text-sm text-fg-muted break-anywhere">
              <span className="font-medium text-fg">
                {pending.transcribe} transcript
                {pending.transcribe === 1 ? "" : "s"}
              </span>
              {" · "}
              <span className="font-medium text-fg">
                {pending.push} push{pending.push === 1 ? "" : "es"}
              </span>
              {syncing
                ? " — working in background."
                : online
                  ? " — waiting in Library."
                  : " — waiting for network."}
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="shrink-0"
              onClick={() => void syncNow()}
              disabled={!online || syncing}
            >
              {syncing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Sync now
            </Button>
          </div>
        ) : null}

        <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.95fr)]">
          <div className="min-w-0 space-y-5">
            <Card className="overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle>Studio</CardTitle>
                    <CardDescription className="break-anywhere">
                      Push target:{" "}
                      <code className="text-fg-muted">
                        {interviewsRoot}/{exampleName}
                      </code>
                    </CardDescription>
                  </div>
                  {isRecording ? (
                    <Badge variant="recording" className="shrink-0 gap-1.5">
                      <span className="size-1.5 rounded-full bg-recording animate-pulse" />
                      Recording
                    </Badge>
                  ) : isStopping ? (
                    <Badge variant="accent" className="shrink-0 gap-1">
                      <Loader2 className="size-3 animate-spin" />
                      Stopping
                    </Badge>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="min-w-0 space-y-2">
                  <Label>Session type</Label>
                  <div
                    className="grid grid-cols-2 gap-1.5 rounded-[var(--radius-md)] border border-border bg-bg p-1"
                    role="tablist"
                    aria-label="Session type"
                  >
                    {SESSION_KINDS.map((k) => {
                      const selected = sessionKind === k.id;
                      const Icon =
                        k.id === "interview" ? MessagesSquare : BookOpen;
                      return (
                        <button
                          key={k.id}
                          type="button"
                          role="tab"
                          aria-selected={selected}
                          disabled={kindLocked}
                          onClick={() => applySessionKind(k.id)}
                          className={cn(
                            "flex min-w-0 flex-col items-start gap-0.5 rounded-[var(--radius-sm)] px-3 py-2.5 text-left transition-colors",
                            selected
                              ? "bg-bg-elevated text-fg shadow-sm ring-1 ring-border-strong"
                              : "text-fg-muted hover:bg-bg-subtle/80 hover:text-fg",
                            kindLocked && "opacity-60",
                          )}
                        >
                          <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                            <Icon className="size-3.5 shrink-0" />
                            {k.label}
                          </span>
                          <span className="text-[11px] leading-snug text-fg-subtle">
                            {k.description}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-fg-subtle leading-relaxed">
                    Grok STT requests{" "}
                    <strong className="font-medium text-fg-muted">
                      speaker diarization
                    </strong>{" "}
                    for both types — interviewee dialogue or two interviewers
                    debriefing.
                  </p>
                </div>

                <div className="rounded-[var(--radius-lg)] border border-border bg-bg px-4 py-8 sm:px-8">
                  <LevelMeter level={level} active={isRecording} className="mb-8" />

                  <div className="flex flex-col items-center gap-4">
                    <div className="text-center">
                      <div className="tabular text-4xl font-medium tracking-tight text-fg sm:text-5xl">
                        {formatDuration(
                          isRecording || isStopping
                            ? elapsedMs
                            : active?.durationMs ?? elapsedMs,
                        )}
                      </div>
                      <div className="mt-2 px-2 text-xs uppercase tracking-wide text-fg-subtle">
                        {isStopping
                          ? "Saving take…"
                          : isRecording
                            ? sessionKind === "reflection"
                              ? selectedPerson
                                ? `Reflecting on ${selectedPerson.name}`
                                : "Recording reflection"
                              : selectedPerson
                                ? `Interviewing ${selectedPerson.name}`
                                : "Listening"
                            : active
                              ? "Reviewing take"
                              : "Ready"}
                      </div>
                    </div>

                    <div className="relative mt-2">
                      {isRecording ? (
                        <span className="recording-pulse absolute inset-0" />
                      ) : null}
                      {isRecording ? (
                        <Button
                          type="button"
                          size="icon-xl"
                          variant="recording"
                          className="relative z-10"
                          onClick={() => void stopRecording()}
                          aria-label="Stop recording"
                        >
                          <Square className="size-7 fill-current" />
                        </Button>
                      ) : isStopping ? (
                        <Button
                          type="button"
                          size="icon-xl"
                          variant="secondary"
                          className="relative z-10"
                          disabled
                          aria-label="Stopping recording"
                        >
                          <Loader2 className="size-8 animate-spin" />
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="icon-xl"
                          variant="default"
                          className="relative z-10"
                          onClick={() => void startRecording()}
                          disabled={!canStart}
                          aria-label="Start recording"
                        >
                          <Mic className="size-8" />
                        </Button>
                      )}
                    </div>

                    <p className="max-w-sm px-2 text-center text-xs leading-relaxed text-fg-muted break-anywhere">
                      {isStopping
                        ? "Releasing capture, then clearing studio for the next take."
                        : selectedPerson
                          ? `${kindMeta.label} for ${selectedPerson.name}. Files: ${exampleName}`
                          : `Select a person, choose ${kindMeta.label.toLowerCase()}, then record.`}
                    </p>

                    {active && (activePushLabel || activeSttLabel) ? (
                      <div className="flex max-w-sm flex-wrap justify-center gap-1.5">
                        {activeSttLabel ? (
                          <Badge
                            variant={
                              active.transcribeStatus === "error"
                                ? "danger"
                                : "accent"
                            }
                            className="gap-1"
                          >
                            {(active.transcribeStatus === "running" ||
                              active.transcribeStatus === "pending") && (
                              <Loader2 className="size-3 animate-spin" />
                            )}
                            {activeSttLabel}
                          </Badge>
                        ) : null}
                        {activePushLabel ? (
                          <Badge
                            variant={
                              active.pushStatus === "error"
                                ? "danger"
                                : active.pushStatus === "done" ||
                                    active.githubMarkdownUrl
                                  ? "success"
                                  : "accent"
                            }
                            className="gap-1"
                          >
                            {(active.pushStatus === "running" ||
                              active.pushStatus === "pending") && (
                              <Loader2 className="size-3 animate-spin" />
                            )}
                            {activePushLabel}
                          </Badge>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="min-w-0 space-y-3">
                  <div className="min-w-0 space-y-1.5">
                    <Label htmlFor="title">Title</Label>
                    <Input
                      id="title"
                      value={title}
                      onChange={(e) => persistTitle(e.target.value)}
                      disabled={isRecording || isStopping}
                      placeholder={
                        sessionKind === "reflection"
                          ? "Debrief: key themes, surprises…"
                          : "Interview segment, Q1 answers…"
                      }
                    />
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="transcript">
                        {sessionKind === "reflection"
                          ? "Reflection notes"
                          : "Transcript"}
                      </Label>
                      {active?.transcriptSource ? (
                        <span className="text-[11px] uppercase tracking-wide text-fg-subtle">
                          via {active.transcriptSource}
                        </span>
                      ) : null}
                    </div>
                    <Textarea
                      id="transcript"
                      value={displayTranscript}
                      onChange={(e) => persistTranscript(e.target.value)}
                      disabled={isRecording || isStopping}
                      placeholder={
                        sessionKind === "reflection"
                          ? "What we learned, open questions, follow-ups…"
                          : "Answers and dialogue appear here…"
                      }
                      className="min-h-[180px] min-w-0 font-mono text-[13px]"
                    />
                    <p className="text-[11px] text-fg-subtle leading-relaxed">
                      {kindMeta.transcriptHint}
                    </p>
                  </div>
                </div>

                {playbackUrl ? (
                  <div className="min-w-0 space-y-2">
                    <Label>Playback</Label>
                    <audio
                      controls
                      src={playbackUrl}
                      className="h-10 w-full max-w-full"
                      preload="metadata"
                    />
                  </div>
                ) : null}

                <div className="flex min-w-0 flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={requestPush}
                    disabled={!active || isRecording || isStopping}
                  >
                    <Upload className="size-4" />
                    {online ? "Push to GitHub" : "Queue push"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => requestCloudTranscribe("grok")}
                    disabled={!active || isRecording || isStopping}
                  >
                    <AudioLines className="size-4" />
                    {online ? "Grok STT" : "Queue Grok"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => requestCloudTranscribe("whisper")}
                    disabled={!active || isRecording || isStopping}
                  >
                    <Wand2 className="size-4" />
                    Whisper
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void downloadLocal()}
                    disabled={
                      !active ||
                      isRecording ||
                      isStopping ||
                      actionBusy === "download"
                    }
                  >
                    {actionBusy === "download" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Download className="size-4" />
                    )}
                    Download
                  </Button>
                </div>
              </CardContent>
            </Card>

            <HistoryList
              onSelect={(e) => void selectEntry(e)}
              selectedId={active?.id}
              online={online}
            />
          </div>

          <div className="min-w-0 space-y-5">
            <PersonPicker
              selected={selectedPerson}
              onSelect={handleSelectPerson}
              onClear={() => setSelectedPerson(null)}
            />
            <SettingsPanel />

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Github className="size-4 shrink-0 text-fg-muted" />
                  Repo Layout
                </CardTitle>
                <CardDescription>
                  Flat interviews folder; filenames include interview or
                  reflection.
                </CardDescription>
              </CardHeader>
              <CardContent className="min-w-0">
                <pre className="max-w-full overflow-x-auto rounded-[var(--radius-md)] border border-border bg-bg p-3 font-mono text-[11px] leading-relaxed text-fg-muted whitespace-pre">{`${peopleRoot}/
  jane-doe.md
${interviewsRoot}/
  jane-doe_interview_….m4a
  jane-doe_reflection_….m4a`}</pre>
                <ul className="mt-3 space-y-2 text-sm text-fg-muted leading-relaxed">
                  <li className="flex gap-2">
                    <MessagesSquare className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
                    <span className="min-w-0 break-anywhere">
                      <strong className="text-fg">Interview</strong> — with the
                      person; diarized.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <BookOpen className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
                    <span className="min-w-0 break-anywhere">
                      <strong className="text-fg">Reflection</strong> — solo or
                      two interviewers; also diarized.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <MicOff className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
                    <span className="min-w-0 break-anywhere">
                      After stop, studio clears; open Library to review.
                    </span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            <IosInstallCard />
            <DesktopAudioGuide />
          </div>
        </div>
      </div>
    </div>
  );
}
