import type {
  AttentionEventType,
  PrismaClient,
  RelationConfidence,
} from "@prisma/client";
import { requireOrgMembership } from "../auth/org-context.js";
import { notFound } from "../errors.js";

export const attentionDedupeKey = (
  type: AttentionEventType,
  sourceTenderId: string,
  relatedTenderId: string,
): string => `${type}:${sourceTenderId}:${relatedTenderId}`;

export const attentionTitleFor = (
  type: AttentionEventType,
  confidence: RelationConfidence,
): string => {
  if (confidence === "POSSIBLE" || confidence === "LIKELY") {
    if (type === "RELATED_PROC_DISCOVERED") {
      return "Πιθανή σχετική πρόσκληση χρειάζεται επιβεβαίωση";
    }
    if (type === "RELATED_AWARD_DISCOVERED") {
      return "Πιθανή σχετική ανάθεση χρειάζεται επιβεβαίωση";
    }
  }
  switch (type) {
    case "NEW_OPPORTUNITY":
      return "Νέα ευκαιρία από αποθηκευμένη αναζήτηση";
    case "OUTREACH_RECORDED":
      return "Καταχωρήθηκε εκδήλωση ενδιαφέροντος";
    case "SUBMISSION_RECORDED":
      return "Καταχωρήθηκε τυπική υποβολή";
    case "RELATED_PROC_DISCOVERED":
      return "Νέα πρόσκληση για αίτημα που παρακολουθείτε";
    case "RELATED_AWARD_DISCOVERED":
      return "Δημοσιεύτηκε ανάθεση για διαγωνισμό που παρακολουθείτε";
    case "RELATED_APPROVED_REQUEST_DISCOVERED":
      return "Νέα σχετική έγκριση αιτήματος";
    case "RELATED_CONTRACT_DISCOVERED":
      return "Νέα σχετική σύμβαση";
    case "DEADLINE_CHANGED":
      return "Αλλαγή προθεσμίας σε αίτημα που παρακολουθείτε";
    default:
      return "Νέα εξέλιξη σε διαγωνισμό που παρακολουθείτε";
  }
};

export const listAttentionEvents = async (
  prisma: PrismaClient,
  input: { userId: string; organizationId: string; unreadOnly?: boolean },
) => {
  await requireOrgMembership(prisma, input.userId, input.organizationId);
  return prisma.organizationAttentionEvent.findMany({
    where: {
      organizationId: input.organizationId,
      ...(input.unreadOnly ? { readAt: null } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      relatedTender: true,
      organizationTender: { include: { tender: true } },
    },
  });
};

export const markAttentionEventRead = async (
  prisma: PrismaClient,
  input: { userId: string; organizationId: string; eventId: string },
) => {
  await requireOrgMembership(prisma, input.userId, input.organizationId);
  const event = await prisma.organizationAttentionEvent.findFirst({
    where: {
      id: input.eventId,
      organizationId: input.organizationId,
    },
  });
  if (!event) throw notFound("attention_event_not_found");

  return prisma.organizationAttentionEvent.update({
    where: { id: event.id },
    data: { readAt: new Date() },
  });
};

export const markAllAttentionEventsRead = async (
  prisma: PrismaClient,
  input: { userId: string; organizationId: string },
) => {
  await requireOrgMembership(prisma, input.userId, input.organizationId);
  const result = await prisma.organizationAttentionEvent.updateMany({
    where: {
      organizationId: input.organizationId,
      readAt: null,
    },
    data: { readAt: new Date() },
  });
  return { updated: result.count };
};
