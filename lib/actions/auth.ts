"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Signing in and out changes who the server thinks you are. Doing it in the
 * browser leaves the already-rendered Server Components holding the old
 * session: `router.refresh()` runs against the route being left, so the
 * destination is served from the client cache and shows stale UI until a
 * manual reload. Running it here and finishing with `redirect()` makes the
 * cookie change and the navigation one server round-trip.
 */

export async function signIn(
  email: string,
  password: string,
  next: string,
): Promise<{ error: string } | void> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  redirect(next);
}

export async function signOut(scope: "local" | "global" = "local") {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope });
  redirect("/my-stock");
}
