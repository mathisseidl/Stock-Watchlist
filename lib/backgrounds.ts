/**
 * Pro members can trade the flat app background for a gradient. Each preset
 * belongs to one theme — the light set only shows under Light, the dark set
 * only under Dark — and carries the one ink colour (black or white, nothing
 * else) that stays legible on top of it.
 *
 * The palettes are lifted from a set of reference screenshots: a soft sunrise,
 * an iridescent wash, a quiet haze, a bold ember, and — for dark — an aurora,
 * a nebula and a warm dusk.
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
    ink: WHITE_INK,
    inkMuted: "rgba(255, 255, 255, 0.78)",
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
];

export const BACKGROUND_STORAGE_KEY = "matmax-background";
/** next-themes writes the active theme here. */
export const THEME_STORAGE_KEY = "theme";

/** A choice per mode, so switching Light/Dark swaps the gradient with it. */
export type BackgroundChoice = { light: string | null; dark: string | null };

export const EMPTY_CHOICE: BackgroundChoice = { light: null, dark: null };

export function presetById(id: string | null | undefined): BackgroundPreset | null {
  if (!id) return null;
  return BACKGROUND_PRESETS.find((preset) => preset.id === id) ?? null;
}

export function presetsForMode(mode: BackgroundMode): BackgroundPreset[] {
  return BACKGROUND_PRESETS.filter((preset) => preset.mode === mode);
}

export function parseChoice(raw: string | null): BackgroundChoice {
  if (!raw) return EMPTY_CHOICE;
  try {
    const parsed = JSON.parse(raw) as Partial<BackgroundChoice>;
    return {
      light: presetById(parsed.light)?.id ?? null,
      dark: presetById(parsed.dark)?.id ?? null,
    };
  } catch {
    return EMPTY_CHOICE;
  }
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
 * A tiny script that paints the stored gradient before first paint, so a
 * reloaded page doesn't flash the flat background first. Pro isn't checked
 * here — the provider drops the gradient a beat later if the account isn't
 * paid — but a stale choice from a lapsed membership is the only cost.
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
var choice=JSON.parse(localStorage.getItem(${JSON.stringify(
    BACKGROUND_STORAGE_KEY,
  )})||"{}");
var theme=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})||"dark";
var id=theme==="light"?choice.light:choice.dark;
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
