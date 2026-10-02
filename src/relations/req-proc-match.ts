/**
 * Deterministic REQ → PROC relation matching.
 * Scores are explainable; no AI / embeddings.
 */

import {
  authoritiesMatch,
  extractDurationMonths,
  normalizeProcurementText,
  tokenJaccard,
} from "./text-normalize.js";

export type RelationConfidence = "HIGH" | "MEDIUM" | "LOW";
export type RelationMethod = "EXPLICIT_REFERENCE" | "INFERRED" | "MANUAL";
export type RelationDecision = "AUTO_LINK" | "POSSIBLE_RELATION" | "NO_LINK";

export type RelationCandidate = {
  referenceNumber: string;
  recordType: "REQ" | "PROC" | string;
  title: string | null;
  organization: string | null;
  organizationKey?: string | null;
  budgetWithoutVat: number | null;
  cpvs: string[];
  description: string;
  submissionDate: string | null;
  /** Explicit refs known on this record (e.g. noticeRefNo / approvalRefNo / ADAM mentions). */
  explicitRefs?: string[];
  /** True when Early Outreach was SENT — prioritize among same-authority candidates. */
  watched?: boolean;
};

export type RelationReason = {
  points: number;
  label: string;
};

export type RelationResult = {
  decision: RelationDecision;
  parentAdam: string | null;
  score: number;
  confidence: RelationConfidence | null;
  method: RelationMethod | null;
  reasons: RelationReason[];
};

const ADAM_RE = /\b(\d{2}REQ\d{9}|\d{2}PROC\d{9})\b/gi;

export const extractAdamRefs = (text: string): string[] => {
  const found = new Set<string>();
  const re = new RegExp(ADAM_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    found.add(m[1].toUpperCase());
  }
  return [...found];
};

const sameBudget = (a: number | null, b: number | null): boolean => {
  if (a == null || b == null) return false;
  return Math.round(a) === Math.round(b);
};

const sharedCpv = (a: string[], b: string[]): boolean => {
  if (!a.length || !b.length) return false;
  const setB = new Set(b.map((c) => c.trim().toUpperCase()));
  return a.some((c) => setB.has(c.trim().toUpperCase()));
};

const daysBetween = (a: string | null, b: string | null): number | null => {
  if (!a || !b) return null;
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (Number.isNaN(da) || Number.isNaN(db)) return null;
  return Math.abs(da - db) / (1000 * 60 * 60 * 24);
};

const strongSimilarity = (a: string, b: string): boolean => {
  const j = tokenJaccard(a, b);
  if (j >= 0.45) return true;
  // Shared domain tokens after normalization
  const na = new Set(normalizeProcurementText(a).split(" ").filter((t) => t.length >= 4));
  const nb = normalizeProcurementText(b).split(" ").filter((t) => t.length >= 4);
  let hits = 0;
  for (const t of nb) {
    if (na.has(t)) hits += 1;
  }
  return hits >= 2 && j >= 0.25;
};

export const scoreReqProcPair = (
  proc: RelationCandidate,
  req: RelationCandidate,
): { score: number; reasons: RelationReason[] } => {
  const reasons: RelationReason[] = [];
  let score = 0;

  const sameAuthority = authoritiesMatch(proc.organization, req.organization);
  if (sameAuthority) {
    score += 30;
    reasons.push({ points: 30, label: "Same contracting authority" });
  }

  // Inferred matching requires same authority (hard rule).
  if (!sameAuthority) {
    return { score: 0, reasons: [{ points: 0, label: "Different contracting authority — no inferred link" }] };
  }

  if (sameBudget(proc.budgetWithoutVat, req.budgetWithoutVat)) {
    score += 15;
    reasons.push({ points: 15, label: "Same budget" });
  }

  if (sharedCpv(proc.cpvs, req.cpvs)) {
    score += 15;
    reasons.push({ points: 15, label: "Same CPV" });
  }

  const procTitle = proc.title ?? "";
  const reqTitle = req.title ?? "";
  if (strongSimilarity(procTitle, reqTitle)) {
    score += 15;
    reasons.push({ points: 15, label: "Strong title similarity" });
  }

  const procScope = `${procTitle}\n${proc.description}`;
  const reqScope = `${reqTitle}\n${req.description}`;
  if (strongSimilarity(procScope, reqScope)) {
    score += 15;
    reasons.push({ points: 15, label: "Strong scope similarity" });
  }

  const procDur = extractDurationMonths(procScope);
  const reqDur = extractDurationMonths(reqScope);
  if (procDur != null && reqDur != null && procDur === reqDur) {
    score += 5;
    reasons.push({ points: 5, label: "Same duration" });
  }

  const days = daysBetween(proc.submissionDate, req.submissionDate);
  if (days != null && days <= 30) {
    score += 5;
    reasons.push({ points: 5, label: "Published within 30 days" });
  }

  if (req.watched) {
    score += 10;
    reasons.push({
      points: 10,
      label: "Watched REQ — Early Outreach already sent",
    });
  }

  return { score: Math.min(100, score), reasons };
};

const findExplicitParent = (
  proc: RelationCandidate,
  reqs: RelationCandidate[],
  corpusText: string,
): { parent: RelationCandidate; reasons: RelationReason[] } | null => {
  const procAdam = proc.referenceNumber.toUpperCase();
  const textRefs = new Set(extractAdamRefs(corpusText).map((r) => r.toUpperCase()));
  for (const ref of proc.explicitRefs ?? []) {
    textRefs.add(ref.toUpperCase());
  }

  for (const req of reqs) {
    const reqAdam = req.referenceNumber.toUpperCase();
    if (!/^\d{2}REQ\d{9}$/i.test(reqAdam)) continue;

    // PROC document / corpus cites this REQ ADAM
    if (textRefs.has(reqAdam)) {
      return {
        parent: req,
        reasons: [
          {
            points: 100,
            label: `Explicit reference to parent REQ ${reqAdam}`,
          },
        ],
      };
    }

    // REQ already lists this PROC among notice / related refs
    const reqRefs = (req.explicitRefs ?? []).map((r) => r.toUpperCase());
    if (reqRefs.includes(procAdam)) {
      return {
        parent: req,
        reasons: [
          {
            points: 100,
            label: `REQ ${reqAdam} explicitly references PROC ${procAdam}`,
          },
        ],
      };
    }
  }
  return null;
};

/**
 * Pick best REQ parent for a new PROC among candidates.
 * Recent REQs of same authority should be preferred by the caller order,
 * but scoring is absolute.
 */
export const matchProcToReqs = (
  proc: RelationCandidate,
  reqs: RelationCandidate[],
  options?: { corpusText?: string },
): RelationResult => {
  const corpus = options?.corpusText ?? `${proc.title ?? ""}\n${proc.description}`;

  const explicit = findExplicitParent(proc, reqs, corpus);
  if (explicit) {
    // Still require authority match for safety unless explicit ADAM citation in PROC text
    const citedInText = extractAdamRefs(corpus)
      .map((r) => r.toUpperCase())
      .includes(explicit.parent.referenceNumber.toUpperCase());
    const sameAuth = authoritiesMatch(proc.organization, explicit.parent.organization);
    if (citedInText || sameAuth) {
      return {
        decision: "AUTO_LINK",
        parentAdam: explicit.parent.referenceNumber,
        score: 100,
        confidence: "HIGH",
        method: "EXPLICIT_REFERENCE",
        reasons: explicit.reasons,
      };
    }
  }

  let best: {
    req: RelationCandidate;
    score: number;
    reasons: RelationReason[];
  } | null = null;

  for (const req of reqs) {
    if (req.recordType !== "REQ") continue;
    const { score, reasons } = scoreReqProcPair(proc, req);
    if (
      !best ||
      score > best.score ||
      (score === best.score && Boolean(req.watched) && !best.req.watched)
    ) {
      best = { req, score, reasons };
    }
  }

  if (!best || best.score < 60) {
    return {
      decision: "NO_LINK",
      parentAdam: null,
      score: best?.score ?? 0,
      confidence: best && best.score > 0 ? "LOW" : null,
      method: null,
      reasons: best?.reasons ?? [],
    };
  }

  if (best.score >= 80) {
    return {
      decision: "AUTO_LINK",
      parentAdam: best.req.referenceNumber,
      score: best.score,
      confidence: "HIGH",
      method: "INFERRED",
      reasons: best.reasons,
    };
  }

  return {
    decision: "POSSIBLE_RELATION",
    parentAdam: best.req.referenceNumber,
    score: best.score,
    confidence: "MEDIUM",
    method: "INFERRED",
    reasons: best.reasons,
  };
};
