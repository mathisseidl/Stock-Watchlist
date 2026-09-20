import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccountSubscription } from "@/lib/subscription";

const FREE_DAILY_LIMIT = 3;

async function getContext() {
  // Goes through the same trial-aware plan check as every other Pro route
  // (see requirePro in lib/subscription.ts) — reading `is_paid` off the
  // profile directly here previously missed the free trial entirely, since
  // that column stays false for as long as no card has ever been taken.
  const account = await getAccountSubscription();
  if (!account) return null;

  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data: usage } = await admin
    .from("analytics_usage")
    .select("count")
    .eq("user_id", account.userId)
    .eq("day", today)
    .maybeSingle();

  return {
    admin,
    userId: account.userId,
    isPaid: account.isPaid,
    proExpiresAt: account.proExpiresAt,
    used: usage?.count ?? 0,
    today,
  };
}

export async function GET() {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    isPaid: ctx.isPaid,
    proExpiresAt: ctx.proExpiresAt,
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
