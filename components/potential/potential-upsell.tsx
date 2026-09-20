import { Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ProUpsellCta } from "@/components/pricing/pro-upsell-cta";

export function PotentialUpsell() {
  return (
    <Card className="gap-4 border-primary/40 p-6 ring-1 ring-primary/20">
      <div className="flex items-start gap-3">
        <Lock className="mt-0.5 size-5 shrink-0 text-primary" />
        <h2 className="text-base font-semibold">
          The Weekly 6 is a Pro feature
        </h2>
      </div>

      <ProUpsellCta
        className="w-full rounded-full sm:w-auto sm:self-start"
        arrow
      />
    </Card>
  );
}
