import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MARKETING_PLANS,
  marketingFullBullets,
  marketingTeaserBullets,
  priceWithTaxHint,
  type MarketingPlanKey,
} from "@/marketing/pricing";
import {
  PROMO_LAUNCH_PATH,
  useArcProLaunchAvailability,
} from "@/lib/promo-launch";
import { cn } from "@/lib/utils";

const FULL_MODE_BULLET_LIMIT = 6;

type PricingCardsProps = {
  mode: "teaser" | "full";
  className?: string;
};

export const PricingCards = ({ mode, className }: PricingCardsProps) => {
  const keys: MarketingPlanKey[] = ["free", "basic", "pro"];
  const { meta: promo } = useArcProLaunchAvailability();
  const promoOpen = Boolean(promo?.promotionActive && promo.acceptingRedemptions);

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
        const allBullets =
          mode === "teaser"
            ? marketingTeaserBullets(key)
            : marketingFullBullets(key);
        const bullets =
          mode === "full"
            ? allBullets.slice(0, FULL_MODE_BULLET_LIMIT)
            : allBullets;
        const hasMoreBullets = allBullets.length > bullets.length;
        const includesLabel = plan.includesLabel;

        return (
          <article
            key={key}
            className={cn(
              "relative flex flex-col rounded-lg border p-5",
              key === "free" && "border-border/50 bg-transparent",
              key === "basic" && "border-border/70 bg-card/60",
              featured && "border-primary/60 bg-card md:-my-2 md:p-6",
            )}
          >
            {"badge" in plan && plan.badge ? (
              <span className="absolute right-4 top-4 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                {plan.badge}
              </span>
            ) : null}
            <h3 className="text-base font-semibold tracking-tight">{plan.name}</h3>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              {key === "free"
                ? "0 €"
                : mode === "full"
                  ? `${priceWithTaxHint(plan.priceMonthlyEur).replace(" / μήνα", "")} / μήνα`
                  : priceWithTaxHint(plan.priceMonthlyEur)}
            </p>
            {key !== "free" && mode === "full" ? (
              <p className="mt-1 text-sm text-muted-foreground">
                ή {plan.priceYearlyEur} € / έτος
              </p>
            ) : null}
            <p className="mt-2 text-sm text-muted-foreground">
              {mode === "teaser" ? plan.shortPositioningEl : plan.positioningEl}
            </p>
            <ul className="mt-4 flex-1 space-y-2">
              {includesLabel ? (
                <li className="flex gap-2 border-b border-border/50 pb-2.5 text-sm font-medium text-foreground">
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                    aria-hidden
                  />
                  <span>{includesLabel}</span>
                </li>
              ) : null}
              {bullets.map((item) => (
                <li key={item} className="flex gap-2 text-[13px] leading-snug text-muted-foreground">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/80" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            {hasMoreBullets ? (
              <a
                href="#comparison"
                className="mt-3 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Πλήρης σύγκριση
              </a>
            ) : null}
            {"footnoteEl" in plan && plan.footnoteEl && mode === "full" ? (
              <p className="mt-3 text-xs text-muted-foreground/80">{plan.footnoteEl}</p>
            ) : null}
            <Button asChild className="mt-5 w-full" variant={featured ? "default" : key === "free" ? "ghost" : "outline"}>
              <Link
                to={
                  key === "pro"
                    ? promoOpen
                      ? PROMO_LAUNCH_PATH
                      : "/signup?next=/app/subscription"
                    : key === "basic"
                      ? "/signup?next=/app/subscription"
                      : "/signup"
                }
                aria-label={
                  key === "pro" && promoOpen
                    ? "Δοκιμάστε το Pro δωρεάν για 30 ημέρες"
                    : plan.ctaEl
                }
              >
                {key === "pro" && promoOpen
                  ? "Δοκιμάστε το Pro δωρεάν για 30 ημέρες"
                  : plan.ctaEl}
              </Link>
            </Button>
          </article>
        );
      })}
    </div>
  );
};
