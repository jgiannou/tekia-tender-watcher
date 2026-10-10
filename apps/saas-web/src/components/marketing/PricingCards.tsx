import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MARKETING_PLANS,
  TRIAL_DAYS,
  priceWithTaxHint,
  type MarketingPlanKey,
} from "@/marketing/pricing";
import { cn } from "@/lib/utils";

type PricingCardsProps = {
  mode: "teaser" | "full";
  className?: string;
};

export const PricingCards = ({ mode, className }: PricingCardsProps) => {
  const keys: MarketingPlanKey[] = ["free", "basic", "pro"];

  return (
    <div
      className={cn(
        "grid gap-4 md:grid-cols-3 md:items-stretch",
        className,
      )}
    >
      {keys.map((key) => {
        const plan = MARKETING_PLANS[key];
        const featured = key === "pro";
        const bullets = mode === "teaser" ? plan.teaserBullets : plan.fullBullets;
        const includesLabel = plan.includesLabel;

        return (
          <article
            key={key}
            className={cn(
              "relative flex flex-col rounded-xl border border-border/80 bg-card/70 p-5 sm:p-6",
              featured && "border-primary/40 shadow-lg shadow-primary/10",
            )}
          >
            {"badge" in plan && plan.badge ? (
              <span className="absolute right-4 top-4 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                {plan.badge}
              </span>
            ) : null}
            <h3 className="text-lg font-semibold tracking-tight">{plan.name}</h3>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
              {priceWithTaxHint(plan.priceMonthlyEur)}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {mode === "teaser" ? plan.shortPositioningEl : plan.positioningEl}
            </p>
            <ul className="mt-5 flex-1 space-y-2.5">
              {includesLabel ? (
                <li className="flex gap-2 border-b border-border/60 pb-3 text-sm font-medium text-foreground">
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                    aria-hidden
                  />
                  <span>{includesLabel}</span>
                </li>
              ) : null}
              {bullets.map((item) => (
                <li key={item} className="flex gap-2 text-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <Button asChild className="mt-6 w-full" variant={featured ? "default" : "outline"}>
              <Link
                to={
                  key === "pro"
                    ? "/signup?next=/app/subscription"
                    : key === "basic"
                      ? "/signup?next=/app/subscription"
                      : "/signup"
                }
              >
                {key === "free"
                  ? "Ξεκινήστε δωρεάν"
                  : mode === "teaser"
                    ? "Ξεκινήστε δωρεάν"
                    : key === "pro"
                      ? `Δοκιμάστε το Pro για ${TRIAL_DAYS} ημέρες`
                      : "Επιλέξτε Basic"}
              </Link>
            </Button>
          </article>
        );
      })}
    </div>
  );
};
