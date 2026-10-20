"use client";

import { THEME_OPTIONS } from "@/components/layout/theme-options";
import { useThemeChoice } from "@/components/layout/use-theme-choice";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/** Light / Dark / System as a segmented control. Nothing is selected until the stored choice is known. */
export function ThemeSelector({ "aria-labelledby": labelledBy }: { "aria-labelledby"?: string }) {
  const { theme, setTheme } = useThemeChoice();

  return (
    <ToggleGroup
      type="single"
      variant="outline"
      spacing={0}
      value={theme ?? ""}
      onValueChange={(value) => {
        // Radix reports "" when the pressed item is clicked again; keep the current choice.
        if (value) setTheme(value);
      }}
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : "Theme"}
    >
      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
        <ToggleGroupItem key={value} value={value} className="px-3">
          <Icon data-icon="inline-start" aria-hidden />
          {label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
