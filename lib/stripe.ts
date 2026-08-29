import Stripe from "stripe";

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set in the environment.");
  }
  cached = new Stripe(key);
  return cached;
}

/** Monthly Pro price, in cents. */
export const PRO_PRICE_CENTS = 199;

/** The same figure written the way it appears in the interface. */
export const PRO_PRICE_LABEL = "$1.99/month";

/**
 * New members start on a free trial. Stripe still takes a card up front and
 * charges the first month automatically when the trial's hours run out —
 * cancelling any time before then stops that charge.
 *
 * The trial is quoted to members in hours; PRO_TRIAL_DAYS is the same span in
 * the unit Stripe's `trial_period_days` wants (168h = 7d, to the second).
 */
export const PRO_TRIAL_HOURS = 168;
export const PRO_TRIAL_DAYS = PRO_TRIAL_HOURS / 24;

export const PRO_PRODUCT_NAME = "MATMAX Stock Pro";
export const PRO_PRODUCT_DESCRIPTION =
  "AI stock forecasts, AI news briefings and unlimited investment analysis. Cancel any time.";
