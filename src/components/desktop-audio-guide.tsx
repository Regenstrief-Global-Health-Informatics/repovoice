import { useState } from "react";
import {
  AppWindow,
  AudioLines,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Headphones,
  Laptop,
  Mic,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    title: "Install BlackHole (free)",
    body: (
      <>
        On your Mac, install{" "}
        <strong className="font-medium text-fg">BlackHole 2ch</strong> (two
        channels is enough for speech).
        <ul className="mt-2 list-disc space-y-1 pl-4 text-fg-muted">
          <li>
            Download from{" "}
            <a
              href="https://existential.audio/blackhole/"
              target="_blank"
              rel="noreferrer"
              className="text-accent underline-offset-2 hover:underline"
            >
              existential.audio/blackhole
            </a>{" "}
            or install via Homebrew:{" "}
            <code className="rounded bg-bg px-1 py-0.5 text-[11px] text-fg-muted">
              brew install blackhole-2ch
            </code>
          </li>
          <li>Run the installer, then restart Zoom/Teams (or reboot if the device doesn’t appear).</li>
          <li>
            Confirm it exists: open{" "}
            <strong className="font-medium text-fg">
              Applications → Utilities → Audio MIDI Setup
            </strong>
            .
          </li>
        </ul>
      </>
    ),
  },
  {
    title: "Create a Multi-Output device (so you can still hear)",
    body: (
      <>
        BlackHole alone is silent to your ears — route call audio to{" "}
        <em>both</em> your speakers/headset <em>and</em> BlackHole.
        <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-fg-muted">
          <li>
            Open{" "}
            <strong className="font-medium text-fg">Audio MIDI Setup</strong>.
          </li>
          <li>
            Click{" "}
            <strong className="font-medium text-fg">+</strong> (bottom left) →{" "}
            <strong className="font-medium text-fg">
              Create Multi-Output Device
            </strong>
            .
          </li>
          <li>
            Check both:
            <ul className="mt-1 list-disc pl-4">
              <li>
                <strong className="font-medium text-fg">
                  MacBook Speakers
                </strong>{" "}
                / your headphones (so you hear the call)
              </li>
              <li>
                <strong className="font-medium text-fg">BlackHole 2ch</strong>{" "}
                (so RepoVoice can record it)
              </li>
            </ul>
          </li>
          <li>
            Optional: rename it to{" "}
            <code className="rounded bg-bg px-1 py-0.5 text-[11px]">
              Zoom + BlackHole
            </code>
            .
          </li>
          <li>
            Right‑click the Multi-Output →{" "}
            <strong className="font-medium text-fg">
              Use This Device For Sound Output
            </strong>{" "}
            (or set it in System Settings → Sound → Output when you interview).
          </li>
        </ol>
      </>
    ),
  },
  {
    title: "Point Zoom or Teams at that output",
    body: (
      <>
        <p className="text-fg-muted">
          In the <strong className="font-medium text-fg">desktop app</strong>{" "}
          (not required for browser clients):
        </p>
        <ul className="mt-2 list-disc space-y-1.5 pl-4 text-fg-muted">
          <li>
            <strong className="font-medium text-fg">Zoom:</strong> Settings →
            Audio →{" "}
            <strong className="font-medium text-fg">Speaker</strong> → your
            Multi-Output (or BlackHole if you only need the feed, not local
            hear-through).
          </li>
          <li>
            <strong className="font-medium text-fg">Teams:</strong> Settings →
            Devices →{" "}
            <strong className="font-medium text-fg">Speaker</strong> → same
            Multi-Output device.
          </li>
          <li>
            Join a test call and confirm <em>you</em> can still hear remote
            audio through your speakers/headset.
          </li>
        </ul>
      </>
    ),
  },
  {
    title: "Capture you + them (Aggregate Device)",
    body: (
      <>
        Multi-Output alone records <em>what Zoom plays</em>. To also get{" "}
        <strong className="font-medium text-fg">your mic</strong> cleanly into
        one stream for RepoVoice:
        <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-fg-muted">
          <li>
            In Audio MIDI Setup,{" "}
            <strong className="font-medium text-fg">+</strong> →{" "}
            <strong className="font-medium text-fg">
              Create Aggregate Device
            </strong>
            .
          </li>
          <li>
            Enable:
            <ul className="mt-1 list-disc pl-4">
              <li>
                <strong className="font-medium text-fg">BlackHole 2ch</strong>{" "}
                (call / remote audio)
              </li>
              <li>
                <strong className="font-medium text-fg">
                  Built-in Microphone
                </strong>{" "}
                or your headset mic (you)
              </li>
            </ul>
          </li>
          <li>
            Rename e.g.{" "}
            <code className="rounded bg-bg px-1 py-0.5 text-[11px]">
              RepoVoice Aggregate
            </code>
            .
          </li>
          <li>
            In macOS{" "}
            <strong className="font-medium text-fg">
              System Settings → Sound → Input
            </strong>
            , select that Aggregate Device{" "}
            <em>while recording in RepoVoice</em> (browsers use the system
            default input unless a device picker is used).
          </li>
        </ol>
        <p className="mt-2 text-fg-muted">
          Clock drift between devices is rare for speech; if you hear warble on
          very long takes, prefer Loopback (paid) or record mic-only + Zoom’s
          own local recording as backup.
        </p>
      </>
    ),
  },
  {
    title: "Record in RepoVoice",
    body: (
      <>
        <ol className="list-decimal space-y-1.5 pl-4 text-fg-muted">
          <li>Select the person + Interview / Reflection as usual.</li>
          <li>
            Confirm macOS{" "}
            <strong className="font-medium text-fg">Sound → Input</strong> is{" "}
            <strong className="font-medium text-fg">
              RepoVoice Aggregate
            </strong>{" "}
            (or BlackHole if you’re only capturing the call mix).
          </li>
          <li>
            Allow microphone permission when Safari/Chrome asks — the browser
            still thinks it’s a “mic.”
          </li>
          <li>
            Watch the level meter: you should see activity when the remote
            person speaks (and when you speak, if the Aggregate includes your
            mic).
          </li>
          <li>
            Stop when done — STT + GitHub push behave like any other take.
          </li>
        </ol>
      </>
    ),
  },
  {
    title: "After the interview (restore normal audio)",
    body: (
      <>
        <ul className="list-disc space-y-1.5 pl-4 text-fg-muted">
          <li>
            System Settings → Sound →{" "}
            <strong className="font-medium text-fg">Output</strong> back to
            speakers/headphones.
          </li>
          <li>
            Zoom/Teams speaker back to your normal device (or leave Multi-Output
            if you prefer).
          </li>
          <li>
            System{" "}
            <strong className="font-medium text-fg">Input</strong> back to
            Built-in / headset so other apps aren’t stuck on BlackHole.
          </li>
        </ul>
      </>
    ),
  },
] as const;

export function DesktopAudioGuide({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);

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
              <Laptop className="size-4 shrink-0 text-fg-muted" />
              Zoom / Teams on Mac
            </CardTitle>
            <CardDescription>
              Capture desktop Zoom or Teams audio with BlackHole (browser can’t
              record those apps directly).
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
        <CardContent className="space-y-5">
          <div className="grid min-w-0 gap-2 sm:grid-cols-3">
            <div className="rounded-[var(--radius-md)] border border-border bg-bg px-3 py-2.5">
              <AppWindow className="mb-1.5 size-4 text-fg-subtle" />
              <div className="text-xs font-medium text-fg">Zoom / Teams app</div>
              <p className="mt-0.5 text-[11px] leading-snug text-fg-subtle">
                Speaker → Multi-Output (hear + BlackHole)
              </p>
            </div>
            <div className="rounded-[var(--radius-md)] border border-border bg-bg px-3 py-2.5">
              <AudioLines className="mb-1.5 size-4 text-fg-subtle" />
              <div className="text-xs font-medium text-fg">BlackHole 2ch</div>
              <p className="mt-0.5 text-[11px] leading-snug text-fg-subtle">
                Virtual cable carrying call audio
              </p>
            </div>
            <div className="rounded-[var(--radius-md)] border border-border bg-bg px-3 py-2.5">
              <Mic className="mb-1.5 size-4 text-fg-subtle" />
              <div className="text-xs font-medium text-fg">RepoVoice</div>
              <p className="mt-0.5 text-[11px] leading-snug text-fg-subtle">
                Input = Aggregate (BlackHole + your mic)
              </p>
            </div>
          </div>

          <ol className="min-w-0 space-y-4">
            {STEPS.map((step, i) => (
              <li key={step.title} className="min-w-0">
                <div className="flex gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-bg-subtle text-xs font-medium tabular text-fg-muted">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <h4 className="text-sm font-medium text-fg">{step.title}</h4>
                    <div className="text-sm leading-relaxed text-fg-muted">
                      {step.body}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>

          <div className="rounded-[var(--radius-md)] border border-border bg-bg-subtle px-3 py-3 text-sm leading-relaxed text-fg-muted">
            <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-fg-subtle">
              <CheckCircle2 className="size-3.5" />
              Checklist before Record
            </div>
            <ul className="list-disc space-y-1 pl-4">
              <li>Multi-Output selected (you can hear the call)</li>
              <li>Zoom/Teams speaker = Multi-Output</li>
              <li>macOS Input = Aggregate (BlackHole + mic)</li>
              <li>Level meter moves when remote speaks</li>
            </ul>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-xs text-fg-subtle">
            <a
              href="https://existential.audio/blackhole/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-accent hover:underline"
            >
              BlackHole download
              <ExternalLink className="size-3" />
            </a>
            <a
              href="https://github.com/ExistentialAudio/BlackHole"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-accent hover:underline"
            >
              GitHub / docs
              <ExternalLink className="size-3" />
            </a>
            <span className="inline-flex items-center gap-1">
              <Headphones className="size-3.5" />
              Prefer headphones to avoid echo into the mic
            </span>
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}
