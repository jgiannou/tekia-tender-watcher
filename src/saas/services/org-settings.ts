import type { OnboardingStatus, Prisma, PrismaClient } from "@prisma/client";
import { badRequest } from "../errors.js";
import { requireOrgMembership } from "../auth/org-context.js";
import type { CompanyRegistryRecord } from "../company-registry/types.js";
import { entitlementsForPlanKey, PLAN_KEYS } from "../plans/catalog.js";
import { defaultDigestHoursForPlanKey, normalizeDigestHours } from "./digest-hours.js";
import { assignWeeklyDigestSlot } from "./weekly-digest-schedule.js";

export type CompanyProfile = {
  legalName: string;
  distinctiveTitle: string | null;
  afm: string | null;
  gemiNumber: string | null;
  status: string | null;
  gemiService: string | null;
  legalType: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  incorporationDate: string | null;
  address: {
    street: string | null;
    streetNumber: string | null;
    zipCode: string | null;
    city: string | null;
    municipality: string | null;
    prefecture: string | null;
  };
  source: "GEMI" | "MANUAL" | null;
  lastSyncedAt: string | null;
};

export type OrganizationActivity = {
  code: string;
  description: string;
  isPrimary: boolean;
  source?: "GEMI" | "MANUAL";
};

export type NotificationPreferences = {
  emailEnabled: boolean;
  recipients: string[];
  /** Europe/Athens HH:00 slots; capped by plan maxDigestHoursPerDay (0 on Free). */
  digestHours: string[];
  /**
   * Paid plans: DIGEST (hours) or IMMEDIATE (followed / high-match per entitlements).
   * Free ignores this and uses weekly cadence.
   */
  emailDeliveryMode: "DIGEST" | "IMMEDIATE";
  /** Free weekly summary opt-in (independent of push/in-app). */
  weeklyEmailEnabled: boolean;
  /** Single verified recipient for Free weekly summary (optional override). */
  weeklyRecipient: string | null;
  /** 0=Sunday … 6=Saturday, Europe/Athens. Assigned at org create. */
  weeklyDigestWeekday: number;
  /** HH:00 Europe/Athens. */
  weeklyDigestHour: string;
  /** ISO timestamp of last successfully sent weekly digest (cursor). */
  weeklyLastSentAt: string | null;
  events: {
    newOpportunity: boolean;
    relatedActOnFollowed: boolean;
    postSubmissionUpdate: boolean;
    /** Pro-only; ignored/forced false on Basic. */
    deadlineRadar: boolean;
  };
};

export type OrgSettingsView = {
  company: CompanyProfile;
  activities: OrganizationActivity[];
  notifications: NotificationPreferences;
  onboardingStatus: OnboardingStatus;
  onboardingMeta: Record<string, unknown> | null;
};

const defaultNotifications = (
  planKey: string = PLAN_KEYS.basic,
  organizationId?: string,
): NotificationPreferences => {
  const plan = entitlementsForPlanKey(planKey);
  const weekly = assignWeeklyDigestSlot(organizationId ?? "default");
  return {
    emailEnabled: true,
    recipients: [],
    digestHours: defaultDigestHoursForPlanKey(planKey),
    emailDeliveryMode: "DIGEST",
    weeklyEmailEnabled: true,
    weeklyRecipient: null,
    weeklyDigestWeekday: weekly.weeklyDigestWeekday,
    weeklyDigestHour: weekly.weeklyDigestHour,
    weeklyLastSentAt: null,
    events: {
      newOpportunity: true,
      relatedActOnFollowed: true,
      postSubmissionUpdate: true,
      deadlineRadar: plan.deadlineRadar,
    },
  };
};

const emptyAddress = (): CompanyProfile["address"] => ({
  street: null,
  streetNumber: null,
  zipCode: null,
  city: null,
  municipality: null,
  prefecture: null,
});

export const normalizeCompanyProfile = (raw: unknown, fallbackName = ""): CompanyProfile => {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const addressRaw =
    obj.address && typeof obj.address === "object"
      ? (obj.address as Record<string, unknown>)
      : {};

  const legalName =
    (typeof obj.legalName === "string" && obj.legalName) ||
    (typeof obj.legal_name === "string" && obj.legal_name) ||
    fallbackName ||
    "";

  const distinctiveTitle =
    (typeof obj.distinctiveTitle === "string" && obj.distinctiveTitle) ||
    (typeof obj.brand_name === "string" && obj.brand_name) ||
    (typeof obj.trading_name === "string" && obj.trading_name) ||
    null;

  return {
    legalName,
    distinctiveTitle: distinctiveTitle || null,
    afm: typeof obj.afm === "string" ? obj.afm : null,
    gemiNumber:
      typeof obj.gemiNumber === "string"
        ? obj.gemiNumber
        : typeof obj.gemi_number === "string"
          ? obj.gemi_number
          : null,
    status: typeof obj.status === "string" ? obj.status : null,
    gemiService: typeof obj.gemiService === "string" ? obj.gemiService : null,
    legalType: typeof obj.legalType === "string" ? obj.legalType : null,
    website: typeof obj.website === "string" ? obj.website : null,
    email: typeof obj.email === "string" ? obj.email : null,
    phone: typeof obj.phone === "string" ? obj.phone : null,
    incorporationDate:
      typeof obj.incorporationDate === "string" ? obj.incorporationDate : null,
    address: {
      street: typeof addressRaw.street === "string" ? addressRaw.street : null,
      streetNumber:
        typeof addressRaw.streetNumber === "string" ? addressRaw.streetNumber : null,
      zipCode: typeof addressRaw.zipCode === "string" ? addressRaw.zipCode : null,
      city: typeof addressRaw.city === "string" ? addressRaw.city : null,
      municipality:
        typeof addressRaw.municipality === "string" ? addressRaw.municipality : null,
      prefecture:
        typeof addressRaw.prefecture === "string" ? addressRaw.prefecture : null,
    },
    source:
      obj.source === "GEMI" || obj.source === "MANUAL"
        ? obj.source
        : null,
    lastSyncedAt: typeof obj.lastSyncedAt === "string" ? obj.lastSyncedAt : null,
  };
};

export const normalizeActivities = (raw: unknown): OrganizationActivity[] => {
  if (!Array.isArray(raw)) return [];
  const result: OrganizationActivity[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const obj = row as Record<string, unknown>;
    const code = typeof obj.code === "string" ? obj.code.trim() : "";
    if (!code) continue;
    result.push({
      code,
      description:
        typeof obj.description === "string" && obj.description.trim()
          ? obj.description.trim()
          : code,
      isPrimary: Boolean(obj.isPrimary),
      ...(obj.source === "GEMI" || obj.source === "MANUAL"
        ? { source: obj.source }
        : {}),
    });
  }
  return result;
};

export const normalizeNotifications = (
  raw: unknown,
  planKey: string = PLAN_KEYS.basic,
  organizationId?: string,
): NotificationPreferences => {
  const plan = entitlementsForPlanKey(planKey);
  const base = defaultNotifications(planKey, organizationId);
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;
  const events =
    obj.events && typeof obj.events === "object"
      ? (obj.events as Record<string, unknown>)
      : {};
  const deadlineRadarRequested =
    typeof events.deadlineRadar === "boolean"
      ? events.deadlineRadar
      : base.events.deadlineRadar;
  const deliveryModeRaw =
    typeof obj.emailDeliveryMode === "string"
      ? obj.emailDeliveryMode.toUpperCase()
      : null;
  const emailDeliveryMode =
    deliveryModeRaw === "IMMEDIATE" &&
    (plan.immediateFollowedDevelopments || plan.immediateNewOpportunity)
      ? "IMMEDIATE"
      : "DIGEST";
  const weeklySlot =
    typeof obj.weeklyDigestWeekday === "number" &&
    Number.isInteger(obj.weeklyDigestWeekday) &&
    obj.weeklyDigestWeekday >= 0 &&
    obj.weeklyDigestWeekday <= 6 &&
    typeof obj.weeklyDigestHour === "string" &&
    /^([01]\d|2[0-3]):00$/.test(obj.weeklyDigestHour)
      ? {
          weeklyDigestWeekday: obj.weeklyDigestWeekday,
          weeklyDigestHour: obj.weeklyDigestHour,
        }
      : assignWeeklyDigestSlot(organizationId ?? "default");
  const weeklyRecipient =
    typeof obj.weeklyRecipient === "string" && obj.weeklyRecipient.includes("@")
      ? obj.weeklyRecipient.trim().toLowerCase()
      : null;
  return {
    emailEnabled:
      typeof obj.emailEnabled === "boolean" ? obj.emailEnabled : base.emailEnabled,
    recipients: Array.isArray(obj.recipients)
      ? obj.recipients.filter(
          (v): v is string => typeof v === "string" && v.includes("@"),
        )
      : base.recipients,
    digestHours: normalizeDigestHours(
      obj.digestHours,
      plan.maxDigestHoursPerDay,
      planKey,
    ),
    emailDeliveryMode,
    weeklyEmailEnabled:
      typeof obj.weeklyEmailEnabled === "boolean"
        ? obj.weeklyEmailEnabled
        : base.weeklyEmailEnabled,
    weeklyRecipient,
    weeklyDigestWeekday: weeklySlot.weeklyDigestWeekday,
    weeklyDigestHour: weeklySlot.weeklyDigestHour,
    weeklyLastSentAt:
      typeof obj.weeklyLastSentAt === "string" ? obj.weeklyLastSentAt : null,
    events: {
      newOpportunity:
        typeof events.newOpportunity === "boolean"
          ? events.newOpportunity
          : base.events.newOpportunity,
      relatedActOnFollowed:
        typeof events.relatedActOnFollowed === "boolean"
          ? events.relatedActOnFollowed
          : base.events.relatedActOnFollowed,
      postSubmissionUpdate:
        typeof events.postSubmissionUpdate === "boolean"
          ? events.postSubmissionUpdate
          : base.events.postSubmissionUpdate,
      deadlineRadar: plan.deadlineRadar ? deadlineRadarRequested : false,
    },
  };
};

const planKeyForOrganization = async (
  prisma: PrismaClient,
  organizationId: string,
): Promise<string> => {
  const subscription = await prisma.subscription.findUnique({
    where: { organizationId },
    select: { planKey: true },
  });
  return subscription?.planKey ?? PLAN_KEYS.trial;
};

const toView = (
  row: {
    company: unknown;
    activities: unknown;
    notifications: unknown;
    onboardingStatus: OnboardingStatus;
    onboardingMeta: unknown;
  },
  orgName: string,
  planKey: string,
  organizationId: string,
): OrgSettingsView => ({
  company: normalizeCompanyProfile(row.company, orgName),
  activities: normalizeActivities(row.activities),
  notifications: normalizeNotifications(
    row.notifications,
    planKey,
    organizationId,
  ),
  onboardingStatus: row.onboardingStatus,
  onboardingMeta:
    row.onboardingMeta && typeof row.onboardingMeta === "object"
      ? (row.onboardingMeta as Record<string, unknown>)
      : null,
});

const ensureSettings = async (prisma: PrismaClient, organizationId: string) => {
  const existing = await prisma.organizationSettings.findUnique({
    where: { organizationId },
    include: { organization: { select: { name: true } } },
  });
  if (existing) return existing;
  const planKey = await planKeyForOrganization(prisma, organizationId);
  return prisma.organizationSettings.create({
    data: {
      organizationId,
      company: { legalName: "", source: "MANUAL" },
      activities: [],
      notifications: defaultNotifications(planKey, organizationId),
      onboardingStatus: "NOT_STARTED",
    },
    include: { organization: { select: { name: true } } },
  });
};

const toViewForOrg = async (
  prisma: PrismaClient,
  organizationId: string,
  row: {
    company: unknown;
    activities: unknown;
    notifications: unknown;
    onboardingStatus: OnboardingStatus;
    onboardingMeta: unknown;
  },
  orgName: string,
): Promise<OrgSettingsView> => {
  const planKey = await planKeyForOrganization(prisma, organizationId);
  return toView(row, orgName, planKey, organizationId);
};

export const getOrgSettings = async (
  prisma: PrismaClient,
  input: { userId: string; organizationId: string | null },
): Promise<OrgSettingsView> => {
  const { organizationId } = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );
  const row = await ensureSettings(prisma, organizationId);
  return toViewForOrg(prisma, organizationId, row, row.organization.name);
};

export const updateCompanyProfile = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string | null;
    company: Partial<CompanyProfile>;
    confirmOverwrite?: boolean;
  },
): Promise<OrgSettingsView> => {
  const { organizationId } = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );
  const row = await ensureSettings(prisma, organizationId);
  const current = normalizeCompanyProfile(row.company, row.organization.name);
  const patch = Object.fromEntries(
    Object.entries(input.company).filter(([, value]) => value !== undefined),
  ) as Partial<CompanyProfile>;
  const next: CompanyProfile = {
    ...current,
    ...patch,
    address: {
      ...current.address,
      ...(patch.address ?? {}),
    },
    source: patch.source === undefined ? current.source : patch.source,
  };
  if (!next.legalName.trim()) throw badRequest("legal_name_required");
  if (patch.source === "MANUAL" && current.source === "GEMI") {
    next.source = "MANUAL";
  }

  const updated = await prisma.organizationSettings.update({
    where: { organizationId },
    data: { company: next as unknown as Prisma.InputJsonValue },
    include: { organization: { select: { name: true } } },
  });

  if (next.legalName !== row.organization.name) {
    await prisma.organization.update({
      where: { id: organizationId },
      data: { name: next.legalName },
    });
  }

  return toViewForOrg(prisma, organizationId, updated, next.legalName);
};

export const applyGemiCompanyConfirmation = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string | null;
    company: CompanyRegistryRecord;
  },
): Promise<OrgSettingsView> => {
  const { organizationId } = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );
  const row = await ensureSettings(prisma, organizationId);
  const now = new Date().toISOString();
  const company: CompanyProfile = {
    legalName: input.company.legalName,
    distinctiveTitle: input.company.distinctiveTitle,
    afm: input.company.afm,
    gemiNumber: input.company.gemiNumber,
    status: input.company.status,
    gemiService: input.company.gemiService,
    legalType: input.company.legalType,
    website: input.company.website,
    email: input.company.email,
    phone: null,
    incorporationDate: input.company.incorporationDate,
    address: input.company.address ?? emptyAddress(),
    source: "GEMI",
    lastSyncedAt: now,
  };

  const activitiesFromGemi: OrganizationActivity[] = input.company.activities.map(
    (activity) => ({
      code: activity.code,
      description: activity.description,
      isPrimary: activity.isPrimary,
      source: "GEMI" as const,
    }),
  );

  const existingActivities = normalizeActivities(row.activities);
  const activities =
    activitiesFromGemi.length > 0 ? activitiesFromGemi : existingActivities;

  const updated = await prisma.organizationSettings.update({
    where: { organizationId },
    data: {
      company: company as unknown as Prisma.InputJsonValue,
      activities: activities as unknown as Prisma.InputJsonValue,
      onboardingStatus:
        row.onboardingStatus === "COMPLETED" || row.onboardingStatus === "DISMISSED"
          ? row.onboardingStatus
          : "IN_PROGRESS",
      onboardingMeta: { step: "activities" } satisfies Prisma.InputJsonObject,
    },
    include: { organization: { select: { name: true } } },
  });

  await prisma.organization.update({
    where: { id: organizationId },
    data: { name: company.legalName },
  });

  return toViewForOrg(prisma, organizationId, updated, company.legalName);
};

export const updateActivities = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string | null;
    activities: OrganizationActivity[];
  },
): Promise<OrgSettingsView> => {
  const { organizationId } = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );
  await ensureSettings(prisma, organizationId);
  const activities = normalizeActivities(input.activities);
  if (activities.length > 0 && !activities.some((a) => a.isPrimary)) {
    activities[0]!.isPrimary = true;
  }
  const updated = await prisma.organizationSettings.update({
    where: { organizationId },
    data: { activities: activities as unknown as Prisma.InputJsonValue },
    include: { organization: { select: { name: true } } },
  });
  return toViewForOrg(prisma, organizationId, updated, updated.organization.name);
};

export const updateNotifications = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string | null;
    notifications: NotificationPreferences;
  },
): Promise<OrgSettingsView> => {
  const { organizationId } = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );
  await ensureSettings(prisma, organizationId);
  const planKey = await planKeyForOrganization(prisma, organizationId);
  const plan = entitlementsForPlanKey(planKey);
  const notifications = normalizeNotifications(
    input.notifications,
    planKey,
    organizationId,
  );
  if (plan.emailCadence === "DIGEST_HOURS" && !notifications.digestHours.length) {
    throw badRequest("digest_hours_required");
  }
  const updated = await prisma.organizationSettings.update({
    where: { organizationId },
    data: { notifications: notifications as unknown as Prisma.InputJsonValue },
    include: { organization: { select: { name: true } } },
  });
  return toViewForOrg(prisma, organizationId, updated, updated.organization.name);
};

export const updateOnboardingStatus = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string | null;
    status: OnboardingStatus;
    step?: string;
  },
): Promise<OrgSettingsView> => {
  const { organizationId } = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );
  const row = await ensureSettings(prisma, organizationId);
  const meta: Record<string, string> = {
    ...(row.onboardingMeta &&
    typeof row.onboardingMeta === "object" &&
    !Array.isArray(row.onboardingMeta)
      ? Object.fromEntries(
          Object.entries(row.onboardingMeta as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        )
      : {}),
  };
  if (input.step) meta.step = input.step;
  if (input.status === "DISMISSED") meta.dismissedAt = new Date().toISOString();
  if (input.status === "COMPLETED") meta.completedAt = new Date().toISOString();

  const updated = await prisma.organizationSettings.update({
    where: { organizationId },
    data: {
      onboardingStatus: input.status,
      onboardingMeta: meta as Prisma.InputJsonValue,
    },
    include: { organization: { select: { name: true } } },
  });
  return toViewForOrg(prisma, organizationId, updated, updated.organization.name);
};
