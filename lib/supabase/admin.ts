import { createClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client using the service role key. Bypasses RLS, so it
 * must never be imported into client code. Used for privileged writes such as
 * marking a profile paid after a verified Stripe payment and tracking the
 * per-user analytics usage counter.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
