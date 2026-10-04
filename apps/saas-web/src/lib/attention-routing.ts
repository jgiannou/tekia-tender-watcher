import type { AttentionEvent } from "@/lib/api";

const tenderHref = (recordType: string | undefined, referenceNumber: string) => {
  const type = recordType === "PROC" || recordType === "REQ" ? recordType : "REQ";
  return `/app/tenders/${type}/${encodeURIComponent(referenceNumber)}`;
};

type Meta = {
  profileId?: string;
  referenceNumber?: string;
  recordType?: string;
};

const asMeta = (value: unknown): Meta => {
  if (!value || typeof value !== "object") return {};
  return value as Meta;
};

/**
 * Click destinations for in-app attention events.
 * Single opportunities / submissions / official developments → exact tender.
 * Digests → Opportunities filtered to that Saved Search.
 * Never generic Monitoring.
 */
export const attentionEventHref = (event: AttentionEvent): string => {
  const meta = asMeta(event.metadata);

  if (event.type === "OPPORTUNITY_DIGEST") {
    if (meta.profileId) {
      return `/app/opportunities?profile=${encodeURIComponent(meta.profileId)}`;
    }
    return "/app/opportunities";
  }

  if (event.type === "NEW_OPPORTUNITY" || event.type === "SUBMISSION_RECORDED") {
    const owned = event.organizationTender?.tender;
    const adam = owned?.referenceNumber ?? meta.referenceNumber;
    if (adam) {
      return tenderHref(owned?.recordType ?? meta.recordType, adam);
    }
  }

  // Official development: open the new related act when present, else the thread.
  if (event.relatedTender?.referenceNumber) {
    return tenderHref(event.relatedTender.recordType, event.relatedTender.referenceNumber);
  }

  const source = event.organizationTender?.tender;
  if (source?.referenceNumber) {
    return tenderHref(source.recordType, source.referenceNumber);
  }

  if (meta.referenceNumber) {
    return tenderHref(meta.recordType, meta.referenceNumber);
  }

  // Last resort when payload is incomplete — still not Monitoring.
  return "/app/opportunities";
};
