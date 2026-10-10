import { describe, expect, it } from "vitest";
import {
  BASIC_PLAN,
  PLAN_KEYS,
  PRO_PLAN,
  PRO_SELF_SERVICE_SEAT_CAP,
  TRIAL_DURATION_MS,
  entitlementsForPlanKey,
  normalizePlanKey,
  seatLimitForSubscription,
} from "../src/saas/plans/catalog.js";
import { limitsForPlanKey } from "../src/saas/services/scan-access.js";

describe("commercial plan catalog", () => {
  it("locks Free plus two public paid plans", () => {
    expect(BASIC_PLAN.priceMonthlyEur).toBe(4.99);
    expect(PRO_PLAN.priceMonthlyEur).toBe(9.99);
    expect(BASIC_PLAN.includedSeats).toBe(1);
    expect(PRO_PLAN.includedSeats).toBe(3);
    expect(PRO_PLAN.extraSeatPriceMonthlyEur).toBe(2.49);
    expect(PRO_PLAN.maxSeatsSelfService).toBe(PRO_SELF_SERVICE_SEAT_CAP);
    expect(normalizePlanKey("free")).toBe(PLAN_KEYS.free);
  });

  it("keeps Free tighter than Basic and Basic tighter than Pro", () => {
    expect(limitsForPlanKey(PLAN_KEYS.free).maxActiveWatchProfiles).toBe(1);
    expect(limitsForPlanKey(PLAN_KEYS.free).maxDigestHoursPerDay).toBe(0);
    expect(limitsForPlanKey(PLAN_KEYS.free).emailCadence).toBe("WEEKLY");
    expect(limitsForPlanKey(PLAN_KEYS.basic).periodicScansPerDay).toBe(2);
    expect(limitsForPlanKey(PLAN_KEYS.basic).maxActiveWatchProfiles).toBe(5);
    expect(limitsForPlanKey(PLAN_KEYS.basic).maxActiveFollowedTenders).toBe(30);
    expect(limitsForPlanKey(PLAN_KEYS.pro).periodicScansPerDay).toBe(6);
    expect(limitsForPlanKey(PLAN_KEYS.trial).periodicScansPerDay).toBe(
      limitsForPlanKey(PLAN_KEYS.pro).periodicScansPerDay,
    );
    expect(BASIC_PLAN.maxActiveWatchProfiles).toBe(5);
    expect(PRO_PLAN.maxActiveWatchProfiles).toBeGreaterThan(
      BASIC_PLAN.maxActiveWatchProfiles,
    );
  });

  it("normalizes legacy plan keys", () => {
    expect(normalizePlanKey("starter_499")).toBe(PLAN_KEYS.basic);
    expect(normalizePlanKey("pro_1000")).toBe(PLAN_KEYS.pro);
    expect(entitlementsForPlanKey("starter_499").plan).toBe("BASIC");
  });

  it("caps Pro self-service seats at 20 including add-ons", () => {
    const seats = seatLimitForSubscription({
      planKey: PLAN_KEYS.pro,
      extraSeats: 50,
    });
    expect(seats.seatLimit).toBe(20);
    expect(seats.selfServiceCap).toBe(20);
  });

  it("uses a one-week trial window", () => {
    expect(TRIAL_DURATION_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
