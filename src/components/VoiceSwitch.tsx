"use client";

import { cn } from "@/lib/utils";

export type VoiceGender = "f" | "m";

export function VoiceSwitch({
  value,
  onChange,
  className,
}: {
  value: VoiceGender;
  onChange: (value: VoiceGender) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="选择中文朗读声线"
      className={cn(
        "inline-grid grid-cols-2 rounded-full border border-line bg-surface/80 p-1",
        className,
      )}
    >
      {(["f", "m"] as const).map((gender) => {
        const active = value === gender;
        return (
          <button
            key={gender}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(gender)}
            className={cn(
              "min-h-9 min-w-14 rounded-full px-3 text-xs transition-colors active:scale-[0.98]",
              active
                ? "bg-ink text-surface"
                : "text-ink-soft hover:bg-ink/[0.04] hover:text-ink",
            )}
          >
            {gender === "f" ? "女声" : "男声"}
          </button>
        );
      })}
    </div>
  );
}
