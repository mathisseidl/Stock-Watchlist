"use client";

import { useState } from "react";
import { sourceLogoUrl } from "@/lib/market-data/news-sources";

/**
 * The outlet's favicon, sitting inline in a source pill. Decorative — the
 * name is already the text right next to it — so it disappears rather than
 * showing a broken-image icon when the source isn't in the logo list or the
 * favicon fails to load.
 */
export function SourceLogo({ source }: { source: string }) {
  const [failed, setFailed] = useState(false);
  const url = sourceLogoUrl(source);
  if (!url || failed) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      className="size-3.5 shrink-0 rounded-[3px]"
      onError={() => setFailed(true)}
    />
  );
}
