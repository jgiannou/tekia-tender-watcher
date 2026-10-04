import type { AttentionEvent } from "@/lib/api";

export type AttentionMeta = {
  profileId?: string;
  profileName?: string;
  score?: number;
  referenceNumber?: string;
  tenderTitle?: string;
  recordType?: string;
  authority?: string;
  matchCount?: number;
  newCount?: number;
  submissionId?: string;
  externalReference?: string;
  method?: string;
  sourceTenderTitle?: string;
  relatedTenderTitle?: string;
};

export type AttentionViewModel = {
  eyebrow: string;
  primary: string;
  primaryFull: string;
  secondary: string;
  context?: string;
};

const asMeta = (value: unknown): AttentionMeta => {
  if (!value || typeof value !== "object") return {};
  return value as AttentionMeta;
};

export const relativeAttentionTime = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes === 1) return "πριν 1 λεπτό";
  if (minutes < 60) return `πριν ${minutes} λεπτά`;
  const hours = Math.round(minutes / 60);
  if (hours === 1) return "πριν 1 ώρα";
  if (hours < 48) return `πριν ${hours} ώρες`;
  return new Date(iso).toLocaleString("el-GR");
};

const tenderFromEvent = (event: AttentionEvent) => {
  const meta = asMeta(event.metadata);
  const related = event.relatedTender;
  const owned = event.organizationTender?.tender;
  const pick = related ?? owned;
  return {
    referenceNumber: pick?.referenceNumber ?? meta.referenceNumber ?? null,
    recordType: pick?.recordType ?? meta.recordType ?? null,
    title: pick?.title ?? meta.tenderTitle ?? null,
    authority: pick?.contractingAuthority ?? meta.authority ?? null,
  };
};

const quote = (value: string) => `«${value}»`;

/**
 * Structured notification copy for bell + Notifications page.
 * Visual truncation is CSS; primaryFull stays available for title/aria.
 */
export const attentionEventViewModel = (event: AttentionEvent): AttentionViewModel => {
  const meta = asMeta(event.metadata);
  const tender = tenderFromEvent(event);
  const time = relativeAttentionTime(event.createdAt);

  if (event.type === "OPPORTUNITY_DIGEST") {
    const count =
      typeof meta.newCount === "number" && meta.newCount > 0
        ? meta.newCount
        : typeof meta.matchCount === "number"
          ? meta.matchCount
          : null;
    const profileName = meta.profileName?.trim() || "αποθηκευμένη αναζήτηση";
    const countLabel =
      count == null
        ? "Νέες ευκαιρίες"
        : count === 1
          ? "1 ευκαιρία"
          : `${count} ευκαιρίες`;
    const primary = `${countLabel} από την αναζήτηση ${quote(profileName)}`;
    return {
      eyebrow: "Νέες ευκαιρίες",
      primary,
      primaryFull: primary,
      secondary: time,
    };
  }

  if (event.type === "NEW_OPPORTUNITY") {
    const title = (tender.title || meta.tenderTitle || event.title || "Χωρίς τίτλο").trim();
    const recordType = tender.recordType || "—";
    const authority = tender.authority?.trim() || "—";
    const profileName = meta.profileName?.trim();
    return {
      eyebrow: "Νέα ευκαιρία",
      primary: title,
      primaryFull: title,
      secondary: `${recordType} · ${authority} · ${time}`,
      context: profileName ? `Από την αναζήτηση ${quote(profileName)}` : undefined,
    };
  }

  if (event.type === "SUBMISSION_RECORDED") {
    const title = (tender.title || meta.tenderTitle || "Υποβολή").trim();
    const ref = meta.externalReference?.trim();
    return {
      eyebrow: "Καταχώρηση υποβολής",
      primary: title,
      primaryFull: title,
      secondary: ref ? `Αναφορά ${ref} · ${time}` : time,
    };
  }

  if (event.type === "OUTREACH_RECORDED") {
    const title = (tender.title || meta.tenderTitle || event.title).trim();
    return {
      eyebrow: "Εκδήλωση ενδιαφέροντος",
      primary: title,
      primaryFull: title,
      secondary: time,
    };
  }

  if (
    event.type === "RELATED_PROC_DISCOVERED" ||
    event.type === "RELATED_AWARD_DISCOVERED" ||
    event.type === "RELATED_APPROVED_REQUEST_DISCOVERED" ||
    event.type === "RELATED_CONTRACT_DISCOVERED" ||
    event.type === "DEADLINE_CHANGED"
  ) {
    const change =
      event.type === "RELATED_PROC_DISCOVERED"
        ? "Νέα σχετική πρόσκληση"
        : event.type === "RELATED_AWARD_DISCOVERED"
          ? "Νέα ανάθεση / αποτέλεσμα"
          : event.type === "RELATED_CONTRACT_DISCOVERED"
            ? "Νέα σχετική σύμβαση"
            : event.type === "DEADLINE_CHANGED"
              ? "Αλλαγή προθεσμίας"
              : "Νέα επίσημη εξέλιξη";
    const relatedTitle =
      event.relatedTender?.title?.trim() ||
      meta.relatedTenderTitle?.trim() ||
      tender.title?.trim() ||
      event.title;
    return {
      eyebrow: change,
      primary: relatedTitle,
      primaryFull: relatedTitle,
      secondary: [
        event.relatedTender?.recordType || tender.recordType,
        event.relatedTender?.referenceNumber || tender.referenceNumber,
        time,
      ]
        .filter(Boolean)
        .join(" · "),
      context: meta.sourceTenderTitle
        ? `Νήμα: ${meta.sourceTenderTitle}`
        : event.organizationTender?.tender?.title
          ? `Νήμα: ${event.organizationTender.tender.title}`
          : undefined,
    };
  }

  return {
    eyebrow: "Ειδοποίηση",
    primary: event.title,
    primaryFull: event.title,
    secondary: time,
  };
};
