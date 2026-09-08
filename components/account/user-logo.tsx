import { SHAPE_CLASS, resolveLogo } from "@/lib/logo";
import { cn } from "@/lib/utils";

const SIZE_CLASSES = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-16 text-xl",
} as const;

/**
 * A member's logo, wherever one is shown — the account page, the community
 * search, a friend's row.
 *
 * Takes the raw profile row rather than a resolved logo so every caller can
 * hand over whatever it selected and still get a tile: `resolveLogo` fills in
 * initials and the default colour for a member who never made one.
 *
 * A server component, deliberately: none of this is interactive, and the
 * community page renders one per result.
 */
export function UserLogoBadge({
  profile,
  size = "md",
  className,
}: {
  profile: {
    logo_text?: string | null;
    logo_color?: string | null;
    logo_shape?: string | null;
    username?: string | null;
  } | null;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}) {
  const logo = resolveLogo(profile);

  return (
    <span
      aria-hidden
      // The colour is one of `LOGO_COLORS`, checked on the way into the
      // database and again by `resolveLogo` on the way out, so it is safe to
      // put straight into a style attribute.
      style={{ backgroundColor: logo.color }}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center font-semibold leading-none text-white",
        SIZE_CLASSES[size],
        SHAPE_CLASS[logo.shape],
        className,
      )}
    >
      {logo.text}
    </span>
  );
}
