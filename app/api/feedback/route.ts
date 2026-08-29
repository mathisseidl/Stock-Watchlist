import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

const MAX_LENGTH = 2000;
const MIN_LENGTH = 3;

/** Soft throttle so the form can't be used to flood the table. */
const RECENT_WINDOW_MS = 60 * 60 * 1000;
const RECENT_LIMIT = 5;

/**
 * Stores a website-improvement idea from the signed-in user.
 *
 * The insert goes through the caller's own session, so RLS is the guard: the
 * `feedback_insert_own` policy only accepts a row whose `user_id` is the
 * authenticated user. Triage happens later with the service role.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to send an idea." },
      { status: 401 },
    );
  }

  let message: string;
  let path: string | null;
  try {
    const body = (await request.json()) as { message?: unknown; path?: unknown };
    message = typeof body.message === "string" ? body.message.trim() : "";
    path =
      typeof body.path === "string" && body.path.trim()
        ? body.path.trim().slice(0, 200)
        : null;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (message.length < MIN_LENGTH) {
    return NextResponse.json(
      { error: "Tell us a little more." },
      { status: 400 },
    );
  }
  if (message.length > MAX_LENGTH) {
    return NextResponse.json(
      { error: `Keep it under ${MAX_LENGTH} characters.` },
      { status: 400 },
    );
  }

  const since = new Date(Date.now() - RECENT_WINDOW_MS).toISOString();
  const { count } = await supabase
    .from("feedback")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", since);
  if ((count ?? 0) >= RECENT_LIMIT) {
    return NextResponse.json(
      {
        error:
          "That's a few ideas in a short time — thank you. Try again a little later.",
      },
      { status: 429 },
    );
  }

  const userAgent = (await headers()).get("user-agent");

  const { error } = await supabase.from("feedback").insert({
    user_id: user.id,
    message,
    path,
    user_agent: userAgent ? userAgent.slice(0, 400) : null,
  });

  if (error) {
    console.error("Failed to save feedback", error);
    return NextResponse.json(
      { error: "Couldn't send that just now. Try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
