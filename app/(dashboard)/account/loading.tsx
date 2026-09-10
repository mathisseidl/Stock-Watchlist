import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Account is the one dashboard page rendered on the server, so unlike the
 * others it cannot draw until Supabase — and sometimes Stripe — have answered.
 * Without this the browser sat on the previous page with no sign anything had
 * happened. This puts the shape of the page up immediately and lets the real
 * content stream into it.
 *
 * Deliberately shaped like the signed-in view: a header, the profile strip,
 * and the two plan columns. A guest sees the sign-up form arrive in its place,
 * which is a fair enough swap for the moment it lasts.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>

      {/* Profile */}
      <Card className="gap-4 p-6">
        <div className="flex flex-wrap items-center gap-4">
          <Skeleton className="size-14 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-5 w-56 max-w-full" />
            <Skeleton className="h-4 w-40 max-w-full" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      </Card>

      {/* Plans */}
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-24" />
        <div className="grid gap-6 md:grid-cols-2">
          {[0, 1].map((column) => (
            <Card key={column} className="gap-5 p-6">
              <div className="flex flex-col gap-2">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-9 w-32" />
              </div>
              <div className="flex flex-col gap-2.5">
                {[0, 1, 2, 3, 4].map((line) => (
                  <Skeleton key={line} className="h-4 w-full" />
                ))}
              </div>
              <Skeleton className="mt-auto h-10 w-full rounded-full" />
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
