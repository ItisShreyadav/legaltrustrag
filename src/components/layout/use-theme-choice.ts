"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * The stored theme choice, or undefined until hydration finishes. The server
 * cannot know the choice (it lives in localStorage), so rendering it before
 * hydration would mismatch the server HTML.
 */
export function useThemeChoice() {
  const { theme, setTheme } = useTheme();
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return { theme: hydrated ? (theme ?? "system") : undefined, setTheme };
}
