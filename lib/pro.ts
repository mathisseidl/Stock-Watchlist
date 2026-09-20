/** How long one paid period of Pro lasts. */
export const PRO_TERM_MONTHS = 1;

/**
 * Every new member gets Pro free for this many days, starting the moment they
 * sign up — no card, no checkout, nothing to cancel. See `isTrialActive`.
 */
export const PRO_TRIAL_DAYS = 7;

export type ProProfile = {
  is_paid?: boolean | null;
  pro_expires_at?: string | null;
  auto_renew?: boolean | null;
  subscription_status?: string | null;
  /** When the account was created — the free trial's clock starts here. */
  created_at?: string | null;
  /** A Stripe subscription means the member has already paid at least once. */
  stripe_subscription_id?: string | null;
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

/** When the free trial that started at signup runs out, or null if unknown. */
export function trialEndsAt(
  createdAt: string | null | undefined,
): Date | null {
  if (!createdAt) return null;
  const start = new Date(createdAt);
  if (Number.isNaN(start.getTime())) return null;
  const ends = new Date(start);
  ends.setDate(ends.getDate() + PRO_TRIAL_DAYS);
  return ends;
}

/**
 * On the no-card trial: never paid (no Stripe subscription, ever) and still
 * inside the window that opened at signup. Once a member has a Stripe
 * subscription, Stripe's own status — not this — decides access, so a lapsed
 * subscriber doesn't get a second trial just because their account is young.
 */
export function isTrialActive(
  profile: ProProfile | null | undefined,
  now: Date = new Date(),
): boolean {
  if (profile?.stripe_subscription_id) return false;
  const ends = trialEndsAt(profile?.created_at);
  return ends !== null && ends.getTime() > now.getTime();
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
