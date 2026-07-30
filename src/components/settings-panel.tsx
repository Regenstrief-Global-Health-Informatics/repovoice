import { useCallback, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  FolderTree,
  Github,
  KeyRound,
  Loader2,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";
import { FolderPickerField } from "@/components/folder-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { listRepoFolders, verifyGithubAccess } from "@/lib/github";
import { isOnline } from "@/lib/idb";
import {
  modeUsesGrok,
  modeUsesWhisper,
  useSettings,
  type TranscribeMode,
} from "@/lib/settings-store";
import { cn } from "@/lib/utils";

const modes: { id: TranscribeMode; label: string; hint: string }[] = [
  {
    id: "browser",
    label: "Browser",
    hint: "Free live STT",
  },
  {
    id: "grok",
    label: "Grok STT",
    hint: "After stop",
  },
  {
    id: "browser_grok",
    label: "Live + Grok",
    hint: "Draft + polish",
  },
  {
    id: "whisper",
    label: "Whisper",
    hint: "After stop",
  },
  {
    id: "browser_whisper",
    label: "Live + Whisper",
    hint: "Draft + polish",
  },
];

export function SettingsPanel({ className }: { className?: string }) {
  const settings = useSettings();
  const [showToken, setShowToken] = useState(false);
  const [showXai, setShowXai] = useState(false);
  const [showOpenAI, setShowOpenAI] = useState(false);
  const [testing, setTesting] = useState(false);
  const [verifiedName, setVerifiedName] = useState<string | null>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [loadingTree, setLoadingTree] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [transcriptionOpen, setTranscriptionOpen] = useState(false);

  const needsGrok = modeUsesGrok(settings.transcribeMode);
  const needsWhisper = modeUsesWhisper(settings.transcribeMode);
  const interviewsRoot = settings.githubPath || "interviews";
  const peopleRoot = settings.peoplePath || "people";
  const githubReady = Boolean(
    settings.githubOwner.trim() &&
      settings.githubRepo.trim() &&
      settings.githubToken.trim(),
  );

  const activeModeLabel =
    modes.find((m) => m.id === settings.transcribeMode)?.label ?? "Live + Grok";

  const loadFolderTree = useCallback(async () => {
    if (!githubReady) {
      toast.message("Enter owner, repo, and token first.");
      return;
    }
    if (!isOnline()) {
      toast.message("You are offline — cannot browse the GitHub tree.");
      return;
    }
    setLoadingTree(true);
    setTreeError(null);
    try {
      const list = await listRepoFolders({
        owner: settings.githubOwner.trim(),
        repo: settings.githubRepo.trim(),
        branch: settings.githubBranch.trim() || "main",
        token: settings.githubToken.trim(),
        maxDepth: 5,
      });
      setFolders(list);
      if (!list.length) {
        toast.message(
          "No folders found on this branch (empty repo or only files at root).",
        );
      } else {
        toast.success(`Loaded ${list.length} folders from the repo tree`);
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to load repository tree";
      setTreeError(msg);
      toast.error(msg);
    } finally {
      setLoadingTree(false);
    }
  }, [githubReady, settings]);

  async function testGithub() {
    setTesting(true);
    setVerifiedName(null);
    setTreeError(null);
    try {
      const result = await verifyGithubAccess({
        owner: settings.githubOwner.trim(),
        repo: settings.githubRepo.trim(),
        token: settings.githubToken.trim(),
      });
      if (result.ok) {
        if (
          result.defaultBranch &&
          settings.githubBranch.trim() !== result.defaultBranch
        ) {
          settings.setField("githubBranch", result.defaultBranch);
          toast.message(`Branch set to “${result.defaultBranch}” (repo default)`);
        }
        setVerifiedName(
          `${result.fullName}${result.private ? " · private" : ""} · ${result.defaultBranch}`,
        );
        toast.success(`Connected to ${result.fullName}`);
        setLoadingTree(true);
        try {
          const list = await listRepoFolders({
            owner: settings.githubOwner.trim(),
            repo: settings.githubRepo.trim(),
            branch: result.defaultBranch,
            token: settings.githubToken.trim(),
            maxDepth: 5,
          });
          setFolders(list);
          if (list.length) {
            toast.success(`Loaded ${list.length} folders from the repo tree`);
          }
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : "Failed to load repository tree";
          setTreeError(msg);
        } finally {
          setLoadingTree(false);
        }
      } else {
        toast.error(result.error);
        setTreeError(result.error);
      }
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card className={cn("min-w-0", className)}>
      <CardHeader className="pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <Settings2 className="size-4 shrink-0 text-fg-muted" />
          <CardTitle>Destination & transcription</CardTitle>
        </div>
        <CardDescription>
          Connect GitHub, pick folders from the repo tree, then set transcription.
        </CardDescription>
      </CardHeader>
      <CardContent className="min-w-0 space-y-4">
        <section className="min-w-0 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-fg">
            <Github className="size-4 shrink-0 text-fg-muted" />
            GitHub repository
          </div>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5 sm:col-span-2">
              <Label htmlFor="owner">Owner</Label>
              <Input
                id="owner"
                placeholder="your-org"
                value={settings.githubOwner}
                onChange={(e) => settings.setField("githubOwner", e.target.value)}
                autoComplete="off"
                className="font-mono text-xs sm:text-sm"
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="repo">Repo</Label>
              <Input
                id="repo"
                placeholder="interviews"
                value={settings.githubRepo}
                onChange={(e) => settings.setField("githubRepo", e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="branch">Branch</Label>
              <Input
                id="branch"
                placeholder="main"
                value={settings.githubBranch}
                onChange={(e) => settings.setField("githubBranch", e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="min-w-0 space-y-1.5 sm:col-span-2">
              <Label htmlFor="token">Access token</Label>
              <div className="relative min-w-0">
                <Input
                  id="token"
                  type={showToken ? "text" : "password"}
                  placeholder="ghp_… or github_pat_…"
                  value={settings.githubToken}
                  onChange={(e) => settings.setField("githubToken", e.target.value)}
                  autoComplete="off"
                  className="pr-11"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-[var(--radius-xs)] p-1.5 text-fg-muted hover:bg-bg-subtle hover:text-fg"
                  onClick={() => setShowToken((v) => !v)}
                  aria-label={showToken ? "Hide token" : "Show token"}
                >
                  {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <p className="text-[11px] text-fg-subtle leading-relaxed">
                Branch must match the repo default. Test connection auto-fills
                it when possible.
              </p>
            </div>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void testGithub()}
              disabled={testing || !githubReady}
            >
              {testing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              Test connection
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadFolderTree()}
              disabled={loadingTree || !githubReady}
            >
              {loadingTree ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FolderTree className="size-4" />
              )}
              Load folder tree
            </Button>
            {verifiedName ? (
              <span className="min-w-0 text-xs text-success break-anywhere">
                Verified · {verifiedName}
              </span>
            ) : null}
          </div>

          {treeError ? (
            <p className="max-w-full text-xs text-danger leading-relaxed break-anywhere">
              {treeError}
            </p>
          ) : null}

          <div className="grid min-w-0 gap-3 border-t border-border pt-3">
            <FolderPickerField
              id="peoplePath"
              label="People folder (slugs)"
              value={settings.peoplePath}
              onChange={(v) => settings.setField("peoplePath", v)}
              folders={folders}
              loading={loadingTree}
              disabled={!githubReady}
              placeholder="people"
              hint={
                <>
                  e.g.{" "}
                  <code className="text-fg-muted">{peopleRoot}/jane-doe.md</code>
                </>
              }
            />
            <FolderPickerField
              id="githubPath"
              label="Interviews folder (flat list)"
              value={settings.githubPath}
              onChange={(v) => settings.setField("githubPath", v)}
              folders={folders}
              loading={loadingTree}
              disabled={!githubReady}
              placeholder="interviews"
              hint={
                <>
                  e.g.{" "}
                  <code className="text-fg-muted">
                    {interviewsRoot}/jane-doe_….webm
                  </code>
                </>
              }
            />
          </div>

          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="commit">Commit message prefix</Label>
            <Input
              id="commit"
              value={settings.commitPrefix}
              onChange={(e) => settings.setField("commitPrefix", e.target.value)}
            />
          </div>
        </section>

        <section className="min-w-0 border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setTranscriptionOpen((v) => !v)}
            className="flex w-full min-w-0 items-center justify-between gap-2 rounded-[var(--radius-md)] px-1 py-1.5 text-left"
            aria-expanded={transcriptionOpen}
          >
            <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-fg">
              <KeyRound className="size-4 shrink-0 text-fg-muted" />
              <span className="truncate">
                Transcription
                <span className="font-normal text-xs text-fg-subtle">
                  {" "}
                  · {activeModeLabel}
                </span>
              </span>
            </div>
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-fg-muted transition-transform",
                transcriptionOpen && "rotate-180",
              )}
            />
          </button>

          {transcriptionOpen ? (
            <div className="mt-3 min-w-0 space-y-3">
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {modes.map((mode) => {
                  const selected = settings.transcribeMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => settings.setField("transcribeMode", mode.id)}
                      className={cn(
                        "min-w-0 rounded-[var(--radius-md)] border px-3 py-2 text-left transition-colors",
                        selected
                          ? "border-border-strong bg-bg-subtle"
                          : "border-border bg-transparent hover:bg-bg-subtle/60",
                      )}
                    >
                      <div className="text-sm font-medium text-fg">{mode.label}</div>
                      <div className="mt-0.5 text-xs text-fg-muted">{mode.hint}</div>
                    </button>
                  );
                })}
              </div>

              {needsGrok ? (
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="xai">xAI API key (Grok STT)</Label>
                  <div className="relative min-w-0">
                    <Input
                      id="xai"
                      type={showXai ? "text" : "password"}
                      placeholder="xai-…"
                      value={settings.xaiApiKey}
                      onChange={(e) => settings.setField("xaiApiKey", e.target.value)}
                      autoComplete="off"
                      className="pr-11"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-[var(--radius-xs)] p-1.5 text-fg-muted hover:bg-bg-subtle hover:text-fg"
                      onClick={() => setShowXai((v) => !v)}
                      aria-label={showXai ? "Hide key" : "Show key"}
                    >
                      {showXai ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>
              ) : null}

              {needsWhisper ? (
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="openai">OpenAI API key (Whisper)</Label>
                  <div className="relative min-w-0">
                    <Input
                      id="openai"
                      type={showOpenAI ? "text" : "password"}
                      placeholder="sk-…"
                      value={settings.openaiApiKey}
                      onChange={(e) =>
                        settings.setField("openaiApiKey", e.target.value)
                      }
                      autoComplete="off"
                      className="pr-11"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-[var(--radius-xs)] p-1.5 text-fg-muted hover:bg-bg-subtle hover:text-fg"
                      onClick={() => setShowOpenAI((v) => !v)}
                      aria-label={showOpenAI ? "Hide key" : "Show key"}
                    >
                      {showOpenAI ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="flex min-w-0 items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-bg px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-fg">Auto-transcribe on stop</div>
                  <div className="text-xs text-fg-muted">Queue when offline</div>
                </div>
                <Switch
                  checked={settings.autoTranscribe}
                  onCheckedChange={(v) => settings.setField("autoTranscribe", v)}
                />
              </div>

              <div className="flex min-w-0 items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-bg px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-fg">Queue GitHub push on save</div>
                  <div className="text-xs text-fg-muted">When GitHub is configured</div>
                </div>
                <Switch
                  checked={settings.queuePushOnSave}
                  onCheckedChange={(v) => settings.setField("queuePushOnSave", v)}
                />
              </div>
            </div>
          ) : null}
        </section>
      </CardContent>
    </Card>
  );
}
