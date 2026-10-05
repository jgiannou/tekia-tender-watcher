/**
 * API-level journey assertions for local QA org (after populate).
 * Uses Prisma + service calls — no browser cookies needed.
 */
import { PrismaClient } from "@prisma/client";
import { getOrganizationTenderWorkflow } from "../src/saas/services/workflow.js";
import { listDocuments, listFolders } from "../src/saas/services/vault.js";
import { getTenderWorkspace } from "../src/saas/services/workspace.js";
import { getOrganizationEntitlements } from "../src/saas/services/entitlements.js";

const EMAIL = "johnn.giannousis@gmail.com";
const prisma = new PrismaClient();

type Check = { id: string; area: string; result: "PASS" | "FAIL" | "PARTIAL" | "MISSING"; detail: string };

const checks: Check[] = [];
const add = (c: Check) => checks.push(c);

const main = async () => {
  const user = await prisma.user.findFirst({ where: { email: EMAIL } });
  if (!user) throw new Error("user_missing");
  const membership = await prisma.organizationMember.findFirst({
    where: { userId: user.id },
    include: { organization: true },
  });
  if (!membership) throw new Error("org_missing");
  const organizationId = membership.organizationId;
  const userId = user.id;

  add({
    id: "auth-user",
    area: "Auth",
    result: user.emailVerified ? "PASS" : "PARTIAL",
    detail: `emailVerified=${user.emailVerified}`,
  });

  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId },
  });
  const company = (settings?.company ?? {}) as Record<string, unknown>;
  const activities = Array.isArray(settings?.activities) ? settings!.activities : [];
  add({
    id: "company-profile",
    area: "Onboarding",
    result: company.legalName && company.vatNumber ? "PASS" : "FAIL",
    detail: `legalName=${String(company.legalName ?? "")} vat=${String(company.vatNumber ?? "")}`,
  });
  add({
    id: "activities",
    area: "Onboarding",
    result: activities.length > 0 ? "PASS" : "FAIL",
    detail: `activities=${activities.length}`,
  });
  add({
    id: "onboarding-status",
    area: "Onboarding",
    result: settings?.onboardingStatus === "COMPLETED" ? "PASS" : "PARTIAL",
    detail: `onboardingStatus=${settings?.onboardingStatus}`,
  });

  const entitlements = await getOrganizationEntitlements(prisma, {
    userId,
    organizationId,
  });
  add({
    id: "billing-plan",
    area: "Billing",
    result: entitlements.scanAccess.planKey ? "PASS" : "FAIL",
    detail: `planKey=${entitlements.scanAccess.planKey} status=${entitlements.scanAccess.status} seats=${entitlements.entitlements.includedSeats}`,
  });

  const profiles = await prisma.watchProfile.findMany({ where: { organizationId } });
  add({
    id: "watch-profiles",
    area: "Discover",
    result: profiles.some((p) => p.enabled && (p.matchCount ?? 0) > 0) ? "PASS" : "FAIL",
    detail: profiles
      .map((p) => `${p.name}:${p.scanState}:${p.matchCount}`)
      .join(" | "),
  });

  const oppCount = await prisma.organizationTender.count({
    where: { organizationId, pipelineStage: { not: "DISMISSED" } },
  });
  add({
    id: "opportunities",
    area: "Discover",
    result: oppCount > 0 ? "PASS" : "FAIL",
    detail: `opportunities=${oppCount}`,
  });

  const following = await prisma.organizationTender.count({
    where: { organizationId, following: true },
  });
  add({
    id: "follow",
    area: "Follow",
    result: following > 0 ? "PASS" : "FAIL",
    detail: `following=${following}`,
  });

  const monitoring = await prisma.organizationTender.count({
    where: { organizationId, monitoringActive: true },
  });
  add({
    id: "monitoring-active",
    area: "Monitor",
    result: monitoring > 0 ? "PASS" : "FAIL",
    detail: `monitoringActive=${monitoring}`,
  });

  const outreach = await prisma.outreachLedger.findMany({
    where: { organizationId, status: "SENT" },
    include: { organizationTender: { include: { tender: true } } },
  });
  add({
    id: "outreach-recorded",
    area: "Outreach",
    result: outreach.length > 0 ? "PASS" : "FAIL",
    detail: outreach
      .map((o) => o.organizationTender.tender.referenceNumber)
      .join(","),
  });

  // Outreach must NOT be SUBMITTED pipeline for outreach-only rows
  const outreachStages = await prisma.organizationTender.findMany({
    where: {
      organizationId,
      pipelineStage: "OUTREACH_SENT",
    },
    include: { submissions: true, tender: true },
  });
  const outreachLeak = outreachStages.some((r) => r.submissions.length > 0);
  add({
    id: "outreach-neq-submission",
    area: "Outreach",
    result: outreachStages.length > 0 && !outreachLeak ? "PASS" : "FAIL",
    detail: `OUTREACH_SENT=${outreachStages.length} leakSubmission=${outreachLeak}`,
  });

  const preparing = await prisma.organizationTender.findMany({
    where: { organizationId, pipelineStage: "PREPARING" },
    include: { tender: true },
  });
  add({
    id: "preparing",
    area: "Prepare",
    result: preparing.length > 0 ? "PASS" : "FAIL",
    detail: preparing.map((p) => p.tender.referenceNumber).join(","),
  });

  if (preparing[0]) {
    const ws = await getTenderWorkspace(prisma, {
      userId,
      organizationId,
      tenderId: preparing[0].tenderId,
      create: false,
    });
    add({
      id: "workspace-docs",
      area: "Prepare",
      result: ws.documentCount > 0 ? "PASS" : "FAIL",
      detail: `workspaceDocs=${ws.documentCount}`,
    });
  } else {
    add({
      id: "workspace-docs",
      area: "Prepare",
      result: "FAIL",
      detail: "no PREPARING tender",
    });
  }

  const folders = await listFolders(prisma, { userId, organizationId });
  const docs = await listDocuments(prisma, { userId, organizationId });
  const statuses = new Set(docs.map((d) => d.status));
  add({
    id: "vault-folders",
    area: "Documents",
    result: folders.length >= 8 ? "PASS" : "PARTIAL",
    detail: `folders=${folders.length}`,
  });
  add({
    id: "vault-docs",
    area: "Documents",
    result: docs.length >= 5 ? "PASS" : "FAIL",
    detail: `docs=${docs.length} statuses=${[...statuses].join(",")}`,
  });
  add({
    id: "vault-expiring",
    area: "Documents",
    result: statuses.has("EXPIRING_SOON") || statuses.has("EXPIRED") ? "PASS" : "PARTIAL",
    detail: `hasExpiringOrExpired=${statuses.has("EXPIRING_SOON") || statuses.has("EXPIRED")}`,
  });

  const submissions = await prisma.submission.findMany({
    where: { organizationId },
    include: {
      documentSnapshots: true,
      organizationTender: { include: { tender: true } },
    },
  });
  add({
    id: "submissions",
    area: "Submit",
    result: submissions.length >= 2 ? "PASS" : "FAIL",
    detail: submissions
      .map(
        (s) =>
          `${s.organizationTender.tender.referenceNumber}:${s.result}:snaps=${s.documentSnapshots.length}`,
      )
      .join(" | "),
  });

  const won = submissions.filter((s) => s.result === "WON");
  const pending = submissions.filter((s) => s.result === "PENDING");
  add({
    id: "won-lost-manual",
    area: "Result",
    result: won.length > 0 && pending.length > 0 ? "PASS" : "PARTIAL",
    detail: `WON=${won.length} PENDING=${pending.length}`,
  });

  // Monitoring continues after SUBMITTED
  const submittedStillWatching = await prisma.organizationTender.count({
    where: {
      organizationId,
      pipelineStage: "SUBMITTED",
      monitoringActive: true,
    },
  });
  add({
    id: "monitor-after-submit",
    area: "Monitor",
    result: submittedStillWatching > 0 ? "PASS" : "FAIL",
    detail: `SUBMITTED+monitoring=${submittedStillWatching}`,
  });

  const attention = await prisma.organizationAttentionEvent.count({
    where: { organizationId },
  });
  add({
    id: "attention-events",
    area: "Notifications",
    result: attention > 0 ? "PASS" : "PARTIAL",
    detail: `attentionEvents=${attention}`,
  });

  const deliveries = await prisma.notificationDelivery.groupBy({
    by: ["status"],
    where: { organizationId },
    _count: true,
  });
  add({
    id: "email-deliveries",
    area: "Notifications",
    result: deliveries.some((d) => d.status === "SENT") ? "PASS" : "PARTIAL",
    detail: deliveries.map((d) => `${d.status}:${d._count}`).join(","),
  });

  const relatedLinks = await prisma.relatedActLink.count();
  add({
    id: "related-act-links",
    area: "Monitor",
    result: relatedLinks > 0 ? "PASS" : "MISSING",
    detail: `RelatedActLink global count=${relatedLinks} (may be empty if monitor job not run against live KIMDIS for these ADAMs)`,
  });

  // Sample workflow payloads for key stages
  for (const stage of ["OUTREACH_SENT", "PREPARING", "SUBMITTED", "WON"] as const) {
    const row = await prisma.organizationTender.findFirst({
      where: { organizationId, pipelineStage: stage },
    });
    if (!row) {
      add({
        id: `workflow-${stage}`,
        area: "Workflow UX",
        result: "FAIL",
        detail: "row missing",
      });
      continue;
    }
    const wf = await getOrganizationTenderWorkflow(prisma, {
      userId,
      organizationId,
      tenderId: row.tenderId,
    });
    add({
      id: `workflow-${stage}`,
      area: "Workflow UX",
      result: wf ? "PASS" : "FAIL",
      detail: `stageLabel=${wf.stageLabel} following=${wf.following} outreach=${Boolean(wf.outreach)} submission=${Boolean(wf.latestSubmission)}`,
    });
  }

  const members = await prisma.organizationMember.count({ where: { organizationId } });
  const invites = await prisma.invitation.count({ where: { organizationId } });
  add({
    id: "team",
    area: "Team",
    result: members >= 1 ? "PASS" : "FAIL",
    detail: `members=${members} invitations=${invites}`,
  });

  // Print matrix
  const order = ["PASS", "PARTIAL", "FAIL", "MISSING"] as const;
  for (const result of order) {
    const rows = checks.filter((c) => c.result === result);
    if (!rows.length) continue;
    console.log(`\n=== ${result} (${rows.length}) ===`);
    for (const c of rows) {
      console.log(`[${c.area}] ${c.id}: ${c.detail}`);
    }
  }
  console.log(
    `\nTOTAL ${checks.length} · PASS ${checks.filter((c) => c.result === "PASS").length} · PARTIAL ${checks.filter((c) => c.result === "PARTIAL").length} · FAIL ${checks.filter((c) => c.result === "FAIL").length} · MISSING ${checks.filter((c) => c.result === "MISSING").length}`,
  );
};

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
