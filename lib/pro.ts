/** How long one purchase of Pro lasts. */
export const PRO_TERM_MONTHS = 12;

export type ProProfile = {
  is_paid?: boolean | null;
  pro_expires_at?: string | null;
};

/**
 * Pro is a one-time purchase valid for a fixed term — there is no
 * subscription and nothing auto-renews, so access has to be checked against
 * the expiry rather than the flag alone.
 *
 * A missing expiry counts as active: those are accounts that paid before the
 * term existed, and silently revoking them would be wrong.
 */
export function isProActive(
  profile: ProProfile | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!profile?.is_paid) return false;
  if (!profile.pro_expires_at) return true;
  const expires = new Date(profile.pro_expires_at);
  if (Number.isNaN(expires.getTime())) return true;
  return expires.getTime() > now.getTime();
}

/** The expiry to stamp on a fresh purchase. */
export function proExpiryFrom(start: Date = new Date()): Date {
  const expires = new Date(start);
  expires.setMonth(expires.getMonth() + PRO_TERM_MONTHS);
  return expires;
}

/** Whole days left, floored at zero. */
export function proDaysRemaining(
  expiresAt: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!expiresAt) return null;
  const expires = new Date(expiresAt);
  if (Number.isNaN(expires.getTime())) return null;
  return Math.max(
    0,
    Math.ceil((expires.getTime() - now.getTime()) / 86_400_000),
  );
}
