/**
 * A member's own logo: a short piece of text on a coloured tile.
 *
 * Three small values rather than an uploaded image, which means there is no
 * file to host, resize, or moderate, and a logo can never blow up a layout
 * or leak someone's photo into the community page.
 *
 * Shared by the designer, the API route that validates a save, and every
 * place a logo is drawn, so all three agree on what a valid logo is.
 */

export type LogoShape = "circle" | "rounded" | "square";

export type UserLogo = {
  /** Initials or a single emoji. 1–4 characters. */
  text: string;
  /** Tile background as `#rrggbb`. */
  color: string;
  shape: LogoShape;
};

export const LOGO_SHAPES: readonly LogoShape[] = [
  "circle",
  "rounded",
  "square",
];

/**
 * The colours on offer. A fixed set rather than a free colour picker: every
 * one of these is dark enough to carry white text at the sizes a logo is
 * drawn at, which a hand-picked pale yellow would not be.
 */
export const LOGO_COLORS: readonly string[] = [
  "#1f2937", // slate
  "#4338ca", // indigo
  "#2563eb", // blue
  "#0e7490", // teal
  "#15803d", // green
  "#b45309", // amber
  "#be123c", // rose
  "#7e22ce", // purple
];

export const DEFAULT_LOGO_COLOR = LOGO_COLORS[0];
export const DEFAULT_LOGO_SHAPE: LogoShape = "circle";

/** Longest logo text. Four is enough for an emoji that carries a modifier. */
export const LOGO_TEXT_MAX = 4;

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * The logo to draw for a member, falling back to their initials when they
 * have not made one. Every display path goes through here, so a member
 * without a logo still gets a consistent tile rather than a blank gap.
 */
export function resolveLogo(
  row: {
    logo_text?: string | null;
    logo_color?: string | null;
    logo_shape?: string | null;
    username?: string | null;
  } | null,
): UserLogo {
  const fallback = initialsFrom(row?.username ?? null);
  const text = (row?.logo_text ?? "").trim();
  const color = row?.logo_color ?? "";
  const shape = row?.logo_shape ?? "";

  return {
    text: text ? text.slice(0, LOGO_TEXT_MAX) : fallback,
    color: HEX_RE.test(color) ? color : DEFAULT_LOGO_COLOR,
    shape: LOGO_SHAPES.includes(shape as LogoShape)
      ? (shape as LogoShape)
      : DEFAULT_LOGO_SHAPE,
  };
}

/** Up to two letters from a username, for a member who hasn't set a logo. */
export function initialsFrom(username: string | null): string {
  const cleaned = (username ?? "").replace(/[^a-zA-Z0-9]/g, "");
  if (!cleaned) return "?";
  return cleaned.slice(0, 2).toUpperCase();
}

/**
 * Validates a logo a client asked to save, returning the value to store or
 * an error to show. Runs on the server, because the database's own checks
 * would otherwise reject a bad value with an error no reader could act on.
 */
export function parseLogo(
  input: unknown,
): { ok: true; logo: UserLogo } | { ok: false; error: string } {
  const body = (input ?? {}) as Record<string, unknown>;

  // Grapheme-aware, so a flag or a skin-toned emoji counts as one character
  // rather than the several code units it is stored as.
  const raw = typeof body.text === "string" ? body.text.trim() : "";
  const graphemes = [...raw];
  if (graphemes.length === 0) {
    return { ok: false, error: "Add one or two letters, or an emoji." };
  }
  if (graphemes.length > 2 || raw.length > LOGO_TEXT_MAX) {
    return {
      ok: false,
      error: "Keep it to two characters, or a single emoji.",
    };
  }
  if (/\s/.test(raw)) {
    return { ok: false, error: "No spaces in a logo." };
  }

  const color = typeof body.color === "string" ? body.color : "";
  if (!LOGO_COLORS.includes(color)) {
    return { ok: false, error: "Pick one of the offered colours." };
  }

  const shape = typeof body.shape === "string" ? body.shape : "";
  if (!LOGO_SHAPES.includes(shape as LogoShape)) {
    return { ok: false, error: "Pick one of the offered shapes." };
  }

  return { ok: true, logo: { text: raw, color, shape: shape as LogoShape } };
}

/** Tailwind rounding for each shape. */
export const SHAPE_CLASS: Record<LogoShape, string> = {
  circle: "rounded-full",
  rounded: "rounded-xl",
  square: "rounded-none",
};
