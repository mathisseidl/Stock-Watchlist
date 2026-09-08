import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseLogo } from "@/lib/logo";

/**
 * Saves the signed-in member's logo.
 *
 * The write goes through the service role rather than the caller's session,
 * which is the opposite of how `feedback` does it, for a specific reason:
 * `profiles` grants table-level UPDATE on every column, so any RLS policy
 * letting a member update their own row would also let them set
 * `is_paid = true` and take Pro for free. Rather than open that door, the
 * update happens here — where the columns written are fixed in code, and the
 * row is pinned to the id from the verified session.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to change your logo." },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const parsed = parseLogo(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { error } = await createAdminClient()
    .from("profiles")
    .update({
      logo_text: parsed.logo.text,
      logo_color: parsed.logo.color,
      logo_shape: parsed.logo.shape,
    })
    // The id comes from the verified session, never from the request body.
    .eq("id", user.id);

  if (error) {
    console.error(`Failed to save the logo for ${user.id}`, error);
    return NextResponse.json(
      { error: "Couldn't save that just now. Try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, logo: parsed.logo });
}
