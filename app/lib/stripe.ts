/**
 * Stripe client setup for LiveCaps.
 *
 * `getStripe()` lazily initialises the Stripe SDK so that missing env vars
 * throw at call time rather than at module load (which would break builds).
 * The `stripe` export is a Proxy that delegates every property access to
 * `getStripe()`, kept for ergonomic use throughout the codebase.
 *
 * `TIER_PRICE_IDS` maps subscription tiers to Stripe Price IDs set via
 * STRIPE_PRICE_PAID / STRIPE_PRICE_PRO env vars.
 */
import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-01-28.clover",
      typescript: true,
    });
  }
  return _stripe;
}

// Kept for backward compat — lazily initialized
export const stripe = new Proxy({} as Stripe, {
  get(_, prop) {
    return (getStripe() as any)[prop];
  },
});

// Map tiers to Stripe Price IDs
// Set these in your .env.local after creating products in Stripe Dashboard
export const TIER_PRICE_IDS: Record<string, string> = {
  PAID: process.env.STRIPE_PRICE_PAID || "",
  PRO: process.env.STRIPE_PRICE_PRO || "",
};
