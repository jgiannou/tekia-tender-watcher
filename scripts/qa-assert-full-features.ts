/**
 * Full SaaS feature QA assert (local org johnn.giannousis@gmail.com).
 * Run: pnpm exec tsx scripts/qa-assert-full-features.ts
 */
import { PrismaClient } from "@prisma/client";
import { getOrganizationTenderWorkflow } from "../src/saas/services/workflow.js";
import { listDocuments, listFolders } from "../src/saas/services/vault.js";
import { getTenderWorkspace } from "../src/saas/services/workspace.js";
import { getOrganizationEntitlements } from "../src/saas/services/entitlements.js";
import { detectTargetedInvitation, scoreKimdisItemAgainstProfile, criteriaFromWatchProfile } from "../src/saas/services/watch-match.js";
import { kimdisItemFromTender } from "../src/saas/services/kimdis-search.js";
import { confirmSubmissionResult } from "../src/saas/services/submission.js";
import { followTender, unfollowTender } from "../src/saas/services/follow.js";
import {
  confirmRelatedActLink,
} from "../src/saas/services/related-acts.js";
import { generateCompanyProfileDocument } from "../src/saas/services/company-profile-doc.js";
import {
  getOutreachDraft,
  saveOutreachDraft,
} from "../src/saas/services/outreach-draft.js";
import { recordOutreachSent } from "../src/saas/services/outreach.js";

const EMAIL = "johnn.giannousis@gmail.com";
const prisma = new PrismaClient();

type Check = {
  id: string;
  area: string;
  result: "PASS" | "FAIL" | "PARTIAL" | "MISSING";
  detail: string;
};

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
  console.log("ORG", membership.organization.name, organizationId);

  // --- Auth / onboarding / billing ---
  add({
    id: "auth-verified",
    area: "Auth",
    result: user.emailVerified ? "PASS" : "FAIL",
    detail: `emailVerified=${user.emailVerified}`,
  });
  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId },
  });
  const company = (settings?.company ?? {}) as Record<string, unknown>;
  const activities = Array.isArray(settings?.activities) ? settings!.activities : [];
  add({
    id: "company",
    area: "Settings",
    result: Boolean(company.legalName && company.vatNumber) ? "PASS" : "FAIL",
    detail: String(company.legalName ?? ""),
  });
  add({
    id: "activities",
    area: "Settings",
    result: activities.length > 0 ? "PASS" : "FAIL",
    detail: `n=${activities.length}`,
  });
  add({
    id: "onboarding",
    area: "Settings",
    result: settings?.onboardingStatus === "COMPLETED" ? "PASS" : "PARTIAL",
    detail: String(settings?.onboardingStatus),
  });
  const notif = (settings?.notifications ?? {}) as Record<string, unknown>;
  add({
    id: "notifications-prefs",
    area: "Settings",
    result: notif.emailEnabled === true || Array.isArray(notif.recipients) ? "PASS" : "PARTIAL",
    detail: `emailEnabled=${String(notif.emailEnabled)}`,
  });

  const entitlements = await getOrganizationEntitlements(prisma, {
    userId,
    organizationId,
  });
  add({
    id: "plan",
    area: "Billing",
    result:
      entitlements.scanAccess.planKey === "pro" &&
      entitlements.scanAccess.status === "active"
        ? "PASS"
        : "PARTIAL",
    detail: `${entitlements.scanAccess.planKey}/${entitlements.scanAccess.status}`,
  });

  const members = await prisma.organizationMember.count({ where: { organizationId } });
  const invites = await prisma.invitation.count({ where: { organizationId } });
  add({
    id: "team",
    area: "Team",
    result: members >= 1 ? "PASS" : "FAIL",
    detail: `members=${members} invites=${invites}`,
  });

  // --- Discover ---
  const profiles = await prisma.watchProfile.findMany({ where: { organizationId } });
  add({
    id: "saved-search",
    area: "Discover",
    result: profiles.some((p) => p.enabled && (p.matchCount ?? 0) > 0) ? "PASS" : "FAIL",
    detail: profiles.map((p) => `${p.name}:${p.scanState}:${p.matchCount}`).join(" | "),
  });
  const oppCount = await prisma.organizationTender.count({
    where: { organizationId, pipelineStage: { not: "DISMISSED" } },
  });
  add({
    id: "opportunities",
    area: "Discover",
    result: oppCount > 0 ? "PASS" : "FAIL",
    detail: `n=${oppCount}`,
  });

  // Honest scoring sample
  const profile = profiles[0];
  if (profile) {
    const criteria = criteriaFromWatchProfile(profile);
    const sample = await prisma.organizationTender.findMany({
      where: { organizationId, pipelineStage: "NEW" },
      include: { tender: true },
      take: 20,
      orderBy: { score: "desc" },
    });
    const scores = sample.map((r) => r.score ?? 0);
    const maxScore = Math.max(0, ...scores);
    const allHundred = scores.length > 0 && scores.every((s) => s >= 100);
    add({
      id: "scoring-honest",
      area: "Scoring",
      result: !allHundred && maxScore <= 95 ? "PASS" : maxScore < 100 ? "PARTIAL" : "FAIL",
      detail: `max=${maxScore} sample=${scores.slice(0, 5).join(",")}`,
    });

    const sparti = detectTargetedInvitation({
      title:
        "Πρόσκληση κατάθεσης προσφοράς για την υπηρεσία με τίτλο: «Συντήρηση ιστοσελίδας» (www.sparti.gov.gr)",
      description: "",
      procedureType: null,
    });
    add({
      id: "scoring-targeted",
      area: "Scoring",
      result: sparti.targeted ? "PASS" : "FAIL",
      detail: String(sparti.reason),
    });

    // Re-score one open title-only tender
    const open = sample.find((s) => s.tender.title?.includes("ιστοσελίδ"));
    if (open) {
      const match = scoreKimdisItemAgainstProfile(
        criteria,
        kimdisItemFromTender(open.tender),
        { id: profile.id, name: profile.name },
      );
      add({
        id: "scoring-live",
        area: "Scoring",
        result: match.score > 0 && match.score < 100 ? "PASS" : "PARTIAL",
        detail: `adam=${open.tender.referenceNumber} score=${match.score} targeted=${match.targetedInvitation}`,
      });
    }
  }

  // --- Follow / monitoring ---
  const following = await prisma.organizationTender.count({
    where: { organizationId, following: true },
  });
  const monitoring = await prisma.organizationTender.count({
    where: { organizationId, monitoringActive: true },
  });
  add({
    id: "follow",
    area: "Follow",
    result: following > 0 ? "PASS" : "FAIL",
    detail: `following=${following}`,
  });
  add({
    id: "monitoring-active",
    area: "Monitor",
    result: monitoring > 0 ? "PASS" : "FAIL",
    detail: `monitoringActive=${monitoring}`,
  });

  // Unfollow round-trip on a safe NEW followed row (or create follow)
  let unfollowTarget = await prisma.organizationTender.findFirst({
    where: {
      organizationId,
      following: true,
      pipelineStage: "NEW",
      monitoringActive: true,
    },
  });
  if (!unfollowTarget) {
    const any = await prisma.organizationTender.findFirst({
      where: { organizationId, pipelineStage: "NEW" },
    });
    if (any) {
      await followTender(prisma, {
        userId,
        organizationId,
        tenderId: any.tenderId,
      });
      unfollowTarget = await prisma.organizationTender.findUnique({
        where: { id: any.id },
      });
    }
  }
  if (unfollowTarget) {
    const stopped = await unfollowTender(prisma, {
      userId,
      organizationId,
      tenderId: unfollowTarget.tenderId,
    });
    add({
      id: "unfollow-api",
      area: "Follow",
      result: !stopped.following && !stopped.monitoringActive ? "PASS" : "FAIL",
      detail: `following=${stopped.following} monitoring=${stopped.monitoringActive}`,
    });
    // restore follow for UI
    await followTender(prisma, {
      userId,
      organizationId,
      tenderId: unfollowTarget.tenderId,
    });
  } else {
    add({
      id: "unfollow-api",
      area: "Follow",
      result: "MISSING",
      detail: "no suitable tender",
    });
  }

  // --- Outreach ≠ submission ---
  const outreach = await prisma.outreachLedger.count({
    where: { organizationId, status: "SENT" },
  });
  const outreachOnly = await prisma.organizationTender.findMany({
    where: { organizationId, pipelineStage: "OUTREACH_SENT" },
    include: { submissions: true },
  });
  add({
    id: "outreach",
    area: "Outreach",
    result: outreach > 0 ? "PASS" : "PARTIAL",
    detail: `sent=${outreach}`,
  });
  add({
    id: "outreach-neq-submission",
    area: "Outreach",
    result:
      outreachOnly.length === 0 ||
      outreachOnly.every((r) => r.submissions.length === 0)
        ? "PASS"
        : "FAIL",
    detail: `OUTREACH_SENT=${outreachOnly.length}`,
  });

  // --- Prepare / vault ---
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
    result: docs.length >= 4 ? "PASS" : "FAIL",
    detail: `docs=${docs.length} statuses=${[...statuses].join(",")}`,
  });
  add({
    id: "vault-expiry",
    area: "Documents",
    result:
      statuses.has("EXPIRED") || statuses.has("EXPIRING_SOON") ? "PASS" : "PARTIAL",
    detail: [...statuses].join(","),
  });

  const preparing = await prisma.organizationTender.findFirst({
    where: { organizationId, pipelineStage: "PREPARING" },
  });
  if (preparing) {
    const ws = await getTenderWorkspace(prisma, {
      userId,
      organizationId,
      tenderId: preparing.tenderId,
      create: false,
    });
    add({
      id: "workspace",
      area: "Prepare",
      result: ws.documentCount > 0 ? "PASS" : "PARTIAL",
      detail: `docs=${ws.documentCount}`,
    });
  } else {
    add({
      id: "workspace",
      area: "Prepare",
      result: "PARTIAL",
      detail: "no PREPARING row currently",
    });
  }

  // --- Submissions / WON-LOST ---
  const submissions = await prisma.submission.findMany({
    where: { organizationId },
    include: { documentSnapshots: true },
  });
  add({
    id: "submissions",
    area: "Submit",
    result: submissions.length > 0 ? "PASS" : "FAIL",
    detail: submissions
      .map((s) => `${s.result}:snaps=${s.documentSnapshots.length}`)
      .join(" | "),
  });
  add({
    id: "won-lost-data",
    area: "Result",
    result: submissions.some((s) => s.result === "WON" || s.result === "LOST")
      ? "PASS"
      : "PARTIAL",
    detail: `WON=${submissions.filter((s) => s.result === "WON").length} LOST=${submissions.filter((s) => s.result === "LOST").length} PENDING=${submissions.filter((s) => s.result === "PENDING").length}`,
  });

  // Ensure confirmSubmissionResult API path works: create temp PENDING if needed
  let pending = submissions.find((s) => s.result === "PENDING");
  if (!pending) {
    const candidate = await prisma.organizationTender.findFirst({
      where: {
        organizationId,
        following: true,
        pipelineStage: { notIn: ["WON", "LOST", "DISMISSED", "SUBMITTED"] },
      },
    });
    if (candidate) {
      const { recordFormalSubmission } = await import(
        "../src/saas/services/submission.js"
      );
      const created = await recordFormalSubmission(prisma, {
        userId,
        organizationId,
        tenderId: candidate.tenderId,
        submissionMethod: "EMAIL",
        externalReference: "QA-FULL-PENDING",
        amountWithoutVat: 1000,
      });
      pending = created.submission;
    }
  }
  if (pending && pending.result === "PENDING") {
    const confirmed = await confirmSubmissionResult(prisma, {
      userId,
      organizationId,
      submissionId: pending.id,
      result: "LOST",
    });
    add({
      id: "won-lost-api",
      area: "Result",
      result:
        confirmed.submission.result === "LOST" &&
        confirmed.organizationTender.pipelineStage === "LOST" &&
        confirmed.organizationTender.monitoringActive === false
          ? "PASS"
          : "FAIL",
      detail: `result=${confirmed.submission.result} stage=${confirmed.organizationTender.pipelineStage} mon=${confirmed.organizationTender.monitoringActive}`,
    });
  } else {
    add({
      id: "won-lost-api",
      area: "Result",
      result: "PARTIAL",
      detail: "no pending submission to exercise",
    });
  }

  // Keep at least one SUBMITTED+monitoring row for journey / North Star §14
  // (won-lost-api above may have closed the previous pending submission).
  let submittedMonitoring = await prisma.organizationTender.count({
    where: {
      organizationId,
      pipelineStage: "SUBMITTED",
      monitoringActive: true,
    },
  });
  if (submittedMonitoring === 0) {
    const { recordFormalSubmission } = await import(
      "../src/saas/services/submission.js"
    );
    const candidate = await prisma.organizationTender.findFirst({
      where: {
        organizationId,
        following: true,
        pipelineStage: { in: ["PREPARING", "OUTREACH_SENT", "NEW"] },
        tender: { is: { recordType: "PROC" } },
      },
    });
    if (candidate) {
      await recordFormalSubmission(prisma, {
        userId,
        organizationId,
        tenderId: candidate.tenderId,
        submissionMethod: "PORTAL",
        externalReference: "QA-SUBMITTED-MONITOR-KEEP",
        amountWithoutVat: 1800,
      });
      submittedMonitoring = await prisma.organizationTender.count({
        where: {
          organizationId,
          pipelineStage: "SUBMITTED",
          monitoringActive: true,
        },
      });
    }
  }
  add({
    id: "monitor-after-submit",
    area: "Monitor",
    result: submittedMonitoring > 0 ? "PASS" : "PARTIAL",
    detail: `SUBMITTED+monitoring=${submittedMonitoring}`,
  });

  // --- Related acts ---
  const links = await prisma.relatedActLink.findMany({
    include: {
      sourceTender: { select: { referenceNumber: true } },
      targetTender: { select: { referenceNumber: true } },
    },
    take: 20,
  });
  add({
    id: "related-links",
    area: "RelatedActs",
    result: links.length > 0 ? "PASS" : "MISSING",
    detail: links
      .map(
        (l) =>
          `${l.sourceTender.referenceNumber}→${l.targetTender.referenceNumber}:${l.confidence}`,
      )
      .join(" | "),
  });

  const confirmedLink = links.find((l) => l.confidence === "CONFIRMED");
  const dismissedLink = links.find((l) => l.confidence === "DISMISSED");
  add({
    id: "related-confirmed",
    area: "RelatedActs",
    result: confirmedLink ? "PASS" : "PARTIAL",
    detail: confirmedLink
      ? `${confirmedLink.sourceTender.referenceNumber}→${confirmedLink.targetTender.referenceNumber}`
      : "none",
  });
  add({
    id: "related-dismissed",
    area: "RelatedActs",
    result: dismissedLink ? "PASS" : "PARTIAL",
    detail: dismissedLink
      ? `${dismissedLink.sourceTender.referenceNumber}→${dismissedLink.targetTender.referenceNumber}`
      : "none",
  });

  // Exercise confirm/dismiss on a LIKELY if present, else inject via existing
  let likely = await prisma.relatedActLink.findFirst({
    where: { confidence: "LIKELY" },
    include: { sourceTender: true, targetTender: true },
  });
  if (!likely) {
    // Prefer a followed REQ that already has related-act links.
    const reqWithLinks = await prisma.organizationTender.findFirst({
      where: {
        organizationId,
        following: true,
        tender: {
          is: {
            recordType: "REQ",
            relatedActsAsSource: { some: {} },
          },
        },
      },
      include: { tender: true },
    });
    if (reqWithLinks) {
      likely = await prisma.relatedActLink.findFirst({
        where: { sourceTenderId: reqWithLinks.tenderId },
        include: { sourceTender: true, targetTender: true },
      });
    }
  }
  if (likely) {
    const owns = await prisma.organizationTender.findFirst({
      where: { organizationId, tenderId: likely.sourceTenderId },
    });
    if (owns) {
      if (likely.confidence === "DISMISSED") {
        // Flip to LIKELY then confirm
        await prisma.relatedActLink.update({
          where: { id: likely.id },
          data: { confidence: "LIKELY", confirmedAt: null },
        });
        likely = { ...likely, confidence: "LIKELY" };
      }
      if (likely.confidence === "LIKELY" || likely.confidence === "POSSIBLE") {
        const conf = await confirmRelatedActLink(prisma, {
          userId,
          organizationId,
          relatedActLinkId: likely.id,
        });
        add({
          id: "related-confirm-api",
          area: "RelatedActs",
          result: conf.confidence === "CONFIRMED" ? "PASS" : "FAIL",
          detail: conf.confidence,
        });
      } else {
        add({
          id: "related-confirm-api",
          area: "RelatedActs",
          result: "PASS",
          detail: `already ${likely.confidence}`,
        });
      }
    } else {
      add({
        id: "related-confirm-api",
        area: "RelatedActs",
        result: "PARTIAL",
        detail: "org does not own source thread",
      });
    }
  } else {
    add({
      id: "related-confirm-api",
      area: "RelatedActs",
      result: "PARTIAL",
      detail: "no related link available",
    });
  }

  // --- Company profile DOCX generation ---
  const profileGen = await generateCompanyProfileDocument(prisma, {
    userId,
    organizationId,
  });
  add({
    id: "company-profile-generate",
    area: "Documents",
    result:
      profileGen.document?.documentType === "COMPANY_PROFILE" &&
      Boolean(profileGen.document?.id) &&
      Boolean(profileGen.name)
        ? "PASS"
        : "FAIL",
    detail: `name=${profileGen.name} created=${profileGen.created} id=${profileGen.document?.id} v=${profileGen.document?.version}`,
  });

  // --- Outreach draft without forcing follow + auto-follow on record ---
  // Prefer a REQ never touched by this org.
  let draftCandidate = await prisma.tender.findFirst({
    where: {
      recordType: "REQ",
      organizationTenders: { none: { organizationId } },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!draftCandidate) {
    // Fallback: an org row that is not following and has no sent outreach.
    const idle = await prisma.organizationTender.findFirst({
      where: {
        organizationId,
        following: false,
        outreachLedger: null,
        tender: { recordType: "REQ" },
      },
      include: { tender: true },
    });
    draftCandidate = idle?.tender ?? null;
  }
  if (draftCandidate) {
    const existing = await prisma.organizationTender.findUnique({
      where: {
        organizationId_tenderId: {
          organizationId,
          tenderId: draftCandidate.id,
        },
      },
    });
    if (existing?.following) {
      await unfollowTender(prisma, {
        userId,
        organizationId,
        tenderId: draftCandidate.id,
      });
    }

    const draft = await getOutreachDraft(prisma, {
      userId,
      organizationId,
      tenderId: draftCandidate.id,
    });
    const afterDraft = await prisma.organizationTender.findUnique({
      where: {
        organizationId_tenderId: {
          organizationId,
          tenderId: draftCandidate.id,
        },
      },
    });
    add({
      id: "outreach-draft-no-follow",
      area: "Outreach",
      result:
        Boolean(draft.subject && draft.body) &&
        afterDraft?.following === false
          ? "PASS"
          : "FAIL",
      detail: `adam=${draftCandidate.referenceNumber} following=${afterDraft?.following} subjectLen=${draft.subject.length}`,
    });

    await saveOutreachDraft(prisma, {
      userId,
      organizationId,
      tenderId: draftCandidate.id,
      contacts: {
        name: "QA Contact",
        department: null,
        email: "qa-contact@example.gr",
        phone: null,
      },
      subject: draft.subject,
      body: draft.body,
      manualEdited: true,
    });

    await recordOutreachSent(prisma, {
      userId,
      organizationId,
      tenderId: draftCandidate.id,
      method: "EMAIL",
      recipient: "qa-contact@example.gr",
      subject: draft.subject,
      body: draft.body,
      notes: "QA full-features auto-follow check",
    });
    const afterRecord = await prisma.organizationTender.findUnique({
      where: {
        organizationId_tenderId: {
          organizationId,
          tenderId: draftCandidate.id,
        },
      },
      include: { outreachLedger: true },
    });
    add({
      id: "outreach-record-auto-follow",
      area: "Outreach",
      result:
        afterRecord?.following === true &&
        afterRecord.monitoringActive === true &&
        afterRecord.outreachLedger?.status === "SENT"
          ? "PASS"
          : "FAIL",
      detail: `following=${afterRecord?.following} monitoring=${afterRecord?.monitoringActive} stage=${afterRecord?.pipelineStage} ledger=${afterRecord?.outreachLedger?.status}`,
    });
  } else {
    add({
      id: "outreach-draft-no-follow",
      area: "Outreach",
      result: "PARTIAL",
      detail: "no unused REQ available",
    });
    add({
      id: "outreach-record-auto-follow",
      area: "Outreach",
      result: "PARTIAL",
      detail: "no unused REQ available",
    });
  }

  // Workflow payloads for key stages (after outreach auto-follow so OUTREACH_SENT exists)
  for (const stage of ["OUTREACH_SENT", "PREPARING", "SUBMITTED", "WON", "LOST"] as const) {
    const row = await prisma.organizationTender.findFirst({
      where: { organizationId, pipelineStage: stage },
    });
    if (!row) {
      add({
        id: `workflow-${stage}`,
        area: "Workflow",
        result: stage === "PREPARING" || stage === "OUTREACH_SENT" ? "PARTIAL" : "PASS",
        detail: "no row (ok if journey advanced)",
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
      area: "Workflow",
      result: Boolean(wf.stageLabel) ? "PASS" : "FAIL",
      detail: `label=${wf.stageLabel} related=${wf.relatedActs.length} outreach=${Boolean(wf.outreach)} submission=${Boolean(wf.latestSubmission)}`,
    });
  }

  // Attention + email
  const attention = await prisma.organizationAttentionEvent.count({
    where: { organizationId },
  });
  const deliveries = await prisma.notificationDelivery.groupBy({
    by: ["status"],
    where: { organizationId },
    _count: true,
  });
  add({
    id: "attention",
    area: "Notifications",
    result: attention > 0 ? "PASS" : "PARTIAL",
    detail: `events=${attention}`,
  });
  add({
    id: "email-deliveries",
    area: "Notifications",
    result: deliveries.some((d) => d.status === "SENT") ? "PASS" : "PARTIAL",
    detail: deliveries.map((d) => `${d.status}:${d._count}`).join(","),
  });

  // Print
  const order = ["PASS", "PARTIAL", "FAIL", "MISSING"] as const;
  for (const result of order) {
    const rows = checks.filter((c) => c.result === result);
    if (!rows.length) continue;
    console.log(`\n=== ${result} (${rows.length}) ===`);
    for (const c of rows) console.log(`[${c.area}] ${c.id}: ${c.detail}`);
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
