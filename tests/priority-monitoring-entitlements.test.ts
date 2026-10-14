import { describe, expect, it } from "vitest";
import {
  entitlementsForPlanKey,
  PLAN_KEYS,
} from "../src/saas/plans/catalog.js";

describe("priority monitoring plan entitlements", () => {
  it("Free and Basic do not get Priority Monitoring", () => {
    expect(entitlementsForPlanKey(PLAN_KEYS.free).priorityMonitoring).toBe(false);
    expect(entitlementsForPlanKey(PLAN_KEYS.basic).priorityMonitoring).toBe(false);
    expect(entitlementsForPlanKey(PLAN_KEYS.basic).immediateNewOpportunity).toBe(
      false,
    );
  });

  it("Pro and Trial get Priority Monitoring + immediate high-match", () => {
    expect(entitlementsForPlanKey(PLAN_KEYS.pro).priorityMonitoring).toBe(true);
    expect(entitlementsForPlanKey(PLAN_KEYS.trial).priorityMonitoring).toBe(true);
    expect(entitlementsForPlanKey(PLAN_KEYS.pro).immediateNewOpportunity).toBe(
      true,
    );
  });

  it("keeps prices unchanged", () => {
    expect(entitlementsForPlanKey(PLAN_KEYS.basic).priceMonthlyEur).toBe(4.99);
    expect(entitlementsForPlanKey(PLAN_KEYS.pro).priceMonthlyEur).toBe(9.99);
  });
});
