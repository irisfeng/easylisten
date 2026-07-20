"use client";

import { cn } from "@/lib/utils";

export type VoiceGender = "f" | "m";
export type ListeningLanguage = "zh" | "en";

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

export function LanguageSwitch({
  value,
  onChange,
  className,
}: {
  value: ListeningLanguage;
  onChange: (value: ListeningLanguage) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="选择听稿语言"
      className={cn(
        "inline-grid grid-cols-2 rounded-full border border-line bg-surface/80 p-1",
        className,
      )}
    >
      {(["zh", "en"] as const).map((language) => {
        const active = value === language;
        return (
          <button
            key={language}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(language)}
            className={cn(
              "min-h-9 min-w-16 rounded-full px-3 text-xs transition-colors active:scale-[0.98]",
              active
                ? "bg-ink text-surface"
                : "text-ink-soft hover:bg-ink/[0.04] hover:text-ink",
            )}
          >
            {language === "zh" ? "中文" : "English"}
          </button>
        );
      })}
    </div>
  );
}
