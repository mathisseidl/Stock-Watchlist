import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { defaultWatchlist } from "@/lib/mock-data";
import { containsProfanity } from "@/lib/profanity";

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export async function POST(request: Request) {
  const { email, password, username: rawUsername } = await request.json();
  const username = String(rawUsername ?? "").trim().toLowerCase();

  if (!email || !password || password.length < 6) {
    return NextResponse.json(
      { error: "Enter an email and a password of at least 6 characters." },
      { status: 400 },
    );
  }

  if (!USERNAME_RE.test(username)) {
    return NextResponse.json(
      {
        error:
          "Username must be 3–20 characters: lowercase letters, numbers or underscores.",
      },
      { status: 400 },
    );
  }

  if (containsProfanity(username)) {
    return NextResponse.json(
      { error: "Pick a username without slurs or swear words." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Reject a username that's already taken before creating the auth user.
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: "That username is already taken." },
      { status: 409 },
    );
  }

  // Create the user already email-confirmed (friction-free sandbox testing) and
  // stash the username in metadata so the profile trigger picks it up.
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username },
  });

  if (error || !data.user) {
    const message = error?.message ?? "Could not create account.";
    const status = message.toLowerCase().includes("already") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }

  // Seed a starter watchlist so a brand-new account isn't empty.
  await admin.from("watchlist_items").insert(
    defaultWatchlist.map((item, index) => ({
      user_id: data.user.id,
      symbol: item.symbol,
      name: item.name,
      position: index,
    })),
  );

  return NextResponse.json({ ok: true });
}
