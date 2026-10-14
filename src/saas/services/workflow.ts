import type { PipelineStage, PrismaClient } from "@prisma/client";
import { requireOrgMembership } from "../auth/org-context.js";
import { notFound } from "../errors.js";
import { ensureTenderWorkspace } from "./workspace.js";

/**
 * Timeline entries describe facts that already happened. Anything still
 * expected belongs to `nextAction` / `expectedDevelopment`.
 */
export type WorkflowTimelineItem = {
  kind: "official" | "organization";
  key: string;
  title: string;
  subtitle?: string | null;
  adam?: string | null;
  at: string | null;
  isNew?: boolean;
};

export type WorkflowNextAction = {
  code: string;
  label: string;
  description: string;
};

export type WorkflowExpectedDevelopment = {
  code: string;
  label: string;
  description: string;
} | null;

const ORGANIZATION_EVENT_LABELS: Record<string, string> = {
  FOLLOWED: "Ξεκίνησε παρακολούθηση",
  UNFOLLOWED: "Σταμάτησε η παρακολούθηση",
  OUTREACH_SENT: "Καταγράφηκε Εκδήλωση Ενδιαφέροντος",
  PREPARATION_STARTED: "Ξεκίνησε η προετοιμασία",
  SUBMITTED: "Καταγράφηκε υποβολή",
  RESULT_CONFIRMED: "Επιβεβαιώθηκε αποτέλεσμα",
  RELATED_ACT_CONFIRMED: "Επιβεβαιώθηκε σχετική πράξη",
  RELATED_ACT_DISMISSED: "Απορρίφθηκε πιθανή σχετική πράξη",
};

const expectedDevelopmentFor = (input: {
  hasSubmission: boolean;
  hasOutreach: boolean;
  relatedProcCount: number;
  recordType: string;
  monitoringActive: boolean;
  referenceNumber?: string | null;
}): WorkflowExpectedDevelopment => {
  if (!input.monitoringActive) return null;
  const ref = input.referenceNumber ?? "";
  if (ref.startsWith("TED:")) {
    return {
      code: "TED_UPDATES",
      label: "Ενημερώσεις TED",
      description:
        "Παρακολουθούμε την ίδια δημοσίευση TED για αλλαγές προθεσμίας ή corrigenda.",
    };
  }
  if (ref.startsWith("DIAVGEIA:")) {
    return {
      code: "DIAVGEIA",
      label: "Πράξη Διαύγειας",
      description:
        "Αποθηκευμένη δημόσια πράξη Διαύγειας. Δεν ακολουθεί νήμα ΚΗΜΔΗΣ REQ→PROC.",
    };
  }
  if (input.hasSubmission) {
    return {
      code: "AWRD",
      label: "Απόφαση ανάθεσης / σύμβαση",
      description: "Παρακολουθούμε το ΚΗΜΔΗΣ για ανάθεση (AWRD) ή σύμβαση (SYMV).",
    };
  }
  if (input.recordType === "REQ" && input.relatedProcCount === 0) {
    return {
      code: "PROC",
      label: "Επίσημη πρόσκληση (PROC)",
      description: input.hasOutreach
        ? "Έχει καταγραφεί εκδήλωση ενδιαφέροντος — αναμένουμε την επίσημη πρόσκληση."
        : "Αναμένουμε επίσημη πρόσκληση που να σχετίζεται με αυτό το αίτημα.",
    };
  }
  return {
    code: "UPDATES",
    label: "Νέες σχετικές πράξεις",
    description: "Παρακολουθούμε το ΚΗΜΔΗΣ για εξελίξεις στο νήμα.",
  };
};

const pipelineLabel = (stage: PipelineStage): string => {
  switch (stage) {
    case "OUTREACH_SENT":
      return "Εκδήλωση ενδιαφέροντος";
    case "PREPARING":
      return "Προετοιμασία";
    case "SUBMITTED":
      return "Υποβολή καταχωρημένη";
    case "REVIEWING":
      return "Υπό αξιολόγηση";
    case "WON":
      return "Επιτυχία";
    case "LOST":
      return "Απόρριψη";
    case "CLOSED":
      return "Κλειστό";
    case "DISMISSED":
      return "Απορρίφθηκε";
    default:
      return "Παρακολούθηση";
  }
};

export const resolveNextAction = (input: {
  following: boolean;
  monitoringActive: boolean;
  pipelineStage: PipelineStage;
  hasOutreach: boolean;
  hasSubmission: boolean;
  relatedProcCount: number;
  relatedAwardCount: number;
  recordType: string;
}): WorkflowNextAction => {
  if (input.relatedAwardCount > 0 && input.hasSubmission) {
    return {
      code: "REVIEW_AWARD",
      label: "Έλεγχος απόφασης ανάθεσης",
      description: "Δημοσιεύτηκε σχετική απόφαση — ελέγξτε το αποτέλεσμα.",
    };
  }
  if (input.hasSubmission) {
    return {
      code: "WAIT_RESULT",
      label: "Αναμονή αποτελέσματος",
      description: "Παρακολουθούμε το ΚΗΜΔΗΣ για ανάθεση / σύμβαση.",
    };
  }
  const procReady =
    input.recordType === "PROC" || input.relatedProcCount > 0;
  if (procReady && input.pipelineStage === "PREPARING") {
    return {
      code: "RECORD_SUBMISSION",
      label: "Καταγραφή υποβολής",
      description: "Όταν υποβάλετε επίσημα, καταγράψτε την υποβολή εδώ.",
    };
  }
  if (procReady && (input.following || input.relatedProcCount > 0)) {
    return {
      code: "START_PREPARATION",
      label: "Προετοιμασία προσφοράς",
      description:
        input.recordType === "PROC"
          ? "Ενεργή πρόσκληση — ετοιμάστε τον φάκελο και καταγράψτε την υποβολή."
          : "Εντοπίστηκε επίσημη πρόσκληση — ξεκινήστε προετοιμασία.",
    };
  }
  if (input.hasOutreach || input.pipelineStage === "OUTREACH_SENT") {
    return {
      code: "WAIT_PROC",
      label: "Αναμένεται η δημοσίευση σχετικής πρόσκλησης.",
      description: "Παρακολουθούμε το ΚΗΜΔΗΣ για σχετική επίσημη πρόσκληση.",
    };
  }
  if (input.following && input.recordType === "REQ") {
    return {
      code: "RECORD_OUTREACH",
      label: "Καταγραφή εκδήλωσης ενδιαφέροντος",
      description: "Αν επικοινωνήσατε με τον φορέα, καταγράψτε το εδώ.",
    };
  }
  if (input.following) {
    return {
      code: "MONITOR",
      label: "Ενεργή παρακολούθηση",
      description: "Παρακολουθούμε εξελίξεις στο ΚΗΜΔΗΣ.",
    };
  }
  return {
    code: "FOLLOW",
    label: "Παρακολούθηση",
    description: "Προσθέστε τον διαγωνισμό στην παρακολούθηση για να ενημερώνεστε για νέες εξελίξεις.",
  };
};

export const getOrganizationTenderWorkflow = async (
  prisma: PrismaClient,
  input: { userId: string; organizationId: string | null; tenderId: string },
) => {
  const { organizationId } = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );

  const organizationTender = await prisma.organizationTender.findUnique({
    where: {
      organizationId_tenderId: {
        organizationId,
        tenderId: input.tenderId,
      },
    },
    include: {
      tender: true,
      outreachLedger: true,
      submissions: { orderBy: { submittedAt: "desc" } },
      events: { orderBy: { createdAt: "asc" } },
      attentionEvents: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { relatedTender: true },
      },
    },
  });

  if (!organizationTender) {
    const tender = await prisma.tender.findUnique({
      where: { id: input.tenderId },
    });
    if (!tender) throw notFound("tender_not_found");
    return {
      organizationTender: null,
      tender,
      relatedActs: [],
      timeline: [
        {
          kind: "official" as const,
          key: "primary",
          title:
            tender.recordType === "PROC"
              ? "Επίσημη πρόσκληση / προκήρυξη"
              : "Πρωτογενές αίτημα",
          subtitle: tender.title,
          adam: tender.referenceNumber,
          at: (tender.submissionDate ?? tender.firstSeenAt)?.toISOString() ?? null,
        },
      ],
      nextAction: resolveNextAction({
        following: false,
        monitoringActive: false,
        pipelineStage: "NEW",
        hasOutreach: false,
        hasSubmission: false,
        relatedProcCount: 0,
        relatedAwardCount: 0,
        recordType: tender.recordType,
      }),
      expectedDevelopment: null,
      outreach: null,
      latestSubmission: null,
      workspaceDocumentCount: 0,
      stageLabel: pipelineLabel("NEW"),
    };
  }

  const relatedActs = await prisma.relatedActLink.findMany({
    where: {
      sourceTenderId: organizationTender.tenderId,
      confidence: { not: "DISMISSED" },
    },
    include: { targetTender: true },
    orderBy: { createdAt: "asc" },
  });

  const relatedProcCount = relatedActs.filter(
    (link) => link.targetTender.recordType === "PROC",
  ).length;
  const relatedAwardCount = relatedActs.filter(
    (link) =>
      link.targetTender.recordType === "AWRD" ||
      link.relationType.includes("AWRD") ||
      link.relationType.includes("CONTRACT"),
  ).length;

  const hasOutreach =
    organizationTender.outreachLedger?.status === "SENT" ||
    organizationTender.pipelineStage === "OUTREACH_SENT";
  const hasSubmission = organizationTender.submissions.length > 0;

  const unreadAttentionTenderIds = new Set(
    organizationTender.attentionEvents
      .filter((event) => !event.readAt && event.relatedTenderId)
      .map((event) => event.relatedTenderId as string),
  );

  const timeline: WorkflowTimelineItem[] = [
    {
      kind: "official",
      key: "primary",
      title:
        organizationTender.tender.recordType === "PROC"
          ? "Δημοσίευση επίσημης πρόσκλησης"
          : "Δημοσίευση πρωτογενούς αιτήματος",
      subtitle: organizationTender.tender.title,
      adam: organizationTender.tender.referenceNumber,
      at: (
        organizationTender.tender.submissionDate ??
        organizationTender.tender.firstSeenAt
      )?.toISOString(),
    },
  ];

  for (const link of relatedActs) {
    const needsConfirm =
      link.confidence === "LIKELY" || link.confidence === "POSSIBLE";
    const official =
      needsConfirm
        ? link.targetTender.recordType === "PROC"
          ? "Πιθανή σχετική επίσημη πρόσκληση"
          : link.targetTender.recordType === "AWRD"
            ? "Πιθανή σχετική απόφαση ανάθεσης"
            : "Πιθανή σχετική πράξη ΚΗΜΔΗΣ"
        : link.targetTender.recordType === "PROC"
          ? "Δημοσιεύτηκε σχετική επίσημη πρόσκληση"
          : link.targetTender.recordType === "AWRD"
            ? "Δημοσιεύτηκε απόφαση ανάθεσης"
            : "Δημοσιεύτηκε σχετική πράξη ΚΗΜΔΗΣ";
    timeline.push({
      kind: "official",
      key: `rel-${link.id}`,
      title: official,
      subtitle: link.targetTender.title,
      adam: link.targetTender.referenceNumber,
      at: (link.targetTender.submissionDate ?? link.createdAt).toISOString(),
      isNew: unreadAttentionTenderIds.has(link.targetTenderId),
    });
  }

  const outreachMethod = outreachPayload(organizationTender.outreachLedger)?.method;
  // Pair legacy SUBMITTED events (no JSON note) to submissions in time order.
  const unpairedSubmissions = [...organizationTender.submissions].sort(
    (a, b) => a.submittedAt.getTime() - b.submittedAt.getTime(),
  );
  for (const event of organizationTender.events) {
    const label = ORGANIZATION_EVENT_LABELS[event.eventType];
    if (!label) continue;
    let subtitle: string | null = null;
    if (event.eventType === "OUTREACH_SENT") {
      subtitle =
        [outreachMethod, organizationTender.outreachLedger?.recipient]
          .filter(Boolean)
          .join(" · ") || null;
    } else if (event.eventType === "RESULT_CONFIRMED") {
      try {
        const parsed = JSON.parse(event.note ?? "{}") as { result?: string };
        subtitle =
          parsed.result === "WON"
            ? "Επιτυχία"
            : parsed.result === "LOST"
              ? "Ανεπιτυχές"
              : null;
      } catch {
        subtitle = event.note;
      }
    } else if (event.eventType === "SUBMITTED") {
      const fromNote = parseSubmissionEventNote(event.note);
      if (fromNote) {
        subtitle = submissionSubtitle(fromNote);
        if (fromNote.submissionId) {
          const idx = unpairedSubmissions.findIndex((row) => row.id === fromNote.submissionId);
          if (idx >= 0) unpairedSubmissions.splice(idx, 1);
        }
      } else {
        const nearestIdx = unpairedSubmissions.findIndex(
          (row) =>
            Math.abs(row.submittedAt.getTime() - event.createdAt.getTime()) < 120_000,
        );
        const snap =
          nearestIdx >= 0
            ? unpairedSubmissions.splice(nearestIdx, 1)[0]
            : unpairedSubmissions.shift();
        subtitle = snap
          ? submissionSubtitle({
              submissionMethod: snap.submissionMethod,
              externalReference: snap.externalReference,
              amountWithoutVat: snap.amountWithoutVat,
            })
          : null;
      }
    }
    timeline.push({
      kind: "organization",
      key: `event-${event.id}`,
      title: label,
      subtitle,
      at: event.createdAt.toISOString(),
    });
  }

  timeline.sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));

  const nextAction = resolveNextAction({
    following: organizationTender.following,
    monitoringActive: organizationTender.monitoringActive,
    pipelineStage: organizationTender.pipelineStage,
    hasOutreach,
    hasSubmission,
    relatedProcCount,
    relatedAwardCount,
    recordType: organizationTender.tender.recordType,
  });

  const workspaceDocumentCount = await prisma.tenderWorkspaceDocumentRef.count({
    where: { workspace: { organizationTenderId: organizationTender.id } },
  });

  return {
    organizationTender,
    tender: organizationTender.tender,
    relatedActs,
    timeline,
    nextAction,
    expectedDevelopment: expectedDevelopmentFor({
      hasSubmission,
      hasOutreach,
      relatedProcCount,
      recordType: organizationTender.tender.recordType,
      monitoringActive: organizationTender.monitoringActive,
      referenceNumber: organizationTender.tender.referenceNumber,
    }),
    latestSubmission: organizationTender.submissions[0]
      ? {
          id: organizationTender.submissions[0].id,
          submittedAt: organizationTender.submissions[0].submittedAt,
          submissionMethod: organizationTender.submissions[0].submissionMethod,
          externalReference: organizationTender.submissions[0].externalReference,
          amountWithoutVat: organizationTender.submissions[0].amountWithoutVat,
          notes: organizationTender.submissions[0].notes,
          submittedByUserId: organizationTender.submissions[0].submittedByUserId,
          result: organizationTender.submissions[0].result,
        }
      : null,
    outreach: organizationTender.outreachLedger
      ? {
          sentAt: organizationTender.outreachLedger.sentAt,
          recipient: organizationTender.outreachLedger.recipient,
          notes: organizationTender.outreachLedger.notes,
          method: outreachMethod ?? null,
          externalReference:
            outreachPayload(organizationTender.outreachLedger)?.externalReference ??
            null,
          documents:
            outreachPayload(organizationTender.outreachLedger)?.documents ?? [],
        }
      : null,
    priorityMonitoring: {
      active: organizationTender.monitoringPriority === "PRIORITY",
      since: organizationTender.priorityMonitoringSince?.toISOString() ?? null,
      reason: organizationTender.priorityMonitoringReason ?? null,
      lastCheckAt: organizationTender.lastPriorityCheckAt?.toISOString() ?? null,
      nextCheckAt: organizationTender.nextPriorityCheckAt?.toISOString() ?? null,
    },
    workspaceDocumentCount,
    stageLabel: pipelineLabel(organizationTender.pipelineStage),
  };
};

type OutreachPayload = {
  method?: string | null;
  externalReference?: string | null;
  documents?: Array<{ documentId: string; name: string; version: number | null }>;
};

const SUBMISSION_METHOD_LABELS: Record<string, string> = {
  PORTAL: "Ηλεκτρονική πλατφόρμα",
  EMAIL: "Email",
  PHYSICAL: "Φυσική παράδοση",
  OTHER: "Άλλο",
  ESIDIS: "ΕΣΗΔΗΣ",
  UNKNOWN: "Άγνωστο",
};

const submissionMethodLabel = (code: string | null | undefined): string => {
  if (!code) return "—";
  return SUBMISSION_METHOD_LABELS[code] ?? code;
};

type SubmissionSnapshot = {
  submissionId?: string;
  submissionMethod: string;
  externalReference: string | null;
  amountWithoutVat: number | null;
};

const parseSubmissionEventNote = (note: string | null | undefined): SubmissionSnapshot | null => {
  if (!note?.trim().startsWith("{")) return null;
  try {
    const raw = JSON.parse(note) as Partial<SubmissionSnapshot>;
    if (!raw.submissionMethod) return null;
    return {
      submissionId: raw.submissionId,
      submissionMethod: String(raw.submissionMethod),
      externalReference:
        raw.externalReference == null ? null : String(raw.externalReference),
      amountWithoutVat:
        typeof raw.amountWithoutVat === "number" ? raw.amountWithoutVat : null,
    };
  } catch {
    return null;
  }
};

const submissionSubtitle = (
  submission: SubmissionSnapshot | undefined | null,
): string | null => {
  if (!submission) return null;
  const amount =
    submission.amountWithoutVat == null
      ? null
      : `${submission.amountWithoutVat} €`;
  const parts = [
    submissionMethodLabel(submission.submissionMethod),
    submission.externalReference,
    amount,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
};

const outreachPayload = (
  ledger: { payload: unknown } | null | undefined,
): OutreachPayload | null => {
  if (!ledger?.payload || typeof ledger.payload !== "object") return null;
  return ledger.payload as OutreachPayload;
};

export const startPreparation = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string | null;
    tenderId: string;
  },
) => {
  const { organizationId } = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );
  const orgTender = await prisma.organizationTender.findUnique({
    where: {
      organizationId_tenderId: {
        organizationId,
        tenderId: input.tenderId,
      },
    },
  });
  if (!orgTender) throw notFound("organization_tender_not_found");

  const tender = await prisma.tender.findUniqueOrThrow({
    where: { id: orgTender.tenderId },
  });
  await ensureTenderWorkspace(prisma, {
    organizationId,
    organizationTenderId: orgTender.id,
    name: tender.referenceNumber,
  });

  const alreadyStarted = await prisma.tenderEvent.findFirst({
    where: {
      organizationTenderId: orgTender.id,
      eventType: "PREPARATION_STARTED",
    },
  });
  const lockedStage =
    orgTender.pipelineStage === "SUBMITTED" ||
    orgTender.pipelineStage === "WON" ||
    orgTender.pipelineStage === "LOST" ||
    orgTender.pipelineStage === "CLOSED";
  if (alreadyStarted || lockedStage) {
    if (lockedStage) return orgTender;
    if (orgTender.pipelineStage === "PREPARING") return orgTender;
  }

  return prisma.$transaction(async (tx) => {
    const row = await tx.organizationTender.update({
      where: { id: orgTender.id },
      data: {
        pipelineStage: "PREPARING",
        operationalStatus:
          orgTender.operationalStatus === "SUBMITTED"
            ? orgTender.operationalStatus
            : "READY",
        following: true,
        monitoringActive: true,
        monitoringStoppedAt: null,
      },
    });
    if (!alreadyStarted) {
      await tx.tenderEvent.create({
        data: {
          organizationId,
          organizationTenderId: orgTender.id,
          eventType: "PREPARATION_STARTED",
          note: "User started preparation",
        },
      });
    }
    return row;
  });
};

export const listMonitoringPipeline = async (
  prisma: PrismaClient,
  input: { userId: string; organizationId: string | null },
) => {
  const { organizationId } = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );

  const rows = await prisma.organizationTender.findMany({
    where: {
      organizationId,
      OR: [{ following: true }, { monitoringActive: true }],
    },
    orderBy: { updatedAt: "desc" },
    include: {
      tender: true,
      outreachLedger: true,
      submissions: { orderBy: { submittedAt: "desc" }, take: 1 },
      attentionEvents: {
        where: { readAt: null },
        orderBy: { createdAt: "desc" },
        take: 3,
        include: { relatedTender: true },
      },
    },
  });

  const sourceIds = rows.map((row) => row.tenderId);
  const relatedLinks =
    sourceIds.length === 0
      ? []
      : await prisma.relatedActLink.findMany({
          where: {
            sourceTenderId: { in: sourceIds },
            confidence: { not: "DISMISSED" },
          },
          include: { targetTender: true },
        });

  const relatedBySource = new Map<string, typeof relatedLinks>();
  for (const link of relatedLinks) {
    const list = relatedBySource.get(link.sourceTenderId) ?? [];
    list.push(link);
    relatedBySource.set(link.sourceTenderId, list);
  }

  return rows.map((row) => {
    const related = relatedBySource.get(row.tenderId) ?? [];
    const relatedProcCount = related.filter(
      (link) => link.targetTender.recordType === "PROC",
    ).length;
    const relatedAwardCount = related.filter(
      (link) => link.targetTender.recordType === "AWRD",
    ).length;
    const hasOutreach =
      row.outreachLedger?.status === "SENT" || row.pipelineStage === "OUTREACH_SENT";
    const hasSubmission = row.submissions.length > 0;
    const nextAction = resolveNextAction({
      following: row.following,
      monitoringActive: row.monitoringActive,
      pipelineStage: row.pipelineStage,
      hasOutreach,
      hasSubmission,
      relatedProcCount,
      relatedAwardCount,
      recordType: row.tender.recordType,
    });
    const OFFICIAL_ATTENTION = new Set([
      "RELATED_PROC_DISCOVERED",
      "RELATED_AWARD_DISCOVERED",
      "RELATED_APPROVED_REQUEST_DISCOVERED",
      "RELATED_CONTRACT_DISCOVERED",
      "DEADLINE_CHANGED",
    ]);
    const officialAttention = row.attentionEvents.filter((event) =>
      OFFICIAL_ATTENTION.has(event.type),
    );
    const latestDevelopment =
      officialAttention[0]?.title ??
      (relatedProcCount > 0
        ? "Εντοπίστηκε σχετική επίσημη πρόσκληση"
        : null);

    let filterBucket:
      | "FOLLOWING"
      | "OUTREACH_SENT"
      | "WAITING_PROC"
      | "PREPARING"
      | "SUBMITTED"
      | "NEW_DEVELOPMENT"
      | "COMPLETED" = "FOLLOWING";

    const hasRelatedDevelopment =
      relatedProcCount > 0 ||
      relatedAwardCount > 0 ||
      officialAttention.length > 0;

    if (row.pipelineStage === "WON" || row.pipelineStage === "LOST" || row.pipelineStage === "CLOSED") {
      filterBucket = "COMPLETED";
    } else if (hasSubmission || row.pipelineStage === "SUBMITTED") {
      filterBucket = hasRelatedDevelopment ? "NEW_DEVELOPMENT" : "SUBMITTED";
    } else if (row.pipelineStage === "PREPARING") {
      filterBucket = "PREPARING";
    } else if (hasRelatedDevelopment) {
      filterBucket = "NEW_DEVELOPMENT";
    } else if (hasOutreach) {
      filterBucket = "WAITING_PROC";
    } else if (row.following) {
      filterBucket = "FOLLOWING";
    }

    return {
      id: row.id,
      tenderId: row.tenderId,
      following: row.following,
      monitoringActive: row.monitoringActive,
      monitoringReason: row.monitoringReason,
      pipelineStage: row.pipelineStage,
      stageLabel: pipelineLabel(row.pipelineStage),
      operationalStatus: row.operationalStatus,
      latestRelatedActAt: row.latestRelatedActAt,
      lastRelatedCheckAt: row.lastRelatedCheckAt,
      updatedAt: row.updatedAt,
      filterBucket,
      nextAction,
      latestDevelopment,
      hasOutreach,
      hasSubmission,
      relatedProcCount,
      relatedAwardCount,
      unreadAttentionCount: officialAttention.length,
      tender: row.tender,
      outreachLedger: row.outreachLedger,
      latestSubmission: row.submissions[0] ?? null,
      relatedActs: related,
    };
  });
};
