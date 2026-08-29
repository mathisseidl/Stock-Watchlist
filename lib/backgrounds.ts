/**
 * The app background can be a gradient rather than the flat wash. One preset —
 * the light "Dawn" — is the default every account starts on and is free for
 * all; the rest are Pro. Each preset belongs to one theme (the light set only
 * shows under Light, the dark set only under Dark) and carries the one ink
 * colour (black or white, nothing else) that stays legible on top of it.
 *
 * The palettes are lifted from a set of reference screenshots: a soft sunrise,
 * an iridescent wash, a quiet haze, a bold ember, and — for dark — an aurora,
 * a nebula, a warm dusk, a deep tide, a garnet glow and a graphite onyx.
 */

export type BackgroundMode = "light" | "dark";

export type BackgroundPreset = {
  id: string;
  label: string;
  mode: BackgroundMode;
  /** The full-page background, painted on <body>. */
  page: string;
  /** A flat linear reduction of the same palette, for the picker swatch. */
  swatch: string;
  /** Text colour that reads on this background. Black or white only. */
  ink: string;
  /** Same ink, dimmed, for secondary text sitting on the background. */
  inkMuted: string;
  /** Usable without Pro. Exactly one preset (the default) sets this. */
  free?: boolean;
};

const BLACK_INK = "#0b0b0f";
const BLACK_INK_MUTED = "rgba(11, 11, 15, 0.62)";
const WHITE_INK = "#ffffff";
const WHITE_INK_MUTED = "rgba(255, 255, 255, 0.72)";

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  {
    id: "light-dawn",
    label: "Dawn",
    mode: "light",
    page: "linear-gradient(125deg, #fdf3e3 0%, #f0f2e6 45%, #dbeef2 100%)",
    swatch: "linear-gradient(135deg, #fdf3e3, #dbeef2)",
    ink: BLACK_INK,
    inkMuted: BLACK_INK_MUTED,
    free: true,
  },
  {
    id: "light-bloom",
    label: "Bloom",
    mode: "light",
    page: "linear-gradient(120deg, #ffd7c2 0%, #f8c8da 28%, #d9c6f2 54%, #bfe3e8 78%, #cdf0da 100%)",
    swatch: "linear-gradient(135deg, #ffd7c2, #d9c6f2, #bfe3e8)",
    ink: BLACK_INK,
    inkMuted: BLACK_INK_MUTED,
  },
  {
    id: "light-mist",
    label: "Mist",
    mode: "light",
    page: "linear-gradient(165deg, #eaece6 0%, #e9e6f2 55%, #e0e7f1 100%)",
    swatch: "linear-gradient(135deg, #eaece6, #e9e6f2)",
    ink: BLACK_INK,
    inkMuted: BLACK_INK_MUTED,
  },
  {
    id: "light-ember",
    label: "Ember",
    mode: "light",
    page: "radial-gradient(120% 120% at 50% -10%, #f2ad70 0%, #db7c44 55%, #bd5a30 100%)",
    swatch: "linear-gradient(135deg, #f2ad70, #bd5a30)",
    ink: BLACK_INK,
    inkMuted: BLACK_INK_MUTED,
  },
  {
    id: "dark-aurora",
    label: "Aurora",
    mode: "dark",
    page: "radial-gradient(120% 120% at 50% 25%, #17402c 0%, #0e211a 48%, #080808 100%)",
    swatch: "linear-gradient(135deg, #1c4a33, #080808)",
    ink: WHITE_INK,
    inkMuted: WHITE_INK_MUTED,
  },
  {
    id: "dark-nebula",
    label: "Nebula",
    mode: "dark",
    page: "radial-gradient(120% 120% at 28% 18%, #2c2152 0%, #17152a 52%, #0c0c13 100%)",
    swatch: "linear-gradient(135deg, #2c2152, #0c0c13)",
    ink: WHITE_INK,
    inkMuted: WHITE_INK_MUTED,
  },
  {
    id: "dark-dusk",
    label: "Dusk",
    mode: "dark",
    page: "radial-gradient(120% 120% at 82% 82%, #3c2519 0%, #1a1413 46%, #0c0c0e 100%)",
    swatch: "linear-gradient(135deg, #3c2519, #0c0c0e)",
    ink: WHITE_INK,
    inkMuted: WHITE_INK_MUTED,
  },
  {
    id: "dark-tide",
    label: "Tide",
    mode: "dark",
    page: "radial-gradient(120% 120% at 25% 15%, #14495e 0%, #0d2a37 50%, #070b0f 100%)",
    swatch: "linear-gradient(135deg, #1a586f, #070b0f)",
    ink: WHITE_INK,
    inkMuted: WHITE_INK_MUTED,
  },
  {
    id: "dark-garnet",
    label: "Garnet",
    mode: "dark",
    page: "radial-gradient(120% 120% at 78% 20%, #4d1a2b 0%, #2b1119 48%, #0c090b 100%)",
    swatch: "linear-gradient(135deg, #5c2033, #0c090b)",
    ink: WHITE_INK,
    inkMuted: WHITE_INK_MUTED,
  },
  {
    id: "dark-onyx",
    label: "Onyx",
    mode: "dark",
    page: "radial-gradient(120% 120% at 50% -5%, #2b2f36 0%, #191b1f 52%, #0a0b0c 100%)",
    swatch: "linear-gradient(135deg, #333840, #0a0b0c)",
    ink: WHITE_INK,
    inkMuted: WHITE_INK_MUTED,
  },
];

export const BACKGROUND_STORAGE_KEY = "matmax-background";
/** next-themes writes the active theme here. */
export const THEME_STORAGE_KEY = "theme";

/** The gradient every account starts on, free of Pro. */
export const DEFAULT_LIGHT_PRESET_ID = "light-dawn";

/** A choice per mode, so switching Light/Dark swaps the gradient with it. */
export type BackgroundChoice = { light: string | null; dark: string | null };

/**
 * A visitor who has never opened the picker: the default light gradient, and
 * nothing on dark. `null` in a *stored* choice means the opposite — the user
 * turned the gradient off on purpose — so the two must stay distinguishable.
 */
export const DEFAULT_CHOICE: BackgroundChoice = {
  light: DEFAULT_LIGHT_PRESET_ID,
  dark: null,
};

export function presetById(id: string | null | undefined): BackgroundPreset | null {
  if (!id) return null;
  return BACKGROUND_PRESETS.find((preset) => preset.id === id) ?? null;
}

export function presetsForMode(mode: BackgroundMode): BackgroundPreset[] {
  return BACKGROUND_PRESETS.filter((preset) => preset.mode === mode);
}

function readStoredMode(
  parsed: Partial<Record<BackgroundMode, unknown>>,
  mode: BackgroundMode,
): string | null {
  // Mode absent from the stored object → untouched, so keep its default.
  if (!(mode in parsed)) return DEFAULT_CHOICE[mode];
  // Present and explicitly null → the user chose "No background". Respect it.
  const value = parsed[mode];
  if (typeof value !== "string") return null;
  return presetById(value)?.id ?? null;
}

export function parseChoice(raw: string | null): BackgroundChoice {
  // No stored key at all → first visit, so the default gradient applies.
  if (!raw) return DEFAULT_CHOICE;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<BackgroundMode, unknown>>;
    return {
      light: readStoredMode(parsed, "light"),
      dark: readStoredMode(parsed, "dark"),
    };
  } catch {
    return DEFAULT_CHOICE;
  }
}

/**
 * The preset to actually paint. `null` means a flat background: either an
 * explicit "No background", or a non-Pro account whose stored gradient is
 * Pro-only and has no free fallback for this mode (i.e. dark).
 */
export function resolveGradient(
  choice: BackgroundChoice,
  mode: BackgroundMode,
  canUsePro: boolean,
): BackgroundPreset | null {
  const id = mode === "light" ? choice.light : choice.dark;
  if (id === null) return null;
  const preset = presetById(id);
  if (preset && (canUsePro || preset.free)) return preset;
  // Stored gradient is gone or out of reach — fall back to the free default.
  return mode === "light" ? presetById(DEFAULT_LIGHT_PRESET_ID) : null;
}

/**
 * Applies (or clears) the gradient on the document. Kept framework-free so the
 * pre-hydration boot script and the React provider run the exact same code.
 */
export function applyBackground(preset: BackgroundPreset | null): void {
  const root = document.documentElement;
  const body = document.body;
  if (preset) {
    root.setAttribute("data-gradient", "");
    root.style.setProperty("--gradient-ink", preset.ink);
    root.style.setProperty("--gradient-ink-muted", preset.inkMuted);
    if (body) {
      body.style.background = preset.page;
      body.style.backgroundAttachment = "fixed";
    }
  } else {
    root.removeAttribute("data-gradient");
    root.style.removeProperty("--gradient-ink");
    root.style.removeProperty("--gradient-ink-muted");
    if (body) {
      body.style.background = "";
      body.style.backgroundAttachment = "";
    }
  }
}

/**
 * A tiny script that paints the gradient before first paint, so a reloaded
 * page doesn't flash the flat background first. It mirrors parseChoice: no
 * stored key, or a stored object without this mode's key, means the default
 * gradient; an explicit null means the user turned it off.
 *
 * Pro isn't checked here — the default is free, which is the common case; a
 * lapsed member with a Pro gradient stored sees it for one frame before the
 * provider swaps in the default.
 */
export function backgroundBootScript(): string {
  const map: Record<string, Pick<BackgroundPreset, "page" | "ink" | "inkMuted">> =
    {};
  for (const preset of BACKGROUND_PRESETS) {
    map[preset.id] = {
      page: preset.page,
      ink: preset.ink,
      inkMuted: preset.inkMuted,
    };
  }
  return `(function(){try{
var raw=localStorage.getItem(${JSON.stringify(BACKGROUND_STORAGE_KEY)});
var c=raw?JSON.parse(raw):null;
var DEF=${JSON.stringify(DEFAULT_LIGHT_PRESET_ID)};
var light=c&&("light" in c)?c.light:DEF;
var dark=c&&("dark" in c)?c.dark:null;
var theme=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})||"light";
var id=theme==="dark"?dark:light;
var presets=${JSON.stringify(map)};
var p=id&&presets[id];
if(!p)return;
var r=document.documentElement;
r.setAttribute("data-gradient","");
r.style.setProperty("--gradient-ink",p.ink);
r.style.setProperty("--gradient-ink-muted",p.inkMuted);
if(document.body){document.body.style.background=p.page;document.body.style.backgroundAttachment="fixed";}
}catch(e){}})();`;
}
