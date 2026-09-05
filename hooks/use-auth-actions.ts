"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  signIn as signInAction,
  signOut as signOutAction,
} from "@/lib/actions/auth";

/**
 * The QueryClient is created in the root layout, so it survives the navigation
 * that signing in or out performs — and with it the cached ["subscription"]
 * answer belonging to the previous session. That is why a Pro user who had just
 * signed in kept seeing the free tier until they reloaded by hand. Wipe the
 * cache once the session has actually changed, so the next render refetches
 * under the new cookie.
 */
export function useAuthActions() {
  const queryClient = useQueryClient();

  return {
    async signIn(email: string, password: string, next: string) {
      const result = await signInAction(email, password, next);
      if (result?.error) return result;
      queryClient.clear();
      return result;
    },
    async signOut(scope?: "local" | "global") {
      await signOutAction(scope);
      queryClient.clear();
    },
  };
}
