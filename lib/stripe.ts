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

/** One-time unlock price for unlimited Analytics, in cents. */
export const UPGRADE_PRICE_CENTS = 499;
