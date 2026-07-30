import type { ReactNode } from "react";
import { FolderTree, Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function FolderPickerField({
  id,
  label,
  value,
  onChange,
  folders,
  loading,
  disabled,
  placeholder,
  hint,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (path: string) => void;
  folders: string[];
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  hint?: ReactNode;
  className?: string;
}) {
  const options = [...folders];
  if (value && !options.includes(value)) {
    options.unshift(value);
  }

  const selectValue =
    value && (folders.includes(value) || options.includes(value)) ? value : "";

  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <Label htmlFor={id} className="min-w-0 truncate">
          {label}
        </Label>
        {loading ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-fg-subtle">
            <Loader2 className="size-3 animate-spin" />
            Loading tree…
          </span>
        ) : folders.length > 0 ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-fg-subtle">
            <FolderTree className="size-3" />
            {folders.length} folders
          </span>
        ) : null}
      </div>

      <select
        id={`${id}-select`}
        className={cn(
          "flex h-10 w-full min-w-0 max-w-full rounded-[var(--radius-md)] border border-border bg-bg px-3 text-sm text-fg outline-none",
          "focus-visible:border-border-strong focus-visible:ring-2 focus-visible:ring-ring/30",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
        value={selectValue}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || (!folders.length && !value)}
        aria-label={`${label} from repository tree`}
      >
        <option value="">
          {folders.length
            ? "Select a folder from the repo…"
            : disabled
              ? "Connect GitHub to browse folders"
              : "Load repo tree to select…"}
        </option>
        {options.map((path) => (
          <option key={path} value={path}>
            {path}/
          </option>
        ))}
      </select>

      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        aria-label={`${label} path (manual)`}
      />
      {hint ? (
        <p className="text-xs text-fg-subtle leading-relaxed break-anywhere">
          {hint}
        </p>
      ) : (
        <p className="text-xs text-fg-subtle leading-relaxed">
          Pick from the tree or type a path (folder may not exist yet — first
          push will create it).
        </p>
      )}
    </div>
  );
}
