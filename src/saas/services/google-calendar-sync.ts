import type { PrismaClient, SaasJob } from "@prisma/client";
import { resolveSaasAppUrl } from "../mail/mail.js";
import { enqueueSaasJob, SAAS_JOB_TYPES } from "../jobs/outbox.js";
import { entitlementsForPlanKey } from "../plans/catalog.js";
import { resolveOrganizationScanAccess } from "./scan-access.js";
import {
  assertGoogleCalendarExists,
  getValidGoogleAccessToken,
} from "./google-connection.js";
import {
  deleteCalendarEvent,
  insertCalendarEvent,
  patchCalendarEvent,
} from "./google-calendar-api.js";
import {
  buildDeadlineEventContent,
  deadlineFingerprint,
  isFutureOrTodayDeadline,
  parseTenderDeadline,
} from "./google-calendar-events.js";

const appBase = () => resolveSaasAppUrl().replace(/\/+$/, "");

export const enqueueGoogleCalendarFullSync = async (
  prisma: PrismaClient,
  input: {
    connectionId: string;
    organizationId: string;
    userId: string;
    force?: boolean;
  },
) => {
  const windowKey = input.force
    ? `manual:${Date.now()}`
    : `auto:${Math.floor(Date.now() / 60_000)}`;
  await enqueueSaasJob(prisma, {
    type: SAAS_JOB_TYPES.googleCalendarFullSync,
    deliveryKey: `GICAL_FULL:${input.connectionId}:${windowKey}`,
    organizationId: input.organizationId,
    payload: {
      connectionId: input.connectionId,
      userId: input.userId,
      organizationId: input.organizationId,
    },
    priority: 40,
  });
};

export const enqueueGoogleCalendarUpsertForTender = async (
  prisma: PrismaClient,
  input: {
    organizationId: string;
    organizationTenderId: string;
  },
) => {
  const connections = await prisma.userOrganizationGoogleConnection.findMany({
    where: {
      organizationId: input.organizationId,
      calendarStatus: { in: ["ACTIVE", "SYNCING"] },
      tokenStatus: "ACTIVE",
      calendarId: { not: null },
    },
    select: { id: true, userId: true },
  });
  for (const conn of connections) {
    await enqueueSaasJob(prisma, {
      type: SAAS_JOB_TYPES.googleCalendarUpsertEvent,
      deliveryKey: `GICAL_UPSERT:${conn.id}:${input.organizationTenderId}:${Math.floor(Date.now() / 30_000)}`,
      organizationId: input.organizationId,
      payload: {
        connectionId: conn.id,
        userId: conn.userId,
        organizationId: input.organizationId,
        organizationTenderId: input.organizationTenderId,
      },
      priority: 50,
    });
  }
};

export const enqueueGoogleCalendarDeleteForTender = async (
  prisma: PrismaClient,
  input: {
    organizationId: string;
    organizationTenderId: string;
  },
) => {
  const links = await prisma.googleCalendarEventLink.findMany({
    where: { organizationTenderId: input.organizationTenderId },
    select: {
      connectionId: true,
      googleEventId: true,
      googleCalendarId: true,
      connection: { select: { userId: true, organizationId: true } },
    },
  });
  for (const link of links) {
    await enqueueSaasJob(prisma, {
      type: SAAS_JOB_TYPES.googleCalendarDeleteEvent,
      deliveryKey: `GICAL_DEL:${link.connectionId}:${input.organizationTenderId}`,
      organizationId: link.connection.organizationId,
      payload: {
        connectionId: link.connectionId,
        userId: link.connection.userId,
        organizationId: link.connection.organizationId,
        organizationTenderId: input.organizationTenderId,
        googleEventId: link.googleEventId,
        googleCalendarId: link.googleCalendarId,
      },
      priority: 45,
    });
  }
};

const stillEntitled = async (
  prisma: PrismaClient,
  input: { userId: string; organizationId: string },
): Promise<boolean> => {
  const member = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: input.organizationId,
        userId: input.userId,
      },
    },
  });
  if (!member) return false;
  const scan = await resolveOrganizationScanAccess(prisma, input);
  if (scan.status !== "active" && scan.status !== "trial") return false;
  const plan = entitlementsForPlanKey(scan.planKey);
  return plan.googleCalendar;
};

const syncOneTender = async (
  prisma: PrismaClient,
  input: {
    connectionId: string;
    accessToken: string;
    calendarId: string;
    organizationTenderId: string;
  },
): Promise<"ok" | "skip" | "retry"> => {
  const ot = await prisma.organizationTender.findUnique({
    where: { id: input.organizationTenderId },
    include: {
      tender: {
        select: {
          id: true,
          title: true,
          contractingAuthority: true,
          referenceNumber: true,
          finalSubmissionDate: true,
          recordType: true,
        },
      },
    },
  });
  if (!ot) return "skip";

  const existingLink = await prisma.googleCalendarEventLink.findUnique({
    where: {
      connectionId_organizationTenderId: {
        connectionId: input.connectionId,
        organizationTenderId: ot.id,
      },
    },
  });

  const following = ot.following || ot.monitoringActive;
  const deadline = ot.tender.finalSubmissionDate;
  if (!following || !deadline || !isFutureOrTodayDeadline(deadline)) {
    if (existingLink) {
      await deleteCalendarEvent({
        accessToken: input.accessToken,
        calendarId: existingLink.googleCalendarId,
        eventId: existingLink.googleEventId,
      });
      await prisma.googleCalendarEventLink.delete({
        where: { id: existingLink.id },
      });
    }
    return "ok";
  }

  const parsed = parseTenderDeadline(deadline);
  if (!parsed) return "skip";

  const arcUrl = `${appBase()}/app/tenders/${ot.tenderId}`;
  const content = buildDeadlineEventContent({
    title: ot.tender.title || "Διαγωνισμός",
    authority: ot.tender.contractingAuthority,
    source: ot.tender.recordType,
    reference: ot.tender.referenceNumber,
    arcUrl,
    deadline: parsed,
  });
  const fingerprint = deadlineFingerprint({
    title: content.summary,
    deadline: parsed,
    arcUrl,
  });

  if (existingLink && existingLink.deadlineFingerprint === fingerprint) {
    return "ok";
  }

  if (existingLink) {
    const patched = await patchCalendarEvent({
      accessToken: input.accessToken,
      calendarId: existingLink.googleCalendarId,
      eventId: existingLink.googleEventId,
      event: content,
    });
    if (!patched.ok) {
      if (patched.error.status === 404) {
        await prisma.googleCalendarEventLink.delete({
          where: { id: existingLink.id },
        });
        // Fall through to insert.
      } else if (patched.error.permanent) {
        return "skip";
      } else {
        return "retry";
      }
    } else {
      await prisma.googleCalendarEventLink.update({
        where: { id: existingLink.id },
        data: { deadlineFingerprint: fingerprint, lastSyncedAt: new Date() },
      });
      return "ok";
    }
  }

  const inserted = await insertCalendarEvent({
    accessToken: input.accessToken,
    calendarId: input.calendarId,
    event: content,
  });
  if (!inserted.ok) {
    return inserted.error.permanent ? "skip" : "retry";
  }
  await prisma.googleCalendarEventLink.upsert({
    where: {
      connectionId_organizationTenderId: {
        connectionId: input.connectionId,
        organizationTenderId: ot.id,
      },
    },
    create: {
      connectionId: input.connectionId,
      organizationTenderId: ot.id,
      tenderId: ot.tenderId,
      googleCalendarId: input.calendarId,
      googleEventId: inserted.id,
      deadlineFingerprint: fingerprint,
    },
    update: {
      googleEventId: inserted.id,
      googleCalendarId: input.calendarId,
      deadlineFingerprint: fingerprint,
      lastSyncedAt: new Date(),
    },
  });
  return "ok";
};

export const processGoogleCalendarFullSyncJob = async (
  prisma: PrismaClient,
  job: SaasJob,
): Promise<"ok" | "retry"> => {
  const payload = (job.payload ?? {}) as {
    connectionId?: string;
    userId?: string;
    organizationId?: string;
  };
  if (!payload.connectionId || !payload.userId || !payload.organizationId) {
    return "ok";
  }

  const entitled = await stillEntitled(prisma, {
    userId: payload.userId,
    organizationId: payload.organizationId,
  });
  if (!entitled) return "ok";

  const conn = await prisma.userOrganizationGoogleConnection.findUnique({
    where: { id: payload.connectionId },
  });
  if (!conn?.calendarId) return "ok";
  if (
    conn.calendarStatus === "PAUSED" ||
    conn.calendarStatus === "PLAN_PAUSED" ||
    conn.calendarStatus === "DISABLED" ||
    conn.calendarStatus === "NEEDS_RECONNECT" ||
    conn.calendarStatus === "NEEDS_RECREATE"
  ) {
    return "ok";
  }

  const token = await getValidGoogleAccessToken(prisma, conn.id);
  if (!token.ok) return token.needsReconnect ? "ok" : "retry";

  const exists = await assertGoogleCalendarExists(
    prisma,
    conn.id,
    token.accessToken,
  );
  if (!exists) return "ok";

  const tenders = await prisma.organizationTender.findMany({
    where: {
      organizationId: payload.organizationId,
      OR: [{ following: true }, { monitoringActive: true }],
    },
    select: { id: true },
  });

  let hadRetry = false;
  for (const ot of tenders) {
    const result = await syncOneTender(prisma, {
      connectionId: conn.id,
      accessToken: token.accessToken,
      calendarId: conn.calendarId,
      organizationTenderId: ot.id,
    });
    if (result === "retry") hadRetry = true;
  }

  // Remove orphan links for tenders no longer followed (extra safety).
  const links = await prisma.googleCalendarEventLink.findMany({
    where: { connectionId: conn.id },
    select: { id: true, organizationTenderId: true },
  });
  const liveIds = new Set(tenders.map((t) => t.id));
  for (const link of links) {
    if (!liveIds.has(link.organizationTenderId)) {
      await syncOneTender(prisma, {
        connectionId: conn.id,
        accessToken: token.accessToken,
        calendarId: conn.calendarId,
        organizationTenderId: link.organizationTenderId,
      });
    }
  }

  if (!hadRetry) {
    await prisma.userOrganizationGoogleConnection.update({
      where: { id: conn.id },
      data: {
        calendarStatus: "ACTIVE",
        calendarLastSuccessAt: new Date(),
        calendarInitialSyncAt: conn.calendarInitialSyncAt ?? new Date(),
        calendarLastErrorSafe: null,
      },
    });
  }
  return hadRetry ? "retry" : "ok";
};

export const processGoogleCalendarUpsertEventJob = async (
  prisma: PrismaClient,
  job: SaasJob,
): Promise<"ok" | "retry"> => {
  const payload = (job.payload ?? {}) as {
    connectionId?: string;
    userId?: string;
    organizationId?: string;
    organizationTenderId?: string;
  };
  if (
    !payload.connectionId ||
    !payload.userId ||
    !payload.organizationId ||
    !payload.organizationTenderId
  ) {
    return "ok";
  }
  if (
    !(await stillEntitled(prisma, {
      userId: payload.userId,
      organizationId: payload.organizationId,
    }))
  ) {
    return "ok";
  }
  const conn = await prisma.userOrganizationGoogleConnection.findUnique({
    where: { id: payload.connectionId },
  });
  if (!conn?.calendarId || conn.calendarStatus !== "ACTIVE") return "ok";
  const token = await getValidGoogleAccessToken(prisma, conn.id);
  if (!token.ok) return token.needsReconnect ? "ok" : "retry";
  const result = await syncOneTender(prisma, {
    connectionId: conn.id,
    accessToken: token.accessToken,
    calendarId: conn.calendarId,
    organizationTenderId: payload.organizationTenderId,
  });
  if (result === "ok") {
    await prisma.userOrganizationGoogleConnection.update({
      where: { id: conn.id },
      data: { calendarLastSuccessAt: new Date(), calendarLastErrorSafe: null },
    });
  }
  return result === "retry" ? "retry" : "ok";
};

export const processGoogleCalendarDeleteEventJob = async (
  prisma: PrismaClient,
  job: SaasJob,
): Promise<"ok" | "retry"> => {
  const payload = (job.payload ?? {}) as {
    connectionId?: string;
    organizationTenderId?: string;
    googleEventId?: string;
    googleCalendarId?: string;
  };
  if (
    !payload.connectionId ||
    !payload.organizationTenderId ||
    !payload.googleEventId ||
    !payload.googleCalendarId
  ) {
    return "ok";
  }
  const token = await getValidGoogleAccessToken(prisma, payload.connectionId);
  if (!token.ok) return token.needsReconnect ? "ok" : "retry";
  const deleted = await deleteCalendarEvent({
    accessToken: token.accessToken,
    calendarId: payload.googleCalendarId,
    eventId: payload.googleEventId,
  });
  if (!deleted.ok && !deleted.error.permanent) return "retry";
  await prisma.googleCalendarEventLink.deleteMany({
    where: {
      connectionId: payload.connectionId,
      organizationTenderId: payload.organizationTenderId,
    },
  });
  return "ok";
};
