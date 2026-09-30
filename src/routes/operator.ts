import { Hono } from "hono";
import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import type { Config } from "../config.js";
import type { Repository, TenderRow } from "../db/repository.js";
import { buildDecisionTrace } from "../operator/decision-trace.js";
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
});

const draftsSchema = z.object({
  outreach: draftPackageSchema.optional(),
  technical: draftPackageSchema.optional(),
  economic: draftPackageSchema.optional(),
  declarations: draftPackageSchema.optional(),
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

const serializeTender = (row: TenderRow, repo: Repository) => {
  const drafts = repo.parseDrafts(row.drafts_json);
  const checklist = repo.parseChecklist(row.document_checklist_json);
  const submission = repo.getSubmissionForTender(row.reference_number);
  const events = repo.listEvents(row.reference_number);

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
  allowedOrigins: string[];
  config: Config;
  repo: Repository;
}) => {
  const app = new Hono<OperatorEnv>();

  app.use(
    "/api/operator/*",
    cors({
      origin: (origin) => {
        if (!origin) return deps.allowedOrigins[0] ?? "http://localhost:5173";
        return deps.allowedOrigins.includes(origin) ? origin : "";
      },
      allowMethods: ["GET", "POST", "PATCH", "PUT", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "X-Operator-Token"],
      maxAge: 600,
    }),
  );

  const requireOperator = createMiddleware(async (c, next) => {
    if (!deps.operatorToken) {
      return c.json(
        { error: "operator_api_not_configured", message: "OPERATOR_API_TOKEN is not set" },
        503,
      );
    }

    const headerToken =
      c.req.header("X-Operator-Token") ??
      c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");

    if (!headerToken || headerToken !== deps.operatorToken) {
      return c.json({ error: "unauthorized" }, 401);
    }

    await next();
  });

  app.use("/api/operator/*", requireOperator);

  app.get("/api/operator/opportunities", (c) => {
    const filterRaw = (c.req.query("filter") ?? "all").toLowerCase();
    const allowed = new Set(["all", "new", "review", "ready", "req", "proc"]);
    const filter = allowed.has(filterRaw)
      ? (filterRaw as "all" | "new" | "review" | "ready" | "req" | "proc")
      : "all";

    const rows = deps.repo.listOpportunities(filter);
    return c.json({
      filter,
      counters: deps.repo.getOpportunityCounters(),
      items: rows.map((row) => ({
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
        relevanceStatus: row.relevance_status,
      })),
    });
  });

  app.get("/api/operator/tenders/:referenceNumber", (c) => {
    const adam = c.req.param("referenceNumber");
    const row = deps.repo.findByAdam(adam);
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json(serializeTender(row, deps.repo));
  });

  app.patch("/api/operator/tenders/:referenceNumber", async (c) => {
    const adam = c.req.param("referenceNumber");
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
