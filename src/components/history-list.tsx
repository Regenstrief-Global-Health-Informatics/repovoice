import type { ReactNode } from "react";
import {
  BookOpen,
  CloudOff,
  ExternalLink,
  FileAudio,
  FileText,
  Loader2,
  MessagesSquare,
  Trash2,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  countPendingJobs,
  hasPendingWork,
  useRecordings,
  type RecordingEntry,
} from "@/lib/recordings-store";
import { sessionKindMeta } from "@/lib/session-kind";
import { formatBytes, formatDuration } from "@/lib/utils";

function StatusBadges({ item }: { item: RecordingEntry }) {
  const badges: ReactNode[] = [];
  const kind = sessionKindMeta(item.sessionKind);

  badges.push(
    <Badge
      key="kind"
      variant={item.sessionKind === "reflection" ? "default" : "accent"}
      className="gap-1"
    >
      {item.sessionKind === "reflection" ? (
        <BookOpen className="size-3 shrink-0" />
      ) : (
        <MessagesSquare className="size-3 shrink-0" />
      )}
      {kind.shortLabel}
    </Badge>,
  );

  if (item.personSlug) {
    badges.push(
      <Badge key="person" variant="accent" className="gap-1 max-w-[9rem]">
        <User className="size-3 shrink-0" />
        <span className="truncate">{item.personSlug}</span>
      </Badge>,
    );
  }

  if (item.pushStatus === "done" || item.githubMarkdownUrl) {
    badges.push(
      <Badge key="pushed" variant="success">
        Pushed
      </Badge>,
    );
  } else if (item.pushStatus === "running") {
    badges.push(
      <Badge key="pushing" variant="accent" className="gap-1">
        <Loader2 className="size-3 animate-spin" />
        Pushing
      </Badge>,
    );
  } else if (item.pendingPush || item.pushStatus === "pending") {
    badges.push(
      <Badge key="push-q" variant="accent" className="gap-1">
        <Loader2 className="size-3 animate-spin" />
        Push queued
      </Badge>,
    );
  } else if (item.pushStatus === "error") {
    badges.push(
      <Badge key="push-err" variant="danger">
        Push error
      </Badge>,
    );
  } else {
    badges.push(
      <Badge key="local" variant="default">
        Local only
      </Badge>,
    );
  }

  if (item.transcribeStatus === "running") {
    badges.push(
      <Badge key="tr-run" variant="accent" className="gap-1">
        <Loader2 className="size-3 animate-spin" />
        Transcribing
      </Badge>,
    );
  } else if (item.pendingTranscribe || item.transcribeStatus === "pending") {
    badges.push(
      <Badge key="tr-q" variant="accent" className="gap-1">
        <Loader2 className="size-3 animate-spin" />
        STT queued
      </Badge>,
    );
  } else if (item.transcribeStatus === "error") {
    badges.push(
      <Badge key="tr-err" variant="danger">
        STT error
      </Badge>,
    );
  } else if (
    item.transcriptSource === "grok" ||
    item.transcriptSource === "whisper"
  ) {
    badges.push(
      <Badge key="tr-ok" variant="success">
        STT done
      </Badge>,
    );
  }

  return <div className="flex flex-wrap justify-end gap-1">{badges}</div>;
}

export function HistoryList({
  onSelect,
  selectedId,
  online,
}: {
  onSelect: (entry: RecordingEntry) => void;
  selectedId?: string | null;
  online: boolean;
}) {
  const items = useRecordings((s) => s.items);
  const remove = useRecordings((s) => s.remove);
  const pending = countPendingJobs(items);

  return (
    // Height follows content only — never stretch to match the tall right column
    <Card className="min-w-0 self-start">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>Library</CardTitle>
            <CardDescription>
              Interviews and reflections. Scroll the list when it gets long.
            </CardDescription>
          </div>
          {pending.total > 0 ? (
            <Badge
              variant={online ? "accent" : "recording"}
              className="shrink-0 gap-1"
            >
              {!online ? (
                <CloudOff className="size-3" />
              ) : (
                <Loader2 className="size-3 animate-spin" />
              )}
              {pending.total} pending
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="rounded-[var(--radius-md)] border border-dashed border-border px-4 py-6 text-center">
            <p className="text-sm text-fg-muted">No recordings yet.</p>
            <p className="mt-1 text-xs text-fg-subtle">
              Pick Interview or Reflection, select a person, then record.
            </p>
          </div>
        ) : (
          <ul className="max-h-[min(22rem,50vh)] space-y-2 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]">
            {items.map((item) => {
              const selected = item.id === selectedId;
              return (
                <li key={item.id}>
                  <div
                    className={[
                      "group rounded-[var(--radius-md)] border p-3 transition-colors",
                      selected
                        ? "border-border-strong bg-bg-subtle"
                        : "border-border hover:bg-bg-subtle/70",
                      hasPendingWork(item) ? "border-l-2 border-l-accent" : "",
                    ].join(" ")}
                  >
                    <button
                      type="button"
                      className="w-full min-w-0 text-left"
                      onClick={() => onSelect(item)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-fg">
                            {item.title}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                            {item.personName ? (
                              <>
                                <span className="truncate text-accent">
                                  {item.personName}
                                </span>
                                <span>·</span>
                              </>
                            ) : null}
                            <span className="tabular">
                              {formatDuration(item.durationMs)}
                            </span>
                            <span>·</span>
                            <span>{formatBytes(item.sizeBytes)}</span>
                            <span>·</span>
                            <span>
                              {new Date(item.createdAt).toLocaleString(
                                undefined,
                                {
                                  month: "short",
                                  day: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                },
                              )}
                            </span>
                          </div>
                        </div>
                        <StatusBadges item={item} />
                      </div>
                      {item.transcript ? (
                        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-fg-subtle">
                          {item.transcript}
                        </p>
                      ) : null}
                      {item.transcribeError || item.pushError ? (
                        <p className="mt-1 line-clamp-2 text-xs text-danger break-anywhere">
                          {item.transcribeError || item.pushError}
                        </p>
                      ) : null}
                    </button>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {item.githubAudioUrl ? (
                        <a
                          href={item.githubAudioUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                        >
                          <FileAudio className="size-3.5" />
                          Audio
                          <ExternalLink className="size-3" />
                        </a>
                      ) : null}
                      {item.githubMarkdownUrl ? (
                        <a
                          href={item.githubMarkdownUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                        >
                          <FileText className="size-3.5" />
                          Notes
                          <ExternalLink className="size-3" />
                        </a>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="ml-auto h-7 px-2 text-fg-muted hover:text-danger"
                        onClick={() => void remove(item.id)}
                      >
                        <Trash2 className="size-3.5" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
