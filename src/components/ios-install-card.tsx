import { useEffect, useState } from "react";
import { ChevronDown, Share, Smartphone } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua);
  const iPadOs =
    navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return iOS || iPadOs;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}

export function IosInstallCard({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [onIos, setOnIos] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    setOnIos(isIos());
    // Auto-expand on iPhone when not installed — most useful there
    if (isIos() && !isStandalone()) {
      setOpen(true);
    }
  }, []);

  return (
    <Card className={cn("min-w-0 overflow-hidden", className)}>
      <CardHeader className="pb-2">
        <button
          type="button"
          className="flex w-full min-w-0 items-start justify-between gap-3 text-left"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="size-4 shrink-0 text-fg-muted" />
              iPhone App
            </CardTitle>
            <CardDescription>
              {installed
                ? "Running from Home Screen — offline library and queue still work."
                : onIos
                  ? "Add to Home Screen for full-screen, app-like use."
                  : "Installable PWA — best experience is Safari on iPhone."}
            </CardDescription>
          </div>
          <ChevronDown
            className={cn(
              "mt-1 size-4 shrink-0 text-fg-muted transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </CardHeader>

      {open ? (
        <CardContent className="space-y-3 text-sm text-fg-muted leading-relaxed">
          {installed ? (
            <p className="text-success">
              Installed — open RepoVoice from your Home Screen icon anytime.
            </p>
          ) : (
            <ol className="list-decimal space-y-2 pl-4">
              <li>
                Open this app in{" "}
                <strong className="font-medium text-fg">Safari</strong> on your
                iPhone (Chrome on iOS cannot fully install PWAs).
              </li>
              <li>
                Tap the{" "}
                <span className="inline-flex items-center gap-1 font-medium text-fg">
                  Share <Share className="inline size-3.5" />
                </span>{" "}
                button.
              </li>
              <li>
                Scroll and tap{" "}
                <strong className="font-medium text-fg">
                  Add to Home Screen
                </strong>
                , then Add.
              </li>
              <li>
                Launch{" "}
                <strong className="font-medium text-fg">RepoVoice</strong> from
                the new icon — full screen, offline recording ready.
              </li>
            </ol>
          )}
          <div className="rounded-[var(--radius-md)] border border-border bg-bg px-3 py-3 text-xs leading-relaxed">
            <p className="font-medium text-fg">What works offline on iPhone</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4">
              <li>Record, save, playback, edit transcript, download files</li>
              <li>IndexedDB library + queued Grok / GitHub jobs</li>
              <li>Auto-sync when cellular or Wi‑Fi returns</li>
            </ul>
            <p className="mt-2 text-fg-subtle">
              True App Store packaging needs a Mac + Xcode (Capacitor). Home
              Screen install is the path you can use immediately.
            </p>
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}
