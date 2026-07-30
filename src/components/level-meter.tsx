import { cn } from "@/lib/utils";

const BARS = 24;

export function LevelMeter({
  level,
  active,
  className,
}: {
  level: number;
  active: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-12 items-end justify-center gap-1",
        className,
      )}
      aria-hidden
    >
      {Array.from({ length: BARS }).map((_, i) => {
        const center = (BARS - 1) / 2;
        const dist = Math.abs(i - center) / center;
        const wave = active
          ? Math.max(0.12, level * (1 - dist * 0.55) + Math.sin(i * 0.7 + level * 8) * 0.08 * level)
          : 0.12 + (i % 3 === 0 ? 0.04 : 0);
        const height = `${Math.round(wave * 100)}%`;
        return (
          <span
            key={i}
            className={cn(
              "w-1.5 rounded-full transition-[height,background-color] duration-75",
              active ? "bg-recording" : "bg-border-strong",
            )}
            style={{ height }}
          />
        );
      })}
    </div>
  );
}
