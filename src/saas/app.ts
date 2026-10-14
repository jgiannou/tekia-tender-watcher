import { Hono } from "hono";
import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import type { PrismaClient } from "@prisma/client";
import { createSaasAuth, type SaasAuth } from "./auth/auth.js";
import { requireOrgMembership } from "./auth/org-context.js";
import { loadSaasConfig, type SaasConfig } from "./config.js";
import {
  SaasError,
  badRequest,
  kimdisUpstreamError,
  notFound,
  serviceUnavailable,
  unauthorized,
} from "./errors.js";
import { dismissTender, followTender, unfollowTender } from "./services/follow.js";
import {
  followKimdisSearchItem,
  upsertTenderFromKimdisItem,
} from "./services/upsert-tender.js";
import {
  listAttentionEvents,
  markAttentionEventRead,
  markAllAttentionEventsRead,
} from "./services/attention.js";
import {
  createOrganization,
  listUserOrganizations,
  setActiveOrganization,
} from "./services/organizations.js";
import {
  getLegalAcceptance,
  recordLegalAcceptance,
} from "./services/legal-acceptance.js";
import { deleteUserAccount } from "./services/account-deletion.js";
import { CURRENT_LEGAL_VERSIONS } from "./legal/versions.js";
import {
  acceptOrganizationInvitation,
  cancelOrganizationInvitation,
  createOrganizationInvitation,
  listOrganizationTeam,
  peekInvitationByToken,
  removeOrganizationMember,
  updateOrganizationMemberRole,
} from "./services/invitations.js";
import { recordOutreachSent } from "./services/outreach.js";
import {
  getOutreachDraft,
  saveOutreachDraft,
} from "./services/outreach-draft.js";
import { generateCompanyProfileDocument } from "./services/company-profile-doc.js";
import {
  WORKSPACE_SECTIONS,
  addWorkspaceDocuments,
  getTenderWorkspace,
  removeWorkspaceDocument,
} from "./services/workspace.js";
import {
  confirmRelatedActLink,
  dismissRelatedActLink,
} from "./services/related-acts.js";
import { listFormalSubmissions, recordFormalSubmission, confirmSubmissionResult } from "./services/submission.js";
import {
  getOrganizationTenderWorkflow,
  listMonitoringPipeline,
  startPreparation,
} from "./services/workflow.js";
import { monitorFollowedThreads } from "./jobs/monitor-followed-threads.js";
import {
  createCompanyRegistryProvider,
  type CompanyRegistryProvider,
} from "./company-registry/index.js";
import {
  applyGemiCompanyConfirmation,
  getOrgSettings,
  updateActivities,
  updateCompanyProfile,
  updateNotifications,
  updateOnboardingStatus,
} from "./services/org-settings.js";
import { getUserPreference, setMobilePushPreference, setUserTheme } from "./services/user-preferences.js";
import {
  disablePushDevice,
  upsertPushDevice,
  sendTestPushToUser,
} from "./services/push.js";
import {
  assertPlanFeature,
  getEntitlementsView,
} from "./services/entitlements.js";
import { registerBillingRoutes } from "./billing/routes.js";
import { registerPromotionRoutes } from "./billing/promotion-routes.js";
import { registerSlackIntegrationRoutes } from "./integrations/slack-routes.js";
import { registerGoogleIntegrationRoutes } from "./integrations/google-routes.js";
import { createOpsEnterHandler } from "./ops/enter.js";
import { listOpportunities, markOpportunitySeen } from "./services/opportunities.js";
import { getSharedIngestStatus } from "./jobs/shared-ingest.js";
import { loadParticipationChecklist } from "./services/participation-checklist.js";
import { loadExpiringContracts } from "./services/expiring-contracts.js";
import { loadPriceMemory } from "./services/price-memory.js";
import { resolveDiavgeiaForTender } from "./services/diavgeia.js";
import {
  fetchDiavgeiaDecisionByAda,
  getDiavgeiaAdapterStatus,
  searchDiavgeiaDecisions,
} from "./sources/diavgeia-adapter.js";
import {
  getTedAdapterStatus,
  searchTedNotices,
} from "./sources/ted-adapter.js";
import {
  followTedNotice,
  openTedNotice,
  resolveTedRecordForDetail,
} from "./services/ted-notices.js";
import { GREEK_NUTS2_REGIONS } from "./geo/nuts.js";
import {
  createWatchProfile,
  deleteWatchProfile,
  findSimilarWatchProfiles,
  getWatchProfile,
  listWatchProfiles,
  reclaimStaleWatchProfileScans,
  setWatchProfileEnabled,
  toWatchProfileDto,
  triggerWatchProfileScanForRoute,
  updateWatchProfile,
} from "./services/watch-profiles.js";
import {
  createDocumentMetadata,
  createFolder,
  deleteDocument,
  ensureVaultFolders,
  getDocumentDownload,
  getDocumentForOrg,
  listDocuments,
  listFolders,
  updateDocumentMetadata,
  uploadDocument,
  uploadNewVersion,
} from "./services/vault.js";
import { suggestWatchInterestsFromKads } from "./recommendations/kad-to-watch.js";
import { z } from "zod";
import type { KimdisClient } from "../kimdis/client.js";
import {
  buildKimdisSearchMeta,
  getKimdisRecordByAdam,
  searchKimdis,
} from "./services/kimdis-search.js";
import { loadRelatedProcFlagsByAdams } from "./services/related-proc-flags.js";
type SaasVariables = {
  userId: string;
  sessionToken: string;
  activeOrganizationId: string | null;
};

export type SaasAppDeps = {
  prisma: PrismaClient;
  config?: SaasConfig;
  auth?: SaasAuth;
  companyRegistry?: CompanyRegistryProvider;
  kimdis?: KimdisClient;
};

export const createSaasApp = (deps: SaasAppDeps) => {
  const config = deps.config ?? loadSaasConfig();
  const auth = deps.auth ?? createSaasAuth(deps.prisma, config);
  const companyRegistry =
    deps.companyRegistry ?? createCompanyRegistryProvider(config);
  const app = new Hono<{ Variables: SaasVariables }>();

  // Orphan RUNNING scans survive process restarts — reclaim immediately on boot.
  void reclaimStaleWatchProfileScans(deps.prisma, undefined, {
    forceAll: true,
  }).catch(() => null);

  // Scope to SaaS API paths only — do not intercept /admin/* OPTIONS (Ops Desk CORS).
  app.use(
    "/api/*",
    cors({
      origin: [
        ...config.SAAS_TRUSTED_ORIGINS,
        "arctenders://",
        ...(process.env.NODE_ENV === "development"
          ? ["exp://", "http://localhost:8081", "http://127.0.0.1:8081"]
          : []),
      ],
      allowHeaders: ["Content-Type", "Authorization", "X-Organization-Id", "Cookie"],
      allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      credentials: true,
    }),
  );

  app.onError((error, c) => {
    if (error instanceof SaasError) {
      return c.json(
        {
          error: error.code,
          message: error.message,
          ...(error.detail ? { detail: error.detail } : {}),
        },
        error.status as 400 | 401 | 403 | 404 | 409 | 502 | 503,
      );
    }
    console.error("saas error:", error instanceof Error ? error.message : error);
    return c.json({ error: "internal_error" }, 500);
  });

  app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

  app.get("/api/saas/ops/enter", createOpsEnterHandler(deps.prisma));

  const requireSession = createMiddleware<{ Variables: SaasVariables }>(
    async (c, next) => {
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      if (!session?.user?.id || !session.session?.token) {
        throw unauthorized();
      }
      c.set("userId", session.user.id);
      c.set("sessionToken", session.session.token);
      const dbSession = await deps.prisma.session.findUnique({
        where: { token: session.session.token },
        select: { activeOrganizationId: true },
      });
      c.set("activeOrganizationId", dbSession?.activeOrganizationId ?? null);
      await next();
    },
  );

  const resolveOrgId = (c: {
    req: { header: (name: string) => string | undefined };
    get: (key: keyof SaasVariables) => string | null;
  }): string | null =>
    c.req.header("X-Organization-Id") ?? c.get("activeOrganizationId");

  registerBillingRoutes({
    app,
    prisma: deps.prisma,
    requireSession: requireSession as never,
    resolveOrgId,
  });

  registerPromotionRoutes({
    app,
    prisma: deps.prisma,
    requireSession: requireSession as never,
    resolveOrgId,
  });

  registerSlackIntegrationRoutes({
    app,
    prisma: deps.prisma,
    requireSession: requireSession as never,
    resolveOrgId,
  });

  registerGoogleIntegrationRoutes({
    app,
    prisma: deps.prisma,
    requireSession: requireSession as never,
    resolveOrgId,
    kimdis: deps.kimdis,
  });

  app.get("/api/saas/me", requireSession, async (c) => {
    const userId = c.get("userId");
    const [memberships, user, preference, legalAcceptance] = await Promise.all([
      listUserOrganizations(deps.prisma, userId),
      deps.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          emailVerified: true,
        },
      }),
      getUserPreference(deps.prisma, userId),
      getLegalAcceptance(deps.prisma, userId),
    ]);

    // New Better Auth sessions often start with null activeOrganizationId.
    // Heal to the first membership so org-scoped APIs keep returning data.
    let activeOrganizationId = c.get("activeOrganizationId");
    const membershipIds = new Set(memberships.map((m) => m.organization.id));
    if (
      (!activeOrganizationId || !membershipIds.has(activeOrganizationId)) &&
      memberships[0]
    ) {
      activeOrganizationId = memberships[0].organization.id;
      await setActiveOrganization(deps.prisma, {
        userId,
        sessionToken: c.get("sessionToken"),
        organizationId: activeOrganizationId,
      });
      c.set("activeOrganizationId", activeOrganizationId);
    }

    return c.json({
      userId,
      user: user
        ? {
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
            emailVerified: user.emailVerified,
          }
        : null,
      theme: preference.theme,
      mobilePushEnabled: preference.mobilePushEnabled,
      gemiConfigured: companyRegistry.isConfigured(),
      emailEnabled: String(process.env.EMAIL_ENABLED || "").toLowerCase() === "true",
      activeOrganizationId,
      organizations: memberships.map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        role: m.role,
      })),
      legalAcceptance: legalAcceptance
        ? {
            termsVersion: legalAcceptance.termsVersion,
            privacyVersion: legalAcceptance.privacyVersion,
            acceptedAt: legalAcceptance.acceptedAt.toISOString(),
            source: legalAcceptance.source,
          }
        : null,
      currentLegalVersions: CURRENT_LEGAL_VERSIONS,
    });
  });

  app.post("/api/saas/me/legal-acceptance", requireSession, async (c) => {
    const body = z
      .object({
        termsVersion: z.string().min(1),
        privacyVersion: z.string().min(1),
        source: z.enum(["signup", "reaccept"]).optional(),
      })
      .parse(await c.req.json());
    const acceptance = await recordLegalAcceptance(deps.prisma, {
      userId: c.get("userId"),
      termsVersion: body.termsVersion,
      privacyVersion: body.privacyVersion,
      source: body.source ?? "signup",
      ipAddress: c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: c.req.header("user-agent") ?? null,
    });
    return c.json(
      {
        legalAcceptance: {
          termsVersion: acceptance.termsVersion,
          privacyVersion: acceptance.privacyVersion,
          acceptedAt: acceptance.acceptedAt.toISOString(),
          source: acceptance.source,
        },
      },
      201,
    );
  });

  app.patch("/api/saas/me/profile", requireSession, async (c) => {
    const body = z
      .object({
        name: z.string().min(1).max(120).optional(),
      })
      .parse(await c.req.json());
    const userId = c.get("userId");
    const user = await deps.prisma.user.update({
      where: { id: userId },
      data: {
        ...(body.name ? { name: body.name.trim() } : {}),
      },
      select: { id: true, name: true, email: true, image: true },
    });
    return c.json({ user });
  });

  app.delete("/api/saas/me", requireSession, async (c) => {
    const parsed = z
      .object({
        confirm: z.literal("DELETE"),
        password: z.string().min(1).optional(),
      })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      throw new SaasError(400, "confirm_required", "confirm_required");
    }
    const result = await deleteUserAccount(deps.prisma, {
      userId: c.get("userId"),
      confirm: parsed.data.confirm,
      password: parsed.data.password,
      requirePasswordIfCredential: true,
    });
    return c.json({ data: result });
  });

  app.get("/api/saas/me/preferences", requireSession, async (c) => {
    const preference = await getUserPreference(deps.prisma, c.get("userId"));
    return c.json({
      theme: preference.theme,
      mobilePushEnabled: preference.mobilePushEnabled,
    });
  });

  app.put("/api/saas/me/preferences", requireSession, async (c) => {
    const body = z
      .object({
        theme: z.enum(["DARK", "LIGHT", "SYSTEM"]).optional(),
        mobilePushEnabled: z.boolean().optional(),
      })
      .parse(await c.req.json());
    let preference = await getUserPreference(deps.prisma, c.get("userId"));
    if (body.theme) {
      preference = await setUserTheme(deps.prisma, {
        userId: c.get("userId"),
        theme: body.theme,
      });
    }
    if (typeof body.mobilePushEnabled === "boolean") {
      preference = await setMobilePushPreference(deps.prisma, {
        userId: c.get("userId"),
        mobilePushEnabled: body.mobilePushEnabled,
      });
    }
    return c.json({
      theme: preference.theme,
      mobilePushEnabled: preference.mobilePushEnabled,
    });
  });

  app.post("/api/saas/me/push-devices", requireSession, async (c) => {
    const body = z
      .object({
        token: z.string().min(8),
        platform: z.enum(["ios", "android", "web"]).default("ios"),
        enabled: z.boolean().optional(),
      })
      .parse(await c.req.json());
    const device = await upsertPushDevice(deps.prisma, {
      userId: c.get("userId"),
      token: body.token,
      platform: body.platform,
      enabled: body.enabled,
    });
    return c.json({ device: { id: device.id, platform: device.platform } });
  });

  app.delete("/api/saas/me/push-devices", requireSession, async (c) => {
    const body = z
      .object({ token: z.string().min(8) })
      .parse(await c.req.json());
    await disablePushDevice(deps.prisma, {
      userId: c.get("userId"),
      token: body.token,
    });
    return c.json({ ok: true });
  });

  app.post("/api/saas/me/push-test", requireSession, async (c) => {
    const result = await sendTestPushToUser(deps.prisma, c.get("userId"));
    if (result.sent === 0) {
      return c.json(
        {
          error: "no_devices",
          message:
            "Δεν υπάρχει εγγεγραμμένη συσκευή. Άνοιξε την εφαρμογή σε φυσική συσκευή με push ενεργό.",
          ...result,
        },
        404,
      );
    }
    return c.json(result);
  });

  app.get("/api/saas/settings", requireSession, async (c) => {
    const settings = await getOrgSettings(deps.prisma, {
      userId: c.get("userId"),
      organizationId: resolveOrgId(c),
    });
    return c.json({
      settings,
      gemiConfigured: companyRegistry.isConfigured(),
    });
  });

  app.patch("/api/saas/settings/company", requireSession, async (c) => {
    const body = z
      .object({
        legalName: z.string().min(1).optional(),
        distinctiveTitle: z.string().nullable().optional(),
        afm: z.string().nullable().optional(),
        gemiNumber: z.string().nullable().optional(),
        status: z.string().nullable().optional(),
        gemiService: z.string().nullable().optional(),
        legalType: z.string().nullable().optional(),
        website: z.string().nullable().optional(),
        email: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        incorporationDate: z.string().nullable().optional(),
        address: z
          .object({
            street: z.string().nullable().optional(),
            streetNumber: z.string().nullable().optional(),
            zipCode: z.string().nullable().optional(),
            city: z.string().nullable().optional(),
            municipality: z.string().nullable().optional(),
            prefecture: z.string().nullable().optional(),
          })
          .optional(),
        source: z.enum(["GEMI", "MANUAL"]).nullable().optional(),
      })
      .parse(await c.req.json());
    const settings = await updateCompanyProfile(deps.prisma, {
      userId: c.get("userId"),
      organizationId: resolveOrgId(c),
      company: {
        legalName: body.legalName,
        distinctiveTitle: body.distinctiveTitle,
        afm: body.afm,
        gemiNumber: body.gemiNumber,
        status: body.status,
        gemiService: body.gemiService,
        legalType: body.legalType,
        website: body.website,
        email: body.email,
        phone: body.phone,
        incorporationDate: body.incorporationDate,
        source: body.source,
        ...(body.address
          ? {
              address: {
                street: body.address.street ?? null,
                streetNumber: body.address.streetNumber ?? null,
                zipCode: body.address.zipCode ?? null,
                city: body.address.city ?? null,
                municipality: body.address.municipality ?? null,
                prefecture: body.address.prefecture ?? null,
              },
            }
          : {}),
      },
    });
    return c.json({ settings });
  });

  app.put("/api/saas/settings/activities", requireSession, async (c) => {
    const body = z
      .object({
        activities: z.array(
          z.object({
            code: z.string().min(1),
            description: z.string().min(1),
            isPrimary: z.boolean(),
            source: z.enum(["GEMI", "MANUAL"]).optional(),
          }),
        ),
      })
      .parse(await c.req.json());
    const settings = await updateActivities(deps.prisma, {
      userId: c.get("userId"),
      organizationId: resolveOrgId(c),
      activities: body.activities,
    });
    return c.json({
      settings,
      watchSuggestions: suggestWatchInterestsFromKads(body.activities),
    });
  });

  app.put("/api/saas/settings/notifications", requireSession, async (c) => {
    const body = z
      .object({
        emailEnabled: z.boolean(),
        recipients: z.array(z.string().email()).default([]),
        // Free weekly cadence may send an empty list; paid plans enforce min in service.
        digestHours: z.array(z.string().regex(/^([01]\d|2[0-3]):00$/)).default([]),
        emailDeliveryMode: z.enum(["DIGEST", "IMMEDIATE"]).optional(),
        weeklyEmailEnabled: z.boolean().optional(),
        weeklyRecipient: z.string().email().nullable().optional(),
        weeklyDigestWeekday: z.number().int().min(0).max(6).optional(),
        weeklyDigestHour: z
          .string()
          .regex(/^([01]\d|2[0-3]):00$/)
          .optional(),
        weeklyLastSentAt: z.string().nullable().optional(),
        events: z.object({
          newOpportunity: z.boolean(),
          relatedActOnFollowed: z.boolean(),
          postSubmissionUpdate: z.boolean(),
          deadlineRadar: z.boolean().default(false),
        }),
      })
      .parse(await c.req.json());
    const settings = await updateNotifications(deps.prisma, {
      userId: c.get("userId"),
      organizationId: resolveOrgId(c),
      notifications: body as never,
    });
    return c.json({ settings });
  });

  app.put("/api/saas/settings/onboarding", requireSession, async (c) => {
    const body = z
      .object({
        status: z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "DISMISSED"]),
        step: z.string().optional(),
      })
      .parse(await c.req.json());
    const settings = await updateOnboardingStatus(deps.prisma, {
      userId: c.get("userId"),
      organizationId: resolveOrgId(c),
      status: body.status,
      step: body.step,
    });
    return c.json({ settings });
  });

  app.get("/api/saas/gemi/status", requireSession, async (c) =>
    c.json({ configured: companyRegistry.isConfigured() }),
  );

  app.post("/api/saas/gemi/lookup", requireSession, async (c) => {
    await requireOrgMembership(
      deps.prisma,
      c.get("userId"),
      resolveOrgId(c),
    );
    const body = z
      .object({
        afm: z.string().optional(),
        gemiNumber: z.string().optional(),
      })
      .parse(await c.req.json());
    const result = await companyRegistry.lookupExact({
      afm: body.afm,
      gemiNumber: body.gemiNumber,
    });
    return c.json(result);
  });

  app.post("/api/saas/gemi/confirm", requireSession, async (c) => {
    const body = z
      .object({
        company: z.object({
          gemiNumber: z.string().min(1),
          afm: z.string().min(1),
          legalName: z.string().min(1),
          distinctiveTitle: z.string().nullable(),
          status: z.string().nullable(),
          gemiService: z.string().nullable(),
          legalType: z.string().nullable(),
          website: z.string().nullable(),
          email: z.string().nullable(),
          incorporationDate: z.string().nullable(),
          address: z.object({
            street: z.string().nullable(),
            streetNumber: z.string().nullable(),
            zipCode: z.string().nullable(),
            city: z.string().nullable(),
            municipality: z.string().nullable(),
            prefecture: z.string().nullable(),
          }),
          activities: z.array(
            z.object({
              code: z.string(),
              description: z.string(),
              isPrimary: z.boolean(),
              kadVersion: z.string().nullable().optional(),
            }),
          ),
          source: z.literal("GEMI"),
        }),
      })
      .parse(await c.req.json());
    const settings = await applyGemiCompanyConfirmation(deps.prisma, {
      userId: c.get("userId"),
      organizationId: resolveOrgId(c),
      company: body.company,
    });
    return c.json({
      settings,
      watchSuggestions: suggestWatchInterestsFromKads(settings.activities),
    });
  });

  app.get("/api/saas/gemi/activities", requireSession, async (c) => {
    await requireOrgMembership(
      deps.prisma,
      c.get("userId"),
      resolveOrgId(c),
    );
    const q = c.req.query("q") ?? "";
    if (!companyRegistry.searchActivities) {
      return c.json({ activities: [] });
    }
    const activities = await companyRegistry.searchActivities(q);
    return c.json({ activities });
  });

  app.get("/api/saas/kimdis/meta", requireSession, async (c) =>
    c.json(buildKimdisSearchMeta()),
  );

  app.post("/api/saas/kimdis/search", requireSession, async (c) => {
    if (!deps.kimdis) {
      throw serviceUnavailable("KIMDIS search is not configured");
    }
    const body = z
      .object({
        recordFamily: z.enum(["REQ", "PROC"]),
        page: z.number().int().min(0).optional(),
        pageSize: z.number().int().min(1).max(50).optional(),
        sort: z.enum(["date_desc", "date_asc"]).optional(),
        title: z.string().optional(),
        referenceNumber: z.string().optional(),
        cpv: z.string().optional(),
        organization: z.string().optional(),
        contractType: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        searchAllHistory: z.boolean().optional(),
        totalCostFrom: z.number().optional(),
        totalCostTo: z.number().optional(),
        requestKind: z
          .enum(["any", "initial", "approved", "approval"])
          .optional(),
        procedureType: z.string().optional(),
        finalSubmissionDateFrom: z.string().optional(),
        finalSubmissionDateTo: z.string().optional(),
        cancelDateFrom: z.string().optional(),
        cancelDateTo: z.string().optional(),
        signer: z.string().optional(),
        regions: z.array(z.string()).optional(),
        includeUnclassifiedRegion: z.boolean().optional(),
      })
      .parse(await c.req.json());
    const result = await searchKimdis(deps.kimdis, {
      ...body,
      enrichFromPublicUi: true,
    });
    // Stamp known REQ→PROC invitation links from our DB (no extra live crawl).
    const flags = await loadRelatedProcFlagsByAdams(
      deps.prisma,
      result.items
        .filter((item) => item.recordType === "REQ")
        .map((item) => item.adam),
    );
    return c.json({
      ...result,
      items: result.items.map((item) => {
        if (item.recordType !== "REQ") return item;
        const flag = flags.get(item.adam.toUpperCase());
        if (!flag?.invitationIssued) return item;
        return {
          ...item,
          invitationIssued: true,
          relatedProcAdam: flag.relatedProcAdam,
          relatedProcConfidence: flag.confidence,
        };
      }),
    });
  });

  app.get(
    "/api/saas/kimdis/records/:recordType/:adam",
    requireSession,
    async (c) => {
      await requireOrgMembership(
        deps.prisma,
        c.get("userId"),
        resolveOrgId(c),
      );
      const recordType = z.enum(["REQ", "PROC"]).parse(c.req.param("recordType"));
      const adam = decodeURIComponent(c.req.param("adam"));

      // TED notices use the same detail route shape as KIMDIS PROC pages.
      if (adam.startsWith("TED:")) {
        const resolved = await resolveTedRecordForDetail(deps.prisma, adam);
        if (!resolved) throw notFound("ted_record_not_found");
        return c.json({
          item: resolved.item,
          tender: {
            id: resolved.tenderId,
            referenceNumber: resolved.referenceNumber,
          },
        });
      }

      if (!deps.kimdis) {
        throw serviceUnavailable("KIMDIS search is not configured");
      }
      const item = await getKimdisRecordByAdam(
        deps.kimdis,
        { recordType, adam },
        { prisma: deps.prisma },
      );
      if (!item) throw notFound("kimdis_record_not_found");
      const tender = await upsertTenderFromKimdisItem(deps.prisma, item);
      return c.json({ item, tender: { id: tender.id, referenceNumber: tender.referenceNumber } });
    },
  );

  /** Authenticated PDF proxy — never load protected SaaS routes in bare iframes. */
  app.get(
    "/api/saas/kimdis/pdf/:recordType/:adam",
    requireSession,
    async (c) => {
      if (!deps.kimdis) {
        throw serviceUnavailable("KIMDIS search is not configured");
      }
      await requireOrgMembership(
        deps.prisma,
        c.get("userId"),
        resolveOrgId(c),
      );
      const recordType = z.enum(["REQ", "PROC"]).parse(c.req.param("recordType"));
      const adam = c.req.param("adam");
      const inline = c.req.query("inline") !== "0";
      const bytes = await deps.kimdis.downloadAttachment(recordType, adam);
      if (!bytes || bytes.length < 5) {
        throw notFound("pdf_not_found");
      }
      if (!bytes.subarray(0, 5).toString("latin1").startsWith("%PDF")) {
        throw kimdisUpstreamError("official_document_is_not_a_pdf");
      }
      const filename = encodeURIComponent(`${adam}.pdf`);
      return new Response(new Uint8Array(bytes), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${adam}.pdf"; filename*=UTF-8''${filename}`,
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "private, no-store",
        },
      });
    },
  );

  app.post("/api/saas/kimdis/follow", requireSession, async (c) => {
    const organizationId = resolveOrgId(c);
    const body = z
      .object({
        adam: z.string().min(1),
        recordType: z.enum(["REQ", "PROC"]),
        title: z.string(),
        contractingAuthority: z.string(),
        cpvs: z.array(z.string()),
        budgetWithoutVat: z.number().nullable(),
        budgetWithVat: z.number().nullable(),
        submissionDate: z.string().nullable(),
        signedDate: z.string().nullable(),
        finalSubmissionDate: z.string().nullable(),
        procedureType: z.string().nullable(),
        contractTypeLabel: z.string().nullable(),
        cancelled: z.boolean(),
        publicKimdisUrl: z.string(),
        officialPdfUrl: z.string(),
        openState: z.enum(["OPEN", "CLOSED", "CANCELLED", "UNKNOWN"]),
      })
      .parse(await c.req.json());
    const result = await followKimdisSearchItem(deps.prisma, {
      userId: c.get("userId"),
      organizationId: organizationId!,
      item: body,
    });
    return c.json(result, 201);
  });

  app.get("/api/saas/recommendations/watch", requireSession, async (c) => {
    const settings = await getOrgSettings(deps.prisma, {
      userId: c.get("userId"),
      organizationId: resolveOrgId(c),
    });
    return c.json({
      suggestions: suggestWatchInterestsFromKads(settings.activities),
    });
  });

  app.get("/api/saas/entitlements", requireSession, async (c) => {
    const view = await getEntitlementsView(deps.prisma, {
      userId: c.get("userId"),
      organizationId: resolveOrgId(c),
    });
    return c.json(view);
  });

  app.get("/api/saas/regions", requireSession, async (c) => {
    return c.json({ regions: GREEK_NUTS2_REGIONS });
  });

  app.get("/api/saas/ingest/status", requireSession, async (c) => {
    await requireOrgMembership(
      deps.prisma,
      c.get("userId"),
      resolveOrgId(c),
    );
    const status = await getSharedIngestStatus(deps.prisma);
    const age = status.ageSeconds;
    const ageLabel =
      age == null
        ? null
        : age < 60
          ? `πριν ${age}″`
          : `πριν ${Math.round(age / 60)}′`;
    const labelEl = !status.lastSuccessAt
      ? "Δεν έχει ολοκληρωθεί ακόμη έλεγχος ΚΗΜΔΗΣ"
      : status.stale
        ? `⚠ Καθυστέρηση ενημέρωσης · Τελευταίος επιτυχής έλεγχος: ${ageLabel ?? "—"}`
        : status.health === "DEGRADED"
          ? `● Ενημέρωση σε εξέλιξη · Τελευταίος επιτυχής έλεγχος: ${ageLabel ?? "—"}`
          : `● Ενημερωμένο · Τελευταίος επιτυχής έλεγχος: ${ageLabel ?? "—"}`;
    return c.json({
      lastSuccessAt: status.lastSuccessAt,
      lastError: status.lastError || null,
      lastStartedAt: status.lastStartedAt,
      fresh: status.fresh,
      stale: status.stale,
      health: status.health,
      ageSeconds: status.ageSeconds,
      labelEl,
    });
  });

  app.get("/api/saas/expiring-contracts", requireSession, async (c) => {
    const organizationId = resolveOrgId(c)!;
    const { entitlements } = await getEntitlementsView(deps.prisma, {
      userId: c.get("userId"),
      organizationId,
    });
    const list = entitlements.expiringContractList;
    const result = await loadExpiringContracts(deps.prisma, {
      organizationId,
      list,
    });
    return c.json({
      count: result.count,
      items: result.items,
      listAvailable: list,
      matchingReady: result.matchingReady,
      matchBasis: result.matchBasis,
    });
  });

  app.get("/api/saas/watch-profiles", requireSession, async (c) => {
    const profiles = await listWatchProfiles(deps.prisma, {
      userId: c.get("userId"),
      organizationId: resolveOrgId(c),
    });
    return c.json({ profiles: profiles.map(toWatchProfileDto) });
  });

  app.get("/api/saas/vault/folders", requireSession, async (c) => {
    const organizationId = resolveOrgId(c);
    const { organizationId: orgId } = await requireOrgMembership(
      deps.prisma,
      c.get("userId"),
      organizationId,
    );
    await assertPlanFeature(
      deps.prisma,
      { userId: c.get("userId"), organizationId: orgId },
      "companyVault",
    );
    await ensureVaultFolders(deps.prisma, orgId);
    const folders = await listFolders(deps.prisma, {
      userId: c.get("userId"),
      organizationId: orgId,
    });
    return c.json({ folders });
  });

  app.post("/api/saas/vault/folders", requireSession, async (c) => {
    const organizationId = resolveOrgId(c)!;
    await assertPlanFeature(
      deps.prisma,
      { userId: c.get("userId"), organizationId },
      "companyVault",
    );
    const body = z
      .object({
        name: z.string().min(1),
        parentId: z.string().nullable().optional(),
      })
      .parse(await c.req.json());
    const folder = await createFolder(deps.prisma, {
      userId: c.get("userId"),
      organizationId: resolveOrgId(c),
      name: body.name,
      parentId: body.parentId,
    });
    return c.json({ folder }, 201);
  });

  app.get("/api/saas/vault/documents", requireSession, async (c) => {
    const folderId = c.req.query("folderId") ?? undefined;
    const q = c.req.query("q") ?? undefined;
    const documents = await listDocuments(deps.prisma, {
      userId: c.get("userId"),
      organizationId: resolveOrgId(c),
      folderId: folderId || undefined,
      q: q || undefined,
    });
    return c.json({ documents });
  });

  app.get("/api/saas/vault/documents/:documentId", requireSession, async (c) => {
    const document = await getDocumentForOrg(deps.prisma, {
      userId: c.get("userId"),
      organizationId: resolveOrgId(c),
      documentId: c.req.param("documentId"),
    });
    return c.json({ document });
  });

  app.get(
    "/api/saas/vault/documents/:documentId/download",
    requireSession,
    async (c) => {
      const versionRaw = c.req.query("version");
      const version = versionRaw ? Number(versionRaw) : undefined;
      const inline = c.req.query("inline") === "1";
      const file = await getDocumentDownload(deps.prisma, {
        userId: c.get("userId"),
        organizationId: resolveOrgId(c),
        documentId: c.req.param("documentId"),
        version: Number.isFinite(version) ? version : undefined,
      });
      const disposition = inline ? "inline" : "attachment";
      return new Response(new Uint8Array(file.bytes), {
        status: 200,
        headers: {
          "Content-Type": file.mimeType,
          "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
          "Cache-Control": "private, no-store",
        },
      });
    },
  );

  app.post("/api/saas/vault/documents/upload", requireSession, async (c) => {
    const organizationId = resolveOrgId(c)!;
    await assertPlanFeature(
      deps.prisma,
      { userId: c.get("userId"), organizationId },
      "companyVault",
    );
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) throw badRequest("vault_file_required");
    const bytes = Buffer.from(await file.arrayBuffer());
    const noExpiryRaw = String(body.noExpiry ?? "true");
    const noExpiry = noExpiryRaw === "true" || noExpiryRaw === "1";
    const result = await uploadDocument(deps.prisma, {
      userId: c.get("userId"),
      organizationId: resolveOrgId(c),
      folderId: String(body.folderId ?? ""),
      name: String(body.name ?? file.name),
      originalFilename: file.name,
      bytes,
      declaredMimeType: file.type || null,
      documentType: body.documentType ? String(body.documentType) : null,
      notes: body.notes ? String(body.notes) : null,
      issueDate: body.issueDate ? new Date(String(body.issueDate)) : null,
      expiryDate:
        !noExpiry && body.expiryDate
          ? new Date(String(body.expiryDate))
          : null,
      noExpiry,
      source: "USER_UPLOAD",
    });
    return c.json(result, 201);
  });

  app.post(
    "/api/saas/vault/documents/:documentId/versions",
    requireSession,
    async (c) => {
      const body = await c.req.parseBody();
      const file = body.file;
      if (!(file instanceof File)) throw badRequest("vault_file_required");
      const bytes = Buffer.from(await file.arrayBuffer());
      const result = await uploadNewVersion(deps.prisma, {
        userId: c.get("userId"),
        organizationId: resolveOrgId(c),
        documentId: c.req.param("documentId"),
        originalFilename: file.name,
        bytes,
        declaredMimeType: file.type || null,
      });
      return c.json(result, 201);
    },
  );

  app.patch(
    "/api/saas/vault/documents/:documentId",
    requireSession,
    async (c) => {
      const body = z
        .object({
          name: z.string().min(1).optional(),
          folderId: z.string().min(1).optional(),
          documentType: z.string().nullable().optional(),
          notes: z.string().nullable().optional(),
          issueDate: z.string().datetime().nullable().optional(),
          expiryDate: z.string().datetime().nullable().optional(),
          noExpiry: z.boolean().optional(),
        })
        .parse(await c.req.json());
      const document = await updateDocumentMetadata(deps.prisma, {
        userId: c.get("userId"),
        organizationId: resolveOrgId(c),
        documentId: c.req.param("documentId"),
        name: body.name,
        folderId: body.folderId,
        documentType: body.documentType,
        notes: body.notes,
        issueDate:
          body.issueDate === undefined
            ? undefined
            : body.issueDate
              ? new Date(body.issueDate)
              : null,
        expiryDate:
          body.expiryDate === undefined
            ? undefined
            : body.expiryDate
              ? new Date(body.expiryDate)
              : null,
        noExpiry: body.noExpiry,
      });
      return c.json({ document });
    },
  );

  app.delete(
    "/api/saas/vault/documents/:documentId",
    requireSession,
    async (c) => {
      const result = await deleteDocument(deps.prisma, {
        userId: c.get("userId"),
        organizationId: resolveOrgId(c),
        documentId: c.req.param("documentId"),
      });
      return c.json(result);
    },
  );

  /** Metadata-only create (no binary) — kept for compatibility / stubs. */
  app.post("/api/saas/vault/documents", requireSession, async (c) => {
    const body = z
      .object({
        folderId: z.string().min(1),
        name: z.string().min(1),
        mimeType: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        documentType: z.string().nullable().optional(),
        issueDate: z.string().datetime().nullable().optional(),
        expiryDate: z.string().datetime().nullable().optional(),
        noExpiry: z.boolean().optional(),
        source: z
          .enum(["USER_UPLOAD", "GEMI", "GENERATED", "IMPORTED"])
          .optional(),
      })
      .parse(await c.req.json());
    const document = await createDocumentMetadata(deps.prisma, {
      userId: c.get("userId"),
      organizationId: resolveOrgId(c),
      folderId: body.folderId,
      name: body.name,
      mimeType: body.mimeType,
      notes: body.notes,
      documentType: body.documentType,
      issueDate: body.issueDate ? new Date(body.issueDate) : null,
      expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
      noExpiry: body.noExpiry,
      source: body.source,
    });
    return c.json({ document }, 201);
  });

  const watchProfileBodySchema = z.object({
    name: z.string().min(1),
    keywords: z.array(z.string()).optional(),
    negativeKeywords: z.array(z.string()).optional(),
    cpvs: z.array(z.string()).optional(),
    minBudget: z.number().nullable().optional(),
    maxBudget: z.number().nullable().optional(),
    scoreThreshold: z.number().int().optional(),
    alertScoreThreshold: z.number().int().optional(),
    enabled: z.boolean().optional(),
    recordTypes: z.array(z.enum(["REQ", "PROC"])).optional(),
    matchingMode: z.enum(["STRICT", "BALANCED", "BROAD"]).optional(),
    notificationOverride: z.enum(["INHERIT", "DISABLED", "IMMEDIATE"]).optional(),
    authority: z.string().nullable().optional(),
    contractType: z.string().nullable().optional(),
    procedureType: z.string().nullable().optional(),
    dateFrom: z.string().nullable().optional(),
    dateTo: z.string().nullable().optional(),
    regions: z.array(z.string()).optional(),
    includeUnclassifiedRegion: z.boolean().optional(),
    skipSimilarCheck: z.boolean().optional(),
    source: z.enum(["MANUAL", "SAVED_FROM_SEARCH", "SETUP_RECOMMENDATION"]).optional(),
    dataSources: z
      .array(z.enum(["kimdis", "ted", "diavgeia"]))
      .min(1)
      .optional(),
  });

  app.get("/api/saas/opportunities", requireSession, async (c) => {
    const limitRaw = c.req.query("limit");
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
    const tenderId = c.req.query("tenderId")?.trim() || undefined;
    const sortRaw = c.req.query("sort")?.trim();
    const sort =
      sortRaw === "oldest" ||
      sortRaw === "score" ||
      sortRaw === "deadline" ||
      sortRaw === "newest"
        ? sortRaw
        : "newest";
    const result = await listOpportunities(deps.prisma, {
      userId: c.get("userId"),
      organizationId: resolveOrgId(c),
      limit:
        limit != null && Number.isFinite(limit) && limit > 0
          ? Math.min(limit, 200)
          : undefined,
      tenderId,
      sort,
    });
    return c.json({
      opportunities: result.opportunities,
      total: result.total,
      unfollowed: result.unfollowed,
      unreadNewCount: result.unreadNewCount,
      sort,
    });
  });

  app.post("/api/saas/opportunities/:id/seen", requireSession, async (c) => {
    const result = await markOpportunitySeen(deps.prisma, {
      userId: c.get("userId"),
      organizationId: resolveOrgId(c),
      organizationTenderId: c.req.param("id"),
    });
    return c.json(result);
  });

  app.get("/api/saas/watch-profiles/:id", requireSession, async (c) => {
    const profile = await getWatchProfile(deps.prisma, {
      userId: c.get("userId"),
      organizationId: resolveOrgId(c),
      profileId: c.req.param("id"),
    });
    return c.json({ profile: toWatchProfileDto(profile) });
  });

  app.post("/api/saas/watch-profiles/check-similar", requireSession, async (c) => {
    const { organizationId } = await requireOrgMembership(
      deps.prisma,
      c.get("userId"),
      resolveOrgId(c),
    );
    const body = watchProfileBodySchema
      .omit({ name: true })
      .extend({ name: z.string().min(1).optional() })
      .parse(await c.req.json());
    const similar = await findSimilarWatchProfiles(deps.prisma, {
      organizationId,
      criteria: {
        name: body.name ?? "check",
        ...body,
      },
    });
    return c.json({ similar, hasSimilar: similar.length > 0 });
  });

  app.post("/api/saas/watch-profiles", requireSession, async (c) => {
    const body = watchProfileBodySchema.parse(await c.req.json());
    const profile = await createWatchProfile(deps.prisma, deps.kimdis, {
      userId: c.get("userId"),
      organizationId: resolveOrgId(c),
      ...body,
    });
    return c.json({ profile: toWatchProfileDto(profile) }, 201);
  });

  app.patch("/api/saas/watch-profiles/:id", requireSession, async (c) => {
    const body = watchProfileBodySchema.parse(await c.req.json());
    const profile = await updateWatchProfile(deps.prisma, deps.kimdis, {
      userId: c.get("userId"),
      organizationId: resolveOrgId(c),
      profileId: c.req.param("id"),
      ...body,
    });
    return c.json({ profile: toWatchProfileDto(profile) });
  });

  app.patch("/api/saas/watch-profiles/:id/enabled", requireSession, async (c) => {
    const body = z.object({ enabled: z.boolean() }).parse(await c.req.json());
    const profile = await setWatchProfileEnabled(deps.prisma, {
      userId: c.get("userId"),
      organizationId: resolveOrgId(c),
      profileId: c.req.param("id"),
      enabled: body.enabled,
    });
    return c.json({ profile: toWatchProfileDto(profile) });
  });

  app.delete("/api/saas/watch-profiles/:id", requireSession, async (c) => {
    const result = await deleteWatchProfile(deps.prisma, {
      userId: c.get("userId"),
      organizationId: resolveOrgId(c),
      profileId: c.req.param("id"),
    });
    return c.json(result);
  });

  app.post("/api/saas/watch-profiles/:id/scan", requireSession, async (c) => {
    const force =
      c.req.query("force") === "1" || c.req.query("force") === "true";
    const profile = await triggerWatchProfileScanForRoute(
      deps.prisma,
      deps.kimdis,
      {
        userId: c.get("userId"),
        organizationId: resolveOrgId(c),
        profileId: c.req.param("id"),
        force,
      },
    );
    return c.json({ profile: toWatchProfileDto(profile) });
  });

  app.post("/api/saas/organizations", requireSession, async (c) => {
    const body = z
      .object({ name: z.string().min(1), slug: z.string().optional() })
      .parse(await c.req.json());
    const organization = await createOrganization(deps.prisma, {
      userId: c.get("userId"),
      name: body.name,
      slug: body.slug,
    });
    await setActiveOrganization(deps.prisma, {
      userId: c.get("userId"),
      sessionToken: c.get("sessionToken"),
      organizationId: organization.id,
    });
    return c.json({ organization }, 201);
  });

  app.post("/api/saas/organizations/active", requireSession, async (c) => {
    const body = z
      .object({ organizationId: z.string().min(1) })
      .parse(await c.req.json());
    const result = await setActiveOrganization(deps.prisma, {
      userId: c.get("userId"),
      sessionToken: c.get("sessionToken"),
      organizationId: body.organizationId,
    });
    return c.json(result);
  });

  app.get("/api/saas/organizations/members", requireSession, async (c) => {
    const team = await listOrganizationTeam(deps.prisma, {
      userId: c.get("userId"),
      organizationId: resolveOrgId(c),
    });
    return c.json(team);
  });

  app.post("/api/saas/organizations/invitations", requireSession, async (c) => {
    const body = z
      .object({
        email: z.string().email(),
        role: z.enum(["MEMBER", "ADMIN"]).optional(),
      })
      .parse(await c.req.json());
    const result = await createOrganizationInvitation(deps.prisma, {
      userId: c.get("userId"),
      organizationId: resolveOrgId(c),
      email: body.email,
      role: body.role,
    });
    return c.json(result, 201);
  });

  app.delete(
    "/api/saas/organizations/invitations/:id",
    requireSession,
    async (c) => {
      const result = await cancelOrganizationInvitation(deps.prisma, {
        userId: c.get("userId"),
        organizationId: resolveOrgId(c),
        invitationId: c.req.param("id"),
      });
      return c.json(result);
    },
  );

  app.get("/api/saas/organizations/invitations/peek", async (c) => {
    const token = c.req.query("token")?.trim() ?? "";
    if (!token) throw badRequest("token_required");
    const invitation = await peekInvitationByToken(deps.prisma, token);
    return c.json({ invitation });
  });

  app.post(
    "/api/saas/organizations/invitations/accept",
    requireSession,
    async (c) => {
      const body = z
        .object({ token: z.string().min(1) })
        .parse(await c.req.json());
      const result = await acceptOrganizationInvitation(deps.prisma, {
        userId: c.get("userId"),
        token: body.token,
      });
      await setActiveOrganization(deps.prisma, {
        userId: c.get("userId"),
        sessionToken: c.get("sessionToken"),
        organizationId: result.organization.id,
      });
      return c.json(result);
    },
  );

  app.delete(
    "/api/saas/organizations/members/:userId",
    requireSession,
    async (c) => {
      const result = await removeOrganizationMember(deps.prisma, {
        userId: c.get("userId"),
        organizationId: resolveOrgId(c),
        memberUserId: c.req.param("userId"),
      });
      return c.json(result);
    },
  );

  app.patch(
    "/api/saas/organizations/members/:userId",
    requireSession,
    async (c) => {
      const body = z
        .object({ role: z.enum(["MEMBER", "ADMIN"]) })
        .parse(await c.req.json());
      const result = await updateOrganizationMemberRole(deps.prisma, {
        userId: c.get("userId"),
        organizationId: resolveOrgId(c),
        memberUserId: c.req.param("userId"),
        role: body.role,
      });
      return c.json({ member: result });
    },
  );

  app.get(
    "/api/saas/tenders/:tenderId/participation-checklist",
    requireSession,
    async (c) => {
      const organizationId = resolveOrgId(c)!;
      await assertPlanFeature(
        deps.prisma,
        { userId: c.get("userId"), organizationId },
        "participationChecklist",
      );
      const checklist = await loadParticipationChecklist(
        deps.prisma,
        deps.kimdis,
        {
          organizationId,
          tenderId: c.req.param("tenderId"),
        },
      );
      return c.json({ checklist });
    },
  );

  app.get(
    "/api/saas/tenders/:tenderId/price-memory",
    requireSession,
    async (c) => {
      const organizationId = resolveOrgId(c)!;
      await assertPlanFeature(
        deps.prisma,
        { userId: c.get("userId"), organizationId },
        "priceMemory",
      );
      const memory = await loadPriceMemory(
        deps.prisma,
        c.req.param("tenderId"),
      );
      return c.json({ memory });
    },
  );

  app.get(
    "/api/saas/tenders/:tenderId/diavgeia",
    requireSession,
    async (c) => {
      await requireOrgMembership(
        deps.prisma,
        c.get("userId"),
        resolveOrgId(c),
      );
      const link = await resolveDiavgeiaForTender(
        deps.prisma,
        c.req.param("tenderId"),
      );
      return c.json({ diavgeia: link });
    },
  );

  app.get("/api/saas/sources/status", requireSession, async (c) => {
    await requireOrgMembership(
      deps.prisma,
      c.get("userId"),
      resolveOrgId(c),
    );
    return c.json({
      ted: getTedAdapterStatus(),
      diavgeia: getDiavgeiaAdapterStatus(),
    });
  });

  app.get("/api/saas/sources/ted/search", requireSession, async (c) => {
    await requireOrgMembership(
      deps.prisma,
      c.get("userId"),
      resolveOrgId(c),
    );
    const q = String(c.req.query("q") || "").trim();
    const cpvRaw = String(c.req.query("cpv") || "").trim();
    const authority = String(c.req.query("authority") || "").trim();
    const dateFrom = String(c.req.query("dateFrom") || "").trim() || null;
    const dateTo = String(c.req.query("dateTo") || "").trim() || null;
    const page = Number(c.req.query("page") || "1");
    const limit = Number(c.req.query("limit") || "10");
    const result = await searchTedNotices({
      keywords: q ? q.split(/\s+/).filter(Boolean).slice(0, 8) : undefined,
      cpv: cpvRaw
        ? cpvRaw.split(/[,\s]+/).map((row) => row.trim()).filter(Boolean)
        : undefined,
      buyerName: authority || null,
      dateFrom,
      dateTo,
      page: Number.isFinite(page) ? page : 1,
      limit: Number.isFinite(limit) ? limit : 10,
    });
    return c.json(result);
  });

  const tedNoticeBodySchema = z.object({
    publicationNumber: z.string().min(1),
    title: z.string().nullable().optional(),
    buyerName: z.string().nullable().optional(),
    publicationDate: z.string().nullable().optional(),
    noticeType: z.string().nullable().optional(),
    cpvs: z.array(z.string()).optional(),
    deadline: z.string().nullable().optional(),
    estimatedValue: z.number().finite().nullable().optional(),
    currency: z.string().nullable().optional(),
    nutsCode: z.string().nullable().optional(),
    placeCity: z.string().nullable().optional(),
    contractNature: z.string().nullable().optional(),
    buyerCity: z.string().nullable().optional(),
    buyerCountry: z.string().nullable().optional(),
    noticeSubtype: z.string().nullable().optional(),
    url: z.string().url(),
    pdfUrl: z
      .union([z.string().url(), z.literal(""), z.null()])
      .optional(),
  });

  const parseTedNoticeBody = (body: unknown) => {
    const notice = tedNoticeBodySchema.safeParse(
      body && typeof body === "object" && "notice" in body
        ? (body as { notice: unknown }).notice
        : body,
    );
    if (!notice.success) throw badRequest("invalid_ted_notice");
    const pdfUrl =
      notice.data.pdfUrl && notice.data.pdfUrl.length > 0
        ? notice.data.pdfUrl
        : null;
    return {
      publicationNumber: notice.data.publicationNumber,
      title: notice.data.title ?? null,
      buyerName: notice.data.buyerName ?? null,
      publicationDate: notice.data.publicationDate ?? null,
      noticeType: notice.data.noticeType ?? null,
      cpvs: notice.data.cpvs ?? [],
      deadline: notice.data.deadline ?? null,
      estimatedValue: notice.data.estimatedValue ?? null,
      currency: notice.data.currency ?? null,
      nutsCode: notice.data.nutsCode ?? null,
      placeCity: notice.data.placeCity ?? null,
      contractNature: notice.data.contractNature ?? null,
      buyerCity: notice.data.buyerCity ?? null,
      buyerCountry: notice.data.buyerCountry ?? null,
      noticeSubtype: notice.data.noticeSubtype ?? null,
      url: notice.data.url,
      pdfUrl,
      provenance: "ted" as const,
    };
  };

  app.post("/api/saas/sources/ted/open", requireSession, async (c) => {
    await requireOrgMembership(
      deps.prisma,
      c.get("userId"),
      resolveOrgId(c),
    );
    const body = await c.req.json().catch(() => null);
    const notice = parseTedNoticeBody(body);
    const row = await openTedNotice(deps.prisma, notice);
    return c.json(row);
  });

  app.post("/api/saas/sources/ted/follow", requireSession, async (c) => {
    const organizationId = resolveOrgId(c)!;
    await requireOrgMembership(deps.prisma, c.get("userId"), organizationId);
    const body = await c.req.json().catch(() => null);
    const notice = parseTedNoticeBody(body);
    const row = await followTedNotice(deps.prisma, {
      userId: c.get("userId"),
      organizationId,
      notice,
    });
    return c.json(row);
  });

  app.get(
    "/api/saas/sources/diavgeia/decisions/:ada",
    requireSession,
    async (c) => {
      await requireOrgMembership(
        deps.prisma,
        c.get("userId"),
        resolveOrgId(c),
      );
      const status = getDiavgeiaAdapterStatus();
      if (!status.enabled) {
        return c.json({ decision: null, blocker: status.blocker });
      }
      const decision = await fetchDiavgeiaDecisionByAda(c.req.param("ada"));
      return c.json({ decision, blocker: null });
    },
  );

  app.get("/api/saas/sources/diavgeia/search", requireSession, async (c) => {
    await requireOrgMembership(
      deps.prisma,
      c.get("userId"),
      resolveOrgId(c),
    );
    const term = String(c.req.query("term") || "").trim();
    const page = Number(c.req.query("page") || "0");
    const size = Number(c.req.query("size") || "10");
    const result = await searchDiavgeiaDecisions({
      term,
      page: Number.isFinite(page) ? page : 0,
      size: Number.isFinite(size) ? size : 10,
    });
    return c.json(result);
  });

  app.post("/api/saas/tenders/:tenderId/follow", requireSession, async (c) => {
    const organizationId = resolveOrgId(c);
    const row = await followTender(deps.prisma, {
      userId: c.get("userId"),
      organizationId: organizationId!,
      tenderId: c.req.param("tenderId"),
    });
    return c.json({ organizationTender: row });
  });

  app.post("/api/saas/tenders/:tenderId/unfollow", requireSession, async (c) => {
    const organizationId = resolveOrgId(c);
    const row = await unfollowTender(deps.prisma, {
      userId: c.get("userId"),
      organizationId: organizationId!,
      tenderId: c.req.param("tenderId"),
    });
    return c.json({ organizationTender: row });
  });

  app.post("/api/saas/tenders/:tenderId/dismiss", requireSession, async (c) => {
    const organizationId = resolveOrgId(c);
    const body = await c.req
      .json()
      .then((value) =>
        z
          .object({
            reason: z.enum(["EXPIRED", "NOT_INTERESTED"]).optional(),
          })
          .parse(value ?? {}),
      )
      .catch(() => ({ reason: "EXPIRED" as const }));
    const row = await dismissTender(deps.prisma, {
      userId: c.get("userId"),
      organizationId: organizationId!,
      tenderId: c.req.param("tenderId"),
      reason: body.reason,
    });
    return c.json({ organizationTender: row });
  });

  app.post(
    "/api/saas/tenders/:tenderId/priority-monitoring",
    requireSession,
    async (c) => {
      const organizationId = resolveOrgId(c)!;
      const body = z
        .object({ enabled: z.boolean() })
        .parse(await c.req.json().catch(() => ({})));
      const orgTender = await deps.prisma.organizationTender.findFirst({
        where: {
          organizationId,
          tenderId: c.req.param("tenderId"),
        },
        select: { id: true },
      });
      if (!orgTender) {
        return c.json({ error: "organization_tender_not_found" }, 404);
      }
      const { setPriorityMonitoringManual } = await import(
        "./services/priority-monitoring.js"
      );
      const result = await setPriorityMonitoringManual(deps.prisma, {
        userId: c.get("userId"),
        organizationId,
        organizationTenderId: orgTender.id,
        enabled: body.enabled,
      });
      return c.json({ priorityMonitoring: result });
    },
  );

  app.post(
    "/api/saas/tenders/:tenderId/outreach",
    requireSession,
    async (c) => {
      const organizationId = resolveOrgId(c)!;
      await assertPlanFeature(
        deps.prisma,
        { userId: c.get("userId"), organizationId },
        "outreachWorkflow",
      );
      const body = z
        .object({
          sentAt: z.string().datetime().optional(),
          method: z.string().nullable().optional(),
          recipient: z.string().nullable().optional(),
          subject: z.string().nullable().optional(),
          body: z.string().nullable().optional(),
          notes: z.string().nullable().optional(),
          externalReference: z.string().nullable().optional(),
          documentIds: z.array(z.string()).optional(),
        })
        .parse(await c.req.json().catch(() => ({})));
      const row = await recordOutreachSent(deps.prisma, {
        userId: c.get("userId"),
        organizationId,
        tenderId: c.req.param("tenderId"),
        sentAt: body.sentAt ? new Date(body.sentAt) : undefined,
        method: body.method,
        recipient: body.recipient,
        subject: body.subject,
        body: body.body,
        notes: body.notes,
        externalReference: body.externalReference,
        documentIds: body.documentIds,
      });
      return c.json({ organizationTender: row });
    },
  );

  app.get(
    "/api/saas/tenders/:tenderId/outreach-draft",
    requireSession,
    async (c) => {
      const organizationId = resolveOrgId(c);
      const draft = await getOutreachDraft(deps.prisma, {
        userId: c.get("userId"),
        organizationId: organizationId!,
        tenderId: c.req.param("tenderId"),
      });
      return c.json({ draft });
    },
  );

  app.put(
    "/api/saas/tenders/:tenderId/outreach-draft",
    requireSession,
    async (c) => {
      const organizationId = resolveOrgId(c);
      const body = z
        .object({
          subject: z.string().nullable().optional(),
          body: z.string().nullable().optional(),
          manualEdited: z.boolean().optional(),
          regenerate: z.boolean().optional(),
          contacts: z
            .object({
              name: z.string().nullable().optional(),
              department: z.string().nullable().optional(),
              email: z.string().nullable().optional(),
              phone: z.string().nullable().optional(),
            })
            .optional(),
        })
        .parse(await c.req.json().catch(() => ({})));
      const draft = await saveOutreachDraft(deps.prisma, {
        userId: c.get("userId"),
        organizationId: organizationId!,
        tenderId: c.req.param("tenderId"),
        subject: body.subject,
        body: body.body,
        manualEdited: body.manualEdited,
        regenerate: body.regenerate,
        contacts: body.contacts,
      });
      return c.json({ draft });
    },
  );

  app.post(
    "/api/saas/vault/company-profile/generate",
    requireSession,
    async (c) => {
      const organizationId = resolveOrgId(c);
      const result = await generateCompanyProfileDocument(deps.prisma, {
        userId: c.get("userId"),
        organizationId: organizationId!,
      });
      return c.json(result);
    },
  );

  app.get("/api/saas/submissions", requireSession, async (c) => {
    const submissions = await listFormalSubmissions(deps.prisma, {
      userId: c.get("userId"),
      organizationId: resolveOrgId(c),
    });
    return c.json({ submissions });
  });

  app.patch(
    "/api/saas/submissions/:submissionId/result",
    requireSession,
    async (c) => {
      const organizationId = resolveOrgId(c);
      const body = z
        .object({
          result: z.enum(["WON", "LOST"]),
          notes: z.string().nullable().optional(),
        })
        .parse(await c.req.json());
      const updated = await confirmSubmissionResult(deps.prisma, {
        userId: c.get("userId"),
        organizationId: organizationId!,
        submissionId: c.req.param("submissionId"),
        result: body.result,
        notes: body.notes,
      });
      return c.json(updated);
    },
  );

  app.post(
    "/api/saas/tenders/:tenderId/submissions",
    requireSession,
    async (c) => {
      const organizationId = resolveOrgId(c)!;
      await assertPlanFeature(
        deps.prisma,
        { userId: c.get("userId"), organizationId },
        "submissionWorkflow",
      );
      const body = z
        .object({
          submittedAt: z.string().datetime().optional(),
          submissionMethod: z.string().min(1),
          recipient: z.string().nullable().optional(),
          subject: z.string().nullable().optional(),
          amountWithoutVat: z.number().nullable().optional(),
          amountWithVat: z.number().nullable().optional(),
          externalReference: z.string().nullable().optional(),
          notes: z.string().nullable().optional(),
          documentIds: z.array(z.string()).optional(),
        })
        .parse(await c.req.json());
      const result = await recordFormalSubmission(deps.prisma, {
        userId: c.get("userId"),
        organizationId,
        tenderId: c.req.param("tenderId"),
        submittedAt: body.submittedAt ? new Date(body.submittedAt) : undefined,
        submissionMethod: body.submissionMethod,
        recipient: body.recipient,
        subject: body.subject,
        amountWithoutVat: body.amountWithoutVat,
        amountWithVat: body.amountWithVat,
        externalReference: body.externalReference,
        notes: body.notes,
        documentIds: body.documentIds,
      });
      return c.json(result, 201);
    },
  );

  app.get("/api/saas/tenders/:tenderId/workspace", requireSession, async (c) => {
    const workspace = await getTenderWorkspace(deps.prisma, {
      userId: c.get("userId"),
      organizationId: resolveOrgId(c),
      tenderId: c.req.param("tenderId"),
      create: c.req.query("create") === "1",
    });
    return c.json({ ...workspace, sectionCatalog: WORKSPACE_SECTIONS });
  });

  app.post(
    "/api/saas/tenders/:tenderId/workspace/documents",
    requireSession,
    async (c) => {
      const body = z
        .object({
          documentIds: z.array(z.string()).min(1),
          section: z.string().nullable().optional(),
          purpose: z.string().nullable().optional(),
        })
        .parse(await c.req.json());
      const workspace = await addWorkspaceDocuments(deps.prisma, {
        userId: c.get("userId"),
        organizationId: resolveOrgId(c),
        tenderId: c.req.param("tenderId"),
        documentIds: body.documentIds,
        section: body.section,
        purpose: body.purpose,
      });
      return c.json({ ...workspace, sectionCatalog: WORKSPACE_SECTIONS });
    },
  );

  app.delete(
    "/api/saas/tenders/:tenderId/workspace/documents/:refId",
    requireSession,
    async (c) => {
      const workspace = await removeWorkspaceDocument(deps.prisma, {
        userId: c.get("userId"),
        organizationId: resolveOrgId(c),
        tenderId: c.req.param("tenderId"),
        refId: c.req.param("refId"),
      });
      return c.json({ ...workspace, sectionCatalog: WORKSPACE_SECTIONS });
    },
  );

  app.get("/api/saas/tenders/:tenderId/workflow", requireSession, async (c) => {
    const workflow = await getOrganizationTenderWorkflow(deps.prisma, {
      userId: c.get("userId"),
      organizationId: resolveOrgId(c),
      tenderId: c.req.param("tenderId"),
    });
    return c.json({ workflow });
  });

  app.post(
    "/api/saas/related-acts/:linkId/confirm",
    requireSession,
    async (c) => {
      const link = await confirmRelatedActLink(deps.prisma, {
        userId: c.get("userId"),
        organizationId: resolveOrgId(c),
        relatedActLinkId: c.req.param("linkId"),
      });
      return c.json({ relatedActLink: link });
    },
  );

  app.post(
    "/api/saas/related-acts/:linkId/dismiss",
    requireSession,
    async (c) => {
      const link = await dismissRelatedActLink(deps.prisma, {
        userId: c.get("userId"),
        organizationId: resolveOrgId(c),
        relatedActLinkId: c.req.param("linkId"),
      });
      return c.json({ relatedActLink: link });
    },
  );

  app.post(
    "/api/saas/tenders/:tenderId/prepare",
    requireSession,
    async (c) => {
      const row = await startPreparation(deps.prisma, {
        userId: c.get("userId"),
        organizationId: resolveOrgId(c),
        tenderId: c.req.param("tenderId"),
      });
      return c.json({ organizationTender: row });
    },
  );

  app.get("/api/saas/attention", requireSession, async (c) => {
    const organizationId = resolveOrgId(c);
    const unreadOnly = c.req.query("unread") === "1";
    const limitRaw = c.req.query("limit");
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
    const light = c.req.query("light") === "1";
    const events = await listAttentionEvents(deps.prisma, {
      userId: c.get("userId"),
      organizationId: organizationId!,
      unreadOnly,
      limit:
        limit != null && Number.isFinite(limit) && limit > 0 ? limit : undefined,
      skipPrune: light,
    });
    return c.json({ events });
  });

  app.post("/api/saas/attention/:eventId/read", requireSession, async (c) => {
    const organizationId = resolveOrgId(c);
    const event = await markAttentionEventRead(deps.prisma, {
      userId: c.get("userId"),
      organizationId: organizationId!,
      eventId: c.req.param("eventId"),
    });
    return c.json({ event });
  });

  app.post("/api/saas/attention/read-all", requireSession, async (c) => {
    const organizationId = resolveOrgId(c);
    const result = await markAllAttentionEventsRead(deps.prisma, {
      userId: c.get("userId"),
      organizationId: organizationId!,
    });
    return c.json(result);
  });

  app.get("/api/saas/monitoring/state", requireSession, async (c) => {
    const organizationTenders = await listMonitoringPipeline(deps.prisma, {
      userId: c.get("userId"),
      organizationId: resolveOrgId(c),
    });
    return c.json({ organizationTenders });
  });

  // Ops/test helper — not Brevo, not Slack
  app.post("/api/saas/monitoring/run", requireSession, async (c) => {
    const organizationId = resolveOrgId(c);
    await requireOrgMembership(
      deps.prisma,
      c.get("userId"),
      organizationId,
    );
    const result = await monitorFollowedThreads(deps.prisma, {
      enablePublicUiDiscovery: true,
    });
    return c.json({ result });
  });

  return { app, auth, config };
};
