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
export const PRO_PRICE_CENTS = 499;

/** The same figure written the way it appears in the interface. */
export const PRO_PRICE_LABEL = "$4.99/month";

export const PRO_PRODUCT_NAME = "MATMAX Pro";
export const PRO_PRODUCT_DESCRIPTION =
  "AI stock forecasts, AI news briefings and unlimited investment analysis. Cancel any time.";
