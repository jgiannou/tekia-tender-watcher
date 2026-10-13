import { describe, expect, it } from "vitest";
import { getOrgProfileProgress } from "../apps/saas-web/src/lib/org-profile";
import type { OrgSettings } from "../apps/saas-web/src/lib/api";

const baseSettings = (
  partial: Partial<OrgSettings> & {
    company?: Partial<OrgSettings["company"]>;
  },
): OrgSettings => ({
  company: {
    legalName: "",
    distinctiveTitle: null,
    afm: null,
    gemiNumber: null,
    status: null,
    gemiService: null,
    legalType: null,
    website: null,
    email: null,
    phone: null,
    incorporationDate: null,
    address: {
      street: null,
      streetNumber: null,
      zipCode: null,
      city: null,
      municipality: null,
      prefecture: null,
    },
    source: null,
    lastSyncedAt: null,
    ...partial.company,
  },
  activities: partial.activities ?? [],
  notifications: partial.notifications ?? {
    emailEnabled: true,
    recipients: [],
    digestHours: [],
    events: {
      newOpportunity: true,
      relatedActOnFollowed: true,
      postSubmissionUpdate: true,
      deadlineRadar: false,
    },
  },
  onboardingStatus: partial.onboardingStatus ?? "NOT_STARTED",
  onboardingMeta: partial.onboardingMeta ?? null,
});

describe("getOrgProfileProgress", () => {
  it("treats empty org as incomplete and resumes at company", () => {
    const progress = getOrgProfileProgress(baseSettings({}));
    expect(progress.profileComplete).toBe(false);
    expect(progress.resumeStep).toBe("company");
    expect(progress.setupPath).toBe("/app/setup");
    expect(progress.completedSteps).toBe(0);
  });

  it("resumes at activities when company exists without KADs", () => {
    const progress = getOrgProfileProgress(
      baseSettings({
        company: { legalName: "Demo AE", afm: "123456789" },
        onboardingStatus: "IN_PROGRESS",
        onboardingMeta: { step: "company" },
      }),
    );
    expect(progress.hasCompanyBasics).toBe(true);
    expect(progress.hasActivities).toBe(false);
    expect(progress.profileComplete).toBe(false);
    expect(progress.resumeStep).toBe("activities");
    expect(progress.setupPath).toBe("/app/setup?step=activities");
  });

  it("does not treat dismissed/in-progress alone as complete", () => {
    const progress = getOrgProfileProgress(
      baseSettings({
        onboardingStatus: "DISMISSED",
        onboardingMeta: { step: "done" },
      }),
    );
    expect(progress.profileComplete).toBe(false);
  });

  it("marks complete when company + activities exist", () => {
    const progress = getOrgProfileProgress(
      baseSettings({
        company: { legalName: "Demo AE" },
        activities: [
          { code: "62.01", description: "Programming", isPrimary: true },
        ],
        onboardingStatus: "IN_PROGRESS",
        onboardingMeta: { step: "interests" },
      }),
    );
    expect(progress.profileComplete).toBe(true);
    expect(progress.completedSteps).toBe(2);
    expect(progress.resumeStep).toBe("interests");
  });

  it("uses done when onboardingStatus is COMPLETED", () => {
    const progress = getOrgProfileProgress(
      baseSettings({
        company: { legalName: "Demo AE" },
        activities: [
          { code: "62.01", description: "Programming", isPrimary: true },
        ],
        onboardingStatus: "COMPLETED",
      }),
    );
    expect(progress.resumeStep).toBe("done");
    expect(progress.setupPath).toBe("/app/setup");
  });
});
