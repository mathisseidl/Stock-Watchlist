"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { containsProfanity } from "@/lib/profanity";

export function AuthForm({
  mode,
  subtitle,
}: {
  mode: "login" | "signup";
  subtitle?: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isSignup = mode === "signup";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isSignup) {
        if (containsProfanity(username)) {
          throw new Error("Pick a username without slurs or swear words.");
        }
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, username }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? "Could not create account.");
        }
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) throw new Error(signInError.message);

      // New sign-ups land on Account to pick Free vs. the paid plan; returning
      // sign-ins go straight into the app.
      router.push(isSignup ? "/account" : "/my-stock");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
    }
  }

  const subtitleText =
    subtitle ??
    (isSignup
      ? "Start tracking and analyzing your stocks with MATMAX Stock."
      : "Sign in to your MATMAX Stock watchlist.");

  return (
    <Card className="w-full max-w-sm gap-5 p-8">
      <div className="flex flex-col items-center gap-2">
        <div className="flex size-11 items-center justify-center rounded-full bg-neutral-900 text-sm font-bold text-white">
          MS
        </div>
        <h1 className="text-xl font-semibold">
          {isSignup ? "Create your account" : "Welcome back"}
        </h1>
        {/* An empty subtitle drops the line entirely, for callers whose
            surrounding page already says why you would sign up. */}
        {subtitleText && (
          <p className="text-sm text-muted-foreground">{subtitleText}</p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Email</label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Password</label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
        </div>
        {isSignup && (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Username</label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoCapitalize="none"
              required
            />
            <p className="text-xs text-muted-foreground">
              The name friends can find you with.
            </p>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" className="rounded-full" disabled={loading}>
          {loading
            ? "Please wait…"
            : isSignup
              ? "Create account"
              : "Sign in"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {isSignup ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-primary">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New to MATMAX Stock?{" "}
            <Link href="/signup" className="font-medium text-primary">
              Create an account
            </Link>
          </>
        )}
      </p>
    </Card>
  );
}
