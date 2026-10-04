import type { AttentionEvent } from "@/lib/api";

const tenderHref = (recordType: string | undefined, referenceNumber: string) => {
  const type = recordType === "PROC" || recordType === "REQ" ? recordType : "REQ";
  return `/app/tenders/${type}/${encodeURIComponent(referenceNumber)}`;
};

export const attentionEventHref = (event: AttentionEvent): string => {
  if (event.type === "OPPORTUNITY_DIGEST" || event.type === "NEW_OPPORTUNITY") {
    const meta =
      event.metadata && typeof event.metadata === "object"
        ? (event.metadata as { profileId?: string; referenceNumber?: string })
        : null;
    if (event.type === "NEW_OPPORTUNITY") {
      const related = event.relatedTender ?? event.organizationTender?.tender;
      if (related?.referenceNumber) {
        return tenderHref(related.recordType, related.referenceNumber);
      }
      if (meta?.referenceNumber) {
        return tenderHref(undefined, meta.referenceNumber);
      }
    }
    return meta?.profileId
      ? `/app/opportunities?profile=${encodeURIComponent(meta.profileId)}`
      : "/app/opportunities";
  }

  const related = event.relatedTender ?? event.organizationTender?.tender;
  if (related?.referenceNumber) {
    return tenderHref(related.recordType, related.referenceNumber);
  }
  return "/app/monitoring";
};
