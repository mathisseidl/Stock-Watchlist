import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const FREE_DAILY_LIMIT = 3;

async function getContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("is_paid")
    .eq("id", user.id)
    .maybeSingle();

  const today = new Date().toISOString().slice(0, 10);
  const { data: usage } = await admin
    .from("analytics_usage")
    .select("count")
    .eq("user_id", user.id)
    .eq("day", today)
    .maybeSingle();

  return {
    admin,
    userId: user.id,
    isPaid: Boolean(profile?.is_paid),
    used: usage?.count ?? 0,
    today,
  };
}

export async function GET() {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    isPaid: ctx.isPaid,
    used: ctx.used,
    limit: FREE_DAILY_LIMIT,
    remaining: ctx.isPaid ? null : Math.max(0, FREE_DAILY_LIMIT - ctx.used),
  });
}

export async function POST() {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (ctx.isPaid) {
    return NextResponse.json({ allowed: true, isPaid: true, remaining: null });
  }

  if (ctx.used >= FREE_DAILY_LIMIT) {
    return NextResponse.json({ allowed: false, isPaid: false, remaining: 0 });
  }

  const nextCount = ctx.used + 1;
  await ctx.admin
    .from("analytics_usage")
    .upsert(
      { user_id: ctx.userId, day: ctx.today, count: nextCount },
      { onConflict: "user_id,day" },
    );

  return NextResponse.json({
    allowed: true,
    isPaid: false,
    remaining: Math.max(0, FREE_DAILY_LIMIT - nextCount),
  });
}
