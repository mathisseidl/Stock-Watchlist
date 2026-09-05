"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

// Matches --background in globals.css for each theme.
const THEME_COLORS = { light: "#f9fafb", dark: "#0a0c10" } as const;

/**
 * iOS Safari tints the status bar and the toolbar with <meta name="theme-color">
 * and falls back to its own grey when the page doesn't set one. next-themes runs
 * with enableSystem={false}, so the theme lives in a class on <html> and
 * prefers-color-scheme says nothing about it — a media-query theme-color would be
 * wrong for anyone whose choice disagrees with their OS. Track the resolved theme
 * instead.
 */
export function ThemeColorMeta() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    let meta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content =
      resolvedTheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;
  }, [resolvedTheme]);

  return null;
}
