import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Permanently deletes the signed-in user's account.
 *
 * Only ever acts on the caller's own id, taken from their verified session —
 * never from the request body — so this cannot be pointed at someone else. The
 * request must carry a literal "Delete" confirmation string.
 * Every table that references auth.users cascades on delete, so removing the
 * auth user takes the watchlist, profile, settings and usage rows with it.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // Typing the word "Delete" is the confirmation step.
  let confirmation: string | undefined;
  try {
    const body = await request.json();
    confirmation =
      typeof body?.confirm === "string" ? body.confirm : undefined;
  } catch {
    confirmation = undefined;
  }

  if (!confirmation || confirmation.trim() !== "Delete") {
    return NextResponse.json(
      { error: 'Type "Delete" exactly to confirm.' },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);

  if (error) {
    console.error("Failed to delete account", error);
    return NextResponse.json(
      { error: "Couldn't delete the account. Try again." },
      { status: 500 },
    );
  }

  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
