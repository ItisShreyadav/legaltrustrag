"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/*
 * next-themes injects an inline script that sets the theme class before first
 * paint. It only runs from the server HTML; on the client the script is marked
 * as a data block so React does not warn about rendering a <script> tag.
 */
const SCRIPT_PROPS = { type: typeof window === "undefined" ? "text/javascript" : "text/plain" };

export function ThemeProvider(props: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider scriptProps={SCRIPT_PROPS} {...props} />;
}
