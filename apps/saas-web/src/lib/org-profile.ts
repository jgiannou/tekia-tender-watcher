import type {
  CompanyProfile,
  OnboardingStatus,
  OrganizationActivity,
  OrgSettings,
} from "@/lib/api";

export type SetupResumeStep =
  | "company"
  | "activities"
  | "interests"
  | "watch"
  | "done";

export type OrgProfileProgress = {
  hasCompanyBasics: boolean;
  hasActivities: boolean;
  /** Company + activities — enough for business-profile matching inputs. */
  profileComplete: boolean;
  completedSteps: number;
  totalSteps: number;
  resumeStep: SetupResumeStep;
  setupPath: string;
};

const hasCompanyBasics = (company: CompanyProfile | null | undefined): boolean => {
  if (!company) return false;
  return Boolean(company.legalName?.trim() || company.afm?.trim());
};

const hasActivities = (
  activities: OrganizationActivity[] | null | undefined,
): boolean =>
  Array.isArray(activities) &&
  activities.some((row) => Boolean(String(row.code ?? "").trim()));

const isSetupStep = (value: unknown): value is SetupResumeStep =>
  value === "company" ||
  value === "activities" ||
  value === "interests" ||
  value === "watch" ||
  value === "done";

/**
 * Derive profile completeness from persisted org data — not dismiss / wizard flags alone.
 */
export const getOrgProfileProgress = (
  settings: Pick<
    OrgSettings,
    "company" | "activities" | "onboardingStatus" | "onboardingMeta"
  > | null,
): OrgProfileProgress => {
  const companyOk = hasCompanyBasics(settings?.company);
  const activitiesOk = hasActivities(settings?.activities);
  const profileComplete = companyOk && activitiesOk;

  let resumeStep: SetupResumeStep = "company";
  if (!companyOk) {
    resumeStep = "company";
  } else if (!activitiesOk) {
    resumeStep = "activities";
  } else if (settings?.onboardingStatus === "COMPLETED") {
    resumeStep = "done";
  } else {
    const metaStep = settings?.onboardingMeta?.step;
    resumeStep = isSetupStep(metaStep) && metaStep !== "done" ? metaStep : "interests";
  }

  const completedSteps = (companyOk ? 1 : 0) + (activitiesOk ? 1 : 0);
  const setupPath =
    resumeStep === "company" || resumeStep === "done"
      ? "/app/setup"
      : `/app/setup?step=${resumeStep}`;

  return {
    hasCompanyBasics: companyOk,
    hasActivities: activitiesOk,
    profileComplete,
    completedSteps,
    totalSteps: 2,
    resumeStep,
    setupPath,
  };
};

export const canEditOrganizationProfile = (
  role: "OWNER" | "ADMIN" | "MEMBER" | null | undefined,
): boolean => role === "OWNER" || role === "ADMIN" || role === "MEMBER";

export const PROFILE_BANNER_DISMISS_PREFIX = "arc.profileBanner.dismissed.";

export const profileBannerDismissKey = (
  userId: string,
  organizationId: string,
): string => `${PROFILE_BANNER_DISMISS_PREFIX}${userId}:${organizationId}`;

export const readProfileBannerDismissed = (key: string): boolean => {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};

export const writeProfileBannerDismissed = (key: string): void => {
  try {
    sessionStorage.setItem(key, "1");
  } catch {
    // ignore quota / private mode
  }
};

export type OnboardingStatusLabel = OnboardingStatus;
