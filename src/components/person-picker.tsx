import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  ExternalLink,
  Loader2,
  Maximize2,
  RefreshCw,
  User,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { MarkdownView } from "@/components/markdown-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import {
  listPeopleFromRepo,
  loadPersonProfile,
  type PersonSlug,
} from "@/lib/github";
import { isOnline } from "@/lib/idb";
import { useSettings } from "@/lib/settings-store";
import { cn } from "@/lib/utils";

export type SelectedPerson = {
  slug: string;
  name: string;
  profilePath: string;
  profileMarkdown: string;
  htmlUrl?: string;
};

export function PersonPicker({
  selected,
  onSelect,
  onClear,
  className,
}: {
  selected: SelectedPerson | null;
  onSelect: (person: SelectedPerson) => void;
  onClear: () => void;
  className?: string;
}) {
  const settings = useSettings();
  const [people, setPeople] = useState<PersonSlug[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [readerOpen, setReaderOpen] = useState(false);
  const [listCollapsed, setListCollapsed] = useState(false);

  const ready = settings.isGithubReady();
  const interviewsRoot = settings.githubPath || "interviews";
  const peopleRoot = settings.peoplePath || "people";

  useEffect(() => {
    if (!selected) {
      setListCollapsed(false);
      setReaderOpen(false);
    }
  }, [selected]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter(
      (p) =>
        p.slug.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q),
    );
  }, [people, query]);

  const showList = !selected || !listCollapsed;

  const refresh = useCallback(async () => {
    if (!ready) {
      toast.message("Configure GitHub owner, repo, and token first.");
      return;
    }
    if (!isOnline()) {
      toast.message("You are offline — cannot refresh people list.");
      return;
    }
    setLoadingList(true);
    setError(null);
    try {
      const list = await listPeopleFromRepo({
        owner: settings.githubOwner.trim(),
        repo: settings.githubRepo.trim(),
        peoplePath: peopleRoot,
        branch: settings.githubBranch.trim() || "main",
        token: settings.githubToken.trim(),
      });
      setPeople(list);
      setListCollapsed(false);
      if (!list.length) {
        toast.message(
          `No people found under “${peopleRoot}”. Add .md files or folders.`,
        );
      } else {
        toast.success(`Loaded ${list.length} people from the repo`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to list people";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoadingList(false);
    }
  }, [ready, settings, peopleRoot]);

  async function pick(person: PersonSlug) {
    if (!ready) return;
    if (!isOnline()) {
      onSelect({
        slug: person.slug,
        name: person.name,
        profilePath: person.profilePath,
        profileMarkdown:
          "_Profile not loaded (offline). Bio will be unavailable until you refresh online._",
        htmlUrl: person.htmlUrl,
      });
      setListCollapsed(true);
      toast.message(`Selected ${person.name} (profile cached later when online)`);
      return;
    }

    setLoadingProfile(true);
    try {
      const profile = await loadPersonProfile({
        owner: settings.githubOwner.trim(),
        repo: settings.githubRepo.trim(),
        branch: settings.githubBranch.trim() || "main",
        token: settings.githubToken.trim(),
        person,
      });
      onSelect({
        slug: person.slug,
        name: profile.name,
        profilePath: profile.path,
        profileMarkdown: profile.text,
        htmlUrl: profile.htmlUrl,
      });
      setListCollapsed(true);
      toast.success(`Loaded profile for ${profile.name}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load person profile",
      );
    } finally {
      setLoadingProfile(false);
    }
  }

  return (
    <>
      <Card
        className={cn(
          // No sticky: sticky caused Settings to paint over this card on desktop scroll
          "relative z-0 min-w-0 overflow-hidden isolation-isolate",
          className,
        )}
      >
        <CardHeader className="shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2">
                <Users className="size-4 shrink-0 text-fg-muted" />
                People
              </CardTitle>
              <CardDescription>
                Pick a slug for the next take. After you stop, selection clears
                so you can pick again.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="shrink-0"
              onClick={() => void refresh()}
              disabled={loadingList || !ready}
            >
              {loadingList ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!ready ? (
            <p className="text-sm text-fg-muted">
              Connect GitHub in settings, then refresh to load people from{" "}
              <code className="text-fg-subtle">{peopleRoot}/</code>.
            </p>
          ) : null}

          {error ? (
            <p className="text-sm text-danger leading-relaxed break-anywhere">
              {error}
            </p>
          ) : null}

          {selected ? (
            <div className="rounded-[var(--radius-md)] border border-border-strong bg-bg-subtle px-3 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <User className="size-4 shrink-0 text-accent" />
                    <span className="font-medium text-fg">{selected.name}</span>
                    <Badge variant="accent">{selected.slug}</Badge>
                  </div>
                  <p className="mt-1 truncate text-xs text-fg-muted">
                    {selected.profilePath}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-fg-subtle">
                    → {interviewsRoot}/{selected.slug}_…
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {selected.htmlUrl ? (
                    <a
                      href={selected.htmlUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-[var(--radius-xs)] p-1.5 text-fg-muted hover:bg-bg hover:text-fg"
                      aria-label="Open on GitHub"
                    >
                      <ExternalLink className="size-4" />
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setListCollapsed(false);
                      onClear();
                    }}
                    className="rounded-[var(--radius-xs)] p-1.5 text-fg-muted hover:bg-bg hover:text-fg"
                    aria-label="Clear person"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setReaderOpen(true)}
                >
                  <Maximize2 className="size-3.5" />
                  Full reader
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setListCollapsed((v) => !v)}
                >
                  <BookOpen className="size-3.5" />
                  {listCollapsed ? "Show people list" : "Hide people list"}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-fg-subtle">
              No person selected — choose someone below for the next recording.
            </p>
          )}

          {showList ? (
            <div className="min-w-0 space-y-2">
              <Input
                placeholder="Filter people…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={!people.length}
              />
              {/* Independent scroll region — tall enough for desktop, clipped cleanly */}
              <div className="rounded-[var(--radius-md)] border border-border bg-bg">
                <ul
                  className="max-h-[min(22rem,50vh)] space-y-0.5 overflow-y-auto overscroll-contain p-1.5 [scrollbar-gutter:stable]"
                  role="listbox"
                  aria-label="People from repository"
                >
                  {filtered.map((p) => {
                    const active = selected?.slug === p.slug;
                    return (
                      <li key={p.slug}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={active}
                          onClick={() => void pick(p)}
                          disabled={loadingProfile}
                          className={cn(
                            "flex w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] border px-3 py-2.5 text-left text-sm transition-colors",
                            active
                              ? "border-border-strong bg-bg-subtle"
                              : "border-transparent hover:border-border hover:bg-bg-subtle/70",
                          )}
                        >
                          <span className="min-w-0 truncate font-medium text-fg">
                            {p.name}
                          </span>
                          <span className="shrink-0 font-mono text-xs text-fg-subtle">
                            {p.slug}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                  {!filtered.length && people.length > 0 ? (
                    <li className="px-1 py-6 text-center text-xs text-fg-subtle">
                      No matches
                    </li>
                  ) : null}
                  {!people.length && ready ? (
                    <li className="px-1 py-6 text-center text-xs text-fg-subtle">
                      Tap Refresh to load people from the repo
                    </li>
                  ) : null}
                  {!ready ? (
                    <li className="px-1 py-6 text-center text-xs text-fg-subtle">
                      Connect GitHub in settings first
                    </li>
                  ) : null}
                </ul>
              </div>
              {people.length > 0 ? (
                <p className="text-[11px] text-fg-subtle">
                  {filtered.length === people.length
                    ? `${people.length} people`
                    : `${filtered.length} of ${people.length} shown`}
                  {" · "}scroll inside the list
                </p>
              ) : null}
            </div>
          ) : null}

          {selected ? (
            <div className="min-w-0 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium uppercase tracking-wide text-fg-muted">
                  Profile / questions
                </div>
                <button
                  type="button"
                  className="text-xs text-accent hover:underline"
                  onClick={() => setReaderOpen(true)}
                >
                  Expand
                </button>
              </div>
              {loadingProfile ? (
                <div className="flex items-center gap-2 text-sm text-fg-muted">
                  <Loader2 className="size-4 animate-spin" />
                  Loading markdown…
                </div>
              ) : (
                <div className="max-h-[min(18rem,40vh)] overflow-y-auto overscroll-contain rounded-[var(--radius-md)] border border-border bg-bg p-3 [scrollbar-gutter:stable]">
                  <MarkdownView markdown={selected.profileMarkdown} />
                </div>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Drawer open={readerOpen} onOpenChange={setReaderOpen}>
        <DrawerContent>
          <DrawerHeader>
            <div className="flex items-start justify-between gap-3 pr-2">
              <div className="min-w-0">
                <DrawerTitle className="truncate">
                  {selected?.name ?? "Profile"}
                </DrawerTitle>
                <DrawerDescription className="truncate font-mono text-xs">
                  {selected?.profilePath}
                </DrawerDescription>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {selected?.htmlUrl ? (
                  <a
                    href={selected.htmlUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-[var(--radius-xs)] p-2 text-fg-muted hover:bg-bg-subtle hover:text-fg"
                  >
                    <ExternalLink className="size-4" />
                  </a>
                ) : null}
                <DrawerClose className="rounded-[var(--radius-xs)] p-2 text-fg-muted hover:bg-bg-subtle hover:text-fg">
                  <X className="size-4" />
                </DrawerClose>
              </div>
            </div>
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2">
            {selected ? (
              <MarkdownView
                markdown={selected.profileMarkdown}
                className="text-[15px] [&_h1]:text-2xl [&_h2]:text-xl"
              />
            ) : null}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
