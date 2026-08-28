/** How long one paid period of Pro lasts. */
export const PRO_TERM_MONTHS = 1;

export type ProProfile = {
  is_paid?: boolean | null;
  pro_expires_at?: string | null;
  auto_renew?: boolean | null;
  subscription_status?: string | null;
};

/**
 * Pro is a monthly subscription. Access is checked against the end of the paid
 * period rather than the flag alone, so cancelling keeps the time already paid
 * for and a lapsed card loses access the moment the period runs out.
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

/** The end of the period a payment just bought. */
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
