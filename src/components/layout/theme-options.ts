import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";

export type ThemeChoice = "light" | "dark" | "system";

export const THEME_OPTIONS: readonly { value: ThemeChoice; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];
