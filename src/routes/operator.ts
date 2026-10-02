import { Hono } from "hono";
import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import type { Config } from "../config.js";
import type { Repository, TenderRow } from "../db/repository.js";
import { buildDecisionTrace } from "../operator/decision-trace.js";
import {
  deriveReqMonitoringState,
  getGreekMonitoringRecommendedAction,
  getGreekMonitoringStateLabel,
  primaryRelatedProc,
  watchForRelatedProc,
  type MonitoringState,
} from "../operator/outreach-monitoring.js";
import {
  DRAFT_STATUSES,
  DOCUMENT_ITEM_STATUSES,
  OPERATIONAL_STATUSES,
  SUBMISSION_METHODS,
  SUBMISSION_RESULTS,
  TENDER_EVENT_TYPES,
  type TenderDrafts,
} from "../operator/types.js";

type OperatorEnv = {
  Variables: {
    operatorOk: boolean;
  };
};

const draftPackageSchema = z.object({
  status: z.enum(DRAFT_STATUSES),
  subject: z.string().nullable().optional(),
  body: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  amountWithoutVat: z.number().nullable().optional(),
  attachments: z.array(z.string()).optional(),
  updatedAt: z.string().nullable().optional(),
  sentAt: z.string().nullable().optional(),
  recipient: z.string().nullable().optional(),
});

const draftsSchema = z.object({
  outreach: draftPackageSchema.optional(),
  technical: draftPackageSchema.optional(),
  economic: draftPackageSchema.optional(),
  declarations: draftPackageSchema.optional(),
});

const recordOutreachSchema = z.object({
  sentAt: z.string().min(1),
  recipient: z.string().nullable().optional(),
  subject: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const patchTenderSchema = z.object({
  contact_name: z.string().nullable().optional(),
  contact_department: z.string().nullable().optional(),
  contact_email: z.string().nullable().optional(),
  contact_phone: z.string().nullable().optional(),
  submission_method: z.enum(SUBMISSION_METHODS).nullable().optional(),
  submission_email: z.string().nullable().optional(),
  submission_portal: z.string().nullable().optional(),
  submission_instructions: z.string().nullable().optional(),
  scope_summary: z.string().nullable().optional(),
  document_checklist: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        status: z.enum(DOCUMENT_ITEM_STATUSES),
        note: z.string().nullable().optional(),
      }),
    )
    .optional(),
  drafts: draftsSchema.optional(),
});

const statusSchema = z.object({
  status: z.enum(OPERATIONAL_STATUSES),
  note: z.string().nullable().optional(),
});

const eventSchema = z.object({
  event_type: z.enum(TENDER_EVENT_TYPES),
  note: z.string().nullable().optional(),
});

const submissionSchema = z.object({
  submitted_at: z.string().min(1),
  submission_method: z.enum([
    "EMAIL",
    "PORTAL",
    "ESIDIS",
    "PHYSICAL",
    "OTHER",
  ]),
  recipient: z.string().nullable().optional(),
  subject: z.string().nullable().optional(),
  amount_without_vat: z.number().nullable().optional(),
  amount_with_vat: z.number().nullable().optional(),
  attachments: z.array(z.string()).optional(),
  external_reference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const settingsSchema = z.object({
  company: z.object({
    legal_name: z.string(),
    brand_name: z.string(),
    trading_name: z.string(),
    contact_name: z.string(),
    email: z.string(),
    phone: z.string(),
    address: z.string(),
    vat_number: z.string(),
    tax_office: z.string(),
    gemi_number: z.string(),
    distinctive_title_confirmed: z.boolean(),
    legal_form: z.string().default(""),
    website: z.string().default(""),
    portfolio_references: z.string().default(""),
    tech_stack: z.string().default(""),
    public_sector_notes: z.string().default(""),
  }),
  drive: z.object({
    company_documents_folder_url: z.string(),
    templates_folder_url: z.string(),
    submissions_folder_url: z.string(),
  }),
  documents: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      drive_url: z.string(),
      expiry_date: z.string().nullable(),
      status: z.enum(DOCUMENT_ITEM_STATUSES),
    }),
  ),
});

const parseRelationReasons = (
  raw: string | null,
): Array<{ points: number; label: string }> => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const row = item as { points?: unknown; label?: unknown };
        if (typeof row.label !== "string") return null;
        return {
          points: typeof row.points === "number" ? row.points : 0,
          label: row.label,
        };
      })
      .filter((v): v is { points: number; label: string } => Boolean(v));
  } catch {
    return [];
  }
};

const serializeTender = (row: TenderRow, repo: Repository) => {
  const drafts = repo.resolveDrafts(row);
  const checklist = repo.parseChecklist(row.document_checklist_json);
  const submission = repo.getSubmissionForTender(row.reference_number);
  const events = repo.listEvents(row.reference_number);
  const linkedProcs =
    row.record_type === "REQ"
      ? repo.listLinkedProcsForReq(row.reference_number).map((proc) => ({
          referenceNumber: proc.reference_number,
          title: proc.title,
          organization: proc.organization,
          parentTenderId: proc.parent_tender_id,
          relationCandidateId: proc.relation_candidate_id,
          relationConfidence: proc.relation_confidence,
          relationMethod: proc.relation_method,
          relationScore: proc.relation_score,
          relationReasons: parseRelationReasons(proc.relation_reasons_json),
          invitationType: proc.invitation_type,
          invitedVendorName: proc.invited_vendor_name,
          ourInvitationStatus: proc.our_invitation_status,
          linked:
            proc.parent_tender_id === row.reference_number &&
            Boolean(proc.parent_tender_id),
          possible:
            proc.relation_candidate_id === row.reference_number &&
            !proc.parent_tender_id,
        }))
      : [];

  const parentRow = row.parent_tender_id
    ? repo.findByAdam(row.parent_tender_id)
    : null;
  const candidateRow = row.relation_candidate_id
    ? repo.findByAdam(row.relation_candidate_id)
    : null;

  return {
    referenceNumber: row.reference_number,
    recordType: row.record_type,
    title: row.title,
    organization: row.organization,
    submissionDate: row.submission_date,
    signedDate: row.signed_date,
    finalSubmissionDate: row.final_submission_date,
    budgetWithoutVat: row.budget_without_vat,
    budgetWithVat: row.budget_with_vat,
    cpvs: safeJsonArray(row.cpvs),
    score: row.score,
    stage: row.stage,
    targetedSupplier: Boolean(row.targeted_supplier),
    nonInvitedOffersRejected: Boolean(row.non_invited_offers_rejected),
    pdfTextStatus: row.pdf_text_status,
    officialPdfUrl: row.official_pdf_url,
    publicKimdisUrl: row.public_kimdis_url,
    scoreReasons: safeJsonArray(row.score_reasons),
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    notifiedAt: row.notified_at,
    webRelevant: Boolean(row.web_relevant),
    webCategory: row.web_category,
    relevanceStatus: row.relevance_status,
    ignoreReason: row.ignore_reason,
    reviewReason: row.review_reason,
    alertEligibilityReason: row.alert_eligibility_reason,
    classificationVersion: row.classification_version,
    currentStatus: row.current_status ?? "NEW",
    contact: {
      name: row.contact_name,
      department: row.contact_department,
      email: row.contact_email,
      phone: row.contact_phone,
    },
    submissionInfo: {
      method: row.submission_method ?? "UNKNOWN",
      email: row.submission_email,
      portal: row.submission_portal,
      instructions: row.submission_instructions,
    },
    scopeSummary: row.scope_summary,
    documentChecklist: checklist,
    drafts,
    approvalStatus: row.approval_status,
    approvedAt: row.approved_at,
    decisionTrace: buildDecisionTrace(row),
    relation: {
      parentTenderId: row.parent_tender_id,
      parentTitle: parentRow?.title ?? null,
      candidateTenderId: row.relation_candidate_id,
      candidateTitle: candidateRow?.title ?? null,
      confidence: row.relation_confidence,
      method: row.relation_method,
      score: row.relation_score,
      reasons: parseRelationReasons(row.relation_reasons_json),
    },
    invitation: {
      type: row.invitation_type,
      invitedVendorName: row.invited_vendor_name,
      ourStatus: row.our_invitation_status,
    },
    linkedProcs,
    monitoring: (() => {
      if (row.record_type !== "REQ") {
        return {
          watchForRelatedProc: false,
          state: "NONE" as MonitoringState,
          stateLabel: "—",
          recommendedAction: "—",
          relatedProc: null as null,
        };
      }
      const summaries = linkedProcs.map((p) => ({
        referenceNumber: p.referenceNumber,
        linked: p.linked,
        possible: p.possible,
        invitationType: p.invitationType,
        ourInvitationStatus: p.ourInvitationStatus,
        invitedVendorName: p.invitedVendorName,
      }));
      const state = deriveReqMonitoringState({
        outreachStatus: drafts.outreach.status,
        linkedProcs: summaries,
      });
      const related = primaryRelatedProc(summaries);
      return {
        watchForRelatedProc: watchForRelatedProc(drafts),
        state,
        stateLabel: getGreekMonitoringStateLabel(state),
        recommendedAction: getGreekMonitoringRecommendedAction(state),
        relatedProc: related
          ? {
              referenceNumber: related.referenceNumber,
              linked: related.linked,
              possible: related.possible,
              invitationType: related.invitationType,
              ourInvitationStatus: related.ourInvitationStatus,
              invitedVendorName: related.invitedVendorName ?? null,
            }
          : null,
      };
    })(),
    submission: submission
      ? {
          id: submission.id,
          submittedAt: submission.submitted_at,
          method: submission.submission_method,
          recipient: submission.recipient,
          subject: submission.subject,
          amountWithoutVat: submission.amount_without_vat,
          amountWithVat: submission.amount_with_vat,
          externalReference: submission.external_reference,
          result: submission.result,
          notes: submission.notes,
        }
      : null,
    events: events.map((e) => ({
      id: e.id,
      eventType: e.event_type,
      note: e.note,
      createdAt: e.created_at,
    })),
    sendingConfigured: false,
  };
};

const safeJsonArray = (raw: string | null): string[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
};

const mergeDrafts = (
  current: TenderDrafts,
  patch: z.infer<typeof draftsSchema>,
): TenderDrafts => {
  const now = new Date().toISOString();
  const mergeOne = (
    base: TenderDrafts[keyof TenderDrafts],
    next?: z.infer<typeof draftPackageSchema>,
  ) => {
    if (!next) return base;
    return { ...base, ...next, updatedAt: next.updatedAt ?? now };
  };

  return {
    outreach: mergeOne(current.outreach, patch.outreach),
    technical: mergeOne(current.technical, patch.technical),
    economic: mergeOne(current.economic, patch.economic),
    declarations: mergeOne(current.declarations, patch.declarations),
  };
};

export const createOperatorRoutes = (deps: {
  operatorToken: string | undefined;
  adminToken: string;
  allowedOrigins: string[];
  config: Config;
  repo: Repository;
}) => {
  const app = new Hono<OperatorEnv>();

  // Prefer OPERATOR_API_TOKEN; fall back to ADMIN_TOKEN so desktop can connect
  // even if Coolify OPERATOR_API_TOKEN is missing/mismatched.
  const acceptedTokens = new Set(
    [deps.operatorToken, deps.adminToken]
      .filter((value): value is string => Boolean(value && value.trim()))
      .map((value) => value.trim()),
  );

  app.use(
    "/api/operator/*",
    cors({
      origin: (origin) => {
        if (!origin) return deps.allowedOrigins[0] ?? "http://localhost:5173";
        return deps.allowedOrigins.includes(origin) ? origin : "";
      },
      allowMethods: ["GET", "POST", "PATCH", "PUT", "OPTIONS"],
      allowHeaders: [
        "Content-Type",
        "Authorization",
        "X-Operator-Token",
        "X-Admin-Token",
      ],
      maxAge: 600,
    }),
  );

  const requireOperator = createMiddleware(async (c, next) => {
    if (acceptedTokens.size === 0) {
      return c.json(
        {
          error: "operator_api_not_configured",
          message: "OPERATOR_API_TOKEN or ADMIN_TOKEN is required",
        },
        503,
      );
    }

    // Check all auth headers. Some proxies strip/overwrite X-Operator-Token;
    // empty values must not block fallback to X-Admin-Token / Bearer.
    const candidates = [
      c.req.header("X-Operator-Token"),
      c.req.header("X-Admin-Token"),
      c.req.header("Authorization")?.replace(/^Bearer\s+/i, ""),
    ]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value));

    const ok = candidates.some((token) => acceptedTokens.has(token));
    if (!ok) {
      return c.json(
        {
          error: "unauthorized",
          message:
            "Operator authentication failed. Use OPERATOR_API_TOKEN or ADMIN_TOKEN.",
        },
        401,
      );
    }

    await next();
  });

  app.use("/api/operator/*", requireOperator);

  app.get("/api/operator/opportunities", (c) => {
    const filterRaw = (c.req.query("filter") ?? "all").toLowerCase();
    const allowed = new Set([
      "all",
      "new",
      "review",
      "ready",
      "req",
      "proc",
      "outreach_sent",
      "monitored",
      "formal",
      "closed",
    ]);
    const filter = allowed.has(filterRaw)
      ? (filterRaw as
          | "all"
          | "new"
          | "review"
          | "ready"
          | "req"
          | "proc"
          | "outreach_sent"
          | "monitored"
          | "formal"
          | "closed")
      : "all";

    const rows = deps.repo.listOpportunities(filter);
    const items = rows
      .map((row) => {
        const drafts = deps.repo.resolveDrafts(row);
        const linkedProcs =
          row.record_type === "REQ"
            ? deps.repo.listLinkedProcsForReq(row.reference_number)
            : [];
        const linkedSummaries = linkedProcs.map((p) => ({
          referenceNumber: p.reference_number,
          linked: p.parent_tender_id === row.reference_number,
          possible:
            p.relation_candidate_id === row.reference_number &&
            !p.parent_tender_id,
          invitationType: p.invitation_type,
          ourInvitationStatus: p.our_invitation_status,
          invitedVendorName: p.invited_vendor_name,
        }));
        const linkedNotInvited = linkedSummaries.some(
          (p) =>
            p.linked &&
            p.invitationType === "TARGETED" &&
            p.ourInvitationStatus === "NOT_INVITED",
        );
        const possibleRelation = linkedSummaries.some((p) => p.possible);
        const monitoringState =
          row.record_type === "REQ"
            ? deriveReqMonitoringState({
                outreachStatus: drafts.outreach.status,
                linkedProcs: linkedSummaries,
              })
            : ("NONE" as MonitoringState);
        const related = primaryRelatedProc(linkedSummaries);
        const eventsAsc = deps.repo.listEvents(row.reference_number);
        const lastEvent = eventsAsc[eventsAsc.length - 1] ?? null;

        return {
          referenceNumber: row.reference_number,
          score: row.score,
          category: row.web_category,
          organization: row.organization,
          title: row.title,
          recordType: row.record_type,
          budgetWithoutVat: row.budget_without_vat,
          deadline: row.final_submission_date,
          status: row.current_status ?? "NEW",
          detectedAt: row.first_seen_at,
          publishedAt: row.submission_date ?? row.signed_date ?? null,
          relevanceStatus: row.relevance_status,
          invitationType: row.invitation_type,
          ourInvitationStatus: row.our_invitation_status,
          outreachStatus: drafts.outreach.status,
          outreachSentAt: drafts.outreach.sentAt ?? null,
          outreachRecipient: drafts.outreach.recipient ?? null,
          outreachSubject: drafts.outreach.subject ?? null,
          watchForRelatedProc: watchForRelatedProc(drafts),
          monitoringState,
          monitoringStateLabel: getGreekMonitoringStateLabel(monitoringState),
          monitoringRecommendedAction:
            getGreekMonitoringRecommendedAction(monitoringState),
          relatedProcAdam: related?.referenceNumber ?? null,
          relatedProcLinked: related?.linked ?? false,
          relatedProcPossible: related?.possible ?? false,
          lastEventAt: lastEvent?.created_at ?? null,
          lastEventType: lastEvent?.event_type ?? null,
          linkedNotInvited,
          possibleRelation,
          listPriority: linkedNotInvited ? 0 : possibleRelation ? 1 : 2,
        };
      })
      .sort((a, b) => {
        if (a.listPriority !== b.listPriority) {
          return b.listPriority - a.listPriority;
        }
        return (b.score ?? 0) - (a.score ?? 0);
      });

    return c.json({
      filter,
      counters: deps.repo.getOpportunityCounters(),
      items,
    });
  });

  app.post("/api/operator/tenders/:referenceNumber/outreach/send", async (c) => {
    const adam = c.req.param("referenceNumber");
    const body = await c.req.json().catch(() => null);
    const parsed = recordOutreachSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_body", details: parsed.error.flatten() }, 400);
    }

    const existing = deps.repo.findByAdam(adam);
    if (!existing) return c.json({ error: "not_found" }, 404);
    if (existing.record_type !== "REQ") {
      return c.json(
        {
          error: "not_req",
          message: "Early Outreach recording applies to REQ only",
        },
        400,
      );
    }

    const recipientRaw = parsed.data.recipient?.trim() || null;
    // Never invent recipient — only use explicit form value or stored contact email.
    const recipient =
      recipientRaw || existing.contact_email?.trim() || null;

    const updated = deps.repo.recordOutreachSent(adam, {
      sentAt: parsed.data.sentAt,
      recipient,
      subject: parsed.data.subject ?? null,
      notes: parsed.data.notes ?? null,
    });

    if (!updated) return c.json({ error: "not_found" }, 404);

    // Guard: outreach must never flip tender to SUBMITTED
    let finalRow = updated;
    if (updated.current_status === "SUBMITTED") {
      deps.repo.updateOperationalStatus(adam, "REVIEW", {
        note: "Corrected: outreach sent is not a formal submission",
      });
      finalRow = deps.repo.findByAdam(adam)!;
    }

    return c.json({ tender: serializeTender(finalRow, deps.repo) });
  });

  app.get("/api/operator/tenders/:referenceNumber", (c) => {
    const adam = c.req.param("referenceNumber");
    const row = deps.repo.findByAdam(adam);
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json(serializeTender(row, deps.repo));
  });

  app.post("/api/operator/tenders/:referenceNumber/relation/confirm", (c) => {
    const adam = c.req.param("referenceNumber");
    const updated = deps.repo.confirmProcRelation(adam);
    if (!updated) {
      return c.json(
        { error: "not_found_or_no_candidate", message: "No PROC candidate to confirm" },
        404,
      );
    }
    return c.json({ tender: serializeTender(updated, deps.repo) });
  });

  app.post("/api/operator/tenders/:referenceNumber/relation/dismiss", (c) => {
    const adam = c.req.param("referenceNumber");
    const updated = deps.repo.dismissProcRelation(adam);
    if (!updated) {
      return c.json(
        { error: "not_found", message: "PROC not found" },
        404,
      );
    }
    return c.json({ tender: serializeTender(updated, deps.repo) });
  });

  app.patch("/api/operator/tenders/:referenceNumber", async (c) => {
    const adam = decodeURIComponent(c.req.param("referenceNumber"));
    const existing = deps.repo.findByAdam(adam);
    if (!existing) return c.json({ error: "not_found" }, 404);

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }

    const parsed = patchTenderSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: parsed.error.issues.map((i) => i.message).join("; ") },
        400,
      );
    }

    const currentDrafts = deps.repo.parseDrafts(existing.drafts_json);
    const drafts = parsed.data.drafts
      ? mergeDrafts(currentDrafts, parsed.data.drafts)
      : undefined;

    const result = deps.repo.updateTenderOperatorFields(adam, {
      ...parsed.data,
      drafts,
    });

    if (!result) return c.json({ error: "not_found" }, 404);

    return c.json({
      approvalInvalidated: result.approvalInvalidated,
      tender: serializeTender(result.tender, deps.repo),
    });
  });

  app.patch("/api/operator/tenders/:referenceNumber/status", async (c) => {
    const adam = c.req.param("referenceNumber");
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }

    const parsed = statusSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: parsed.error.issues.map((i) => i.message).join("; ") },
        400,
      );
    }

    if (parsed.data.status === "SUBMITTED") {
      return c.json(
        {
          error: "use_submission_endpoint",
          message:
            "SUBMITTED requires a Submission record via POST .../submission",
        },
        400,
      );
    }

    const existing = deps.repo.findByAdam(adam);
    if (!existing) return c.json({ error: "not_found" }, 404);

    if (
      (parsed.data.status === "WON" || parsed.data.status === "LOST") &&
      !deps.repo.getSubmissionForTender(adam)
    ) {
      return c.json(
        {
          error: "submission_required",
          message: "Cannot mark WON/LOST without a Submission record",
        },
        400,
      );
    }

    const updated = deps.repo.updateOperationalStatus(
      adam,
      parsed.data.status,
      { note: parsed.data.note },
    );

    return c.json({ tender: serializeTender(updated!, deps.repo) });
  });

  app.post("/api/operator/tenders/:referenceNumber/events", async (c) => {
    const adam = c.req.param("referenceNumber");
    if (!deps.repo.findByAdam(adam)) return c.json({ error: "not_found" }, 404);

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }

    const parsed = eventSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: parsed.error.issues.map((i) => i.message).join("; ") },
        400,
      );
    }

    const event = deps.repo.addEvent(
      adam,
      parsed.data.event_type,
      parsed.data.note,
    );
    return c.json({ event }, 201);
  });

  app.post("/api/operator/tenders/:referenceNumber/approve", (c) => {
    const adam = c.req.param("referenceNumber");
    const result = deps.repo.approveTender(adam);
    if ("error" in result) {
      const status =
        result.error === "not_found"
          ? 404
          : result.error === "already_submitted"
            ? 409
            : 400;
      return c.json({ error: result.error }, status);
    }
    return c.json({ tender: serializeTender(result.tender, deps.repo) });
  });

  app.post("/api/operator/tenders/:referenceNumber/submission", async (c) => {
    const adam = c.req.param("referenceNumber");

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }

    const parsed = submissionSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: parsed.error.issues.map((i) => i.message).join("; ") },
        400,
      );
    }

    const result = deps.repo.recordSubmission({
      tenderReferenceNumber: adam,
      submittedAt: parsed.data.submitted_at,
      submissionMethod: parsed.data.submission_method,
      recipient: parsed.data.recipient,
      subject: parsed.data.subject,
      amountWithoutVat: parsed.data.amount_without_vat,
      amountWithVat: parsed.data.amount_with_vat,
      attachments: parsed.data.attachments,
      externalReference: parsed.data.external_reference,
      notes: parsed.data.notes,
    });

    if ("error" in result) {
      const status = result.error === "not_found" ? 404 : 409;
      return c.json(
        {
          error: result.error,
          message:
            result.error === "already_submitted"
              ? "Already submitted — duplicate blocked"
              : "Tender not found",
        },
        status,
      );
    }

    return c.json(
      {
        submission: result.submission,
        tender: serializeTender(result.tender, deps.repo),
      },
      201,
    );
  });

  app.get("/api/operator/submissions", (c) => {
    const filterRaw = (c.req.query("result") ?? "all").toUpperCase();
    const allowed = new Set(["ALL", ...SUBMISSION_RESULTS]);
    const filter = allowed.has(filterRaw)
      ? (filterRaw === "ALL"
          ? "all"
          : (filterRaw as (typeof SUBMISSION_RESULTS)[number]))
      : "all";

    const items = deps.repo.listSubmissions(filter).map((row) => ({
      id: row.id,
      referenceNumber: row.tender_reference_number,
      organization: row.tender_organization,
      title: row.tender_title,
      recordType: row.tender_record_type,
      submittedAt: row.submitted_at,
      submissionMethod: row.submission_method,
      recipient: row.recipient,
      amountWithoutVat: row.amount_without_vat,
      amountWithVat: row.amount_with_vat,
      result: row.result,
      externalReference: row.external_reference,
      notes: row.notes,
    }));

    return c.json({ filter, items });
  });

  app.patch("/api/operator/submissions/:id/result", async (c) => {
    const id = c.req.param("id");
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }

    const parsed = z
      .object({ result: z.enum(SUBMISSION_RESULTS) })
      .safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_result" }, 400);
    }

    const updated = deps.repo.updateSubmissionResult(id, parsed.data.result);
    if (!updated) return c.json({ error: "not_found" }, 404);
    return c.json({ submission: updated });
  });

  app.get("/api/operator/settings", (c) => {
    return c.json(deps.repo.getOperatorSettings());
  });

  app.put("/api/operator/settings", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }

    const parsed = settingsSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: parsed.error.issues.map((i) => i.message).join("; ") },
        400,
      );
    }

    const saved = deps.repo.saveOperatorSettings(parsed.data);
    return c.json(saved);
  });

  app.get("/api/operator/config", (c) => {
    return c.json({
      pollIntervalMinutes: deps.config.POLL_INTERVAL_MINUTES,
      lookbackHours: deps.config.LOOKBACK_HOURS,
      minBudget: deps.config.MIN_BUDGET,
      maxBudget: deps.config.MAX_BUDGET,
      alertScoreThreshold: deps.config.ALERT_SCORE_THRESHOLD,
      localDashboardUrl: deps.config.LOCAL_DASHBOARD_URL ?? null,
      sendingConfigured: false,
      // Secrets intentionally omitted
    });
  });

  return app;
};
