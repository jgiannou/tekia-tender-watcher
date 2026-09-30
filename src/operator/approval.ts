import type { ApprovalSnapshot, TenderDrafts } from "./types.js";

export const buildApprovalSnapshot = (input: {
  recipient: string | null | undefined;
  drafts: TenderDrafts;
}): ApprovalSnapshot => {
  const outreach = input.drafts.outreach;
  const economic = input.drafts.economic;
  const declarations = input.drafts.declarations;

  const attachments = [
    ...(outreach.attachments ?? []),
    ...(input.drafts.technical.attachments ?? []),
    ...(economic.attachments ?? []),
    ...(declarations.attachments ?? []),
  ];

  return {
    recipient: (input.recipient ?? "").trim(),
    subject: (outreach.subject ?? "").trim(),
    body: (outreach.body ?? "").trim(),
    attachments: attachments.map((a) => a.trim()).filter(Boolean).sort(),
    amountWithoutVat:
      typeof economic.amountWithoutVat === "number"
        ? economic.amountWithoutVat
        : null,
    declarationText: (declarations.body ?? declarations.notes ?? "").trim(),
  };
};

export const snapshotsEqual = (
  a: ApprovalSnapshot,
  b: ApprovalSnapshot,
): boolean => {
  if (a.recipient !== b.recipient) return false;
  if (a.subject !== b.subject) return false;
  if (a.body !== b.body) return false;
  if (a.amountWithoutVat !== b.amountWithoutVat) return false;
  if (a.declarationText !== b.declarationText) return false;
  if (a.attachments.length !== b.attachments.length) return false;
  return a.attachments.every((value, index) => value === b.attachments[index]);
};

/**
 * If material fields changed after approval, approval must be invalidated.
 */
export const shouldInvalidateApproval = (input: {
  approvalStatus: string | null | undefined;
  storedSnapshotJson: string | null | undefined;
  recipient: string | null | undefined;
  drafts: TenderDrafts;
}): boolean => {
  if (input.approvalStatus !== "APPROVED") return false;
  if (!input.storedSnapshotJson) return true;

  let stored: ApprovalSnapshot;
  try {
    stored = JSON.parse(input.storedSnapshotJson) as ApprovalSnapshot;
  } catch {
    return true;
  }

  const current = buildApprovalSnapshot({
    recipient: input.recipient,
    drafts: input.drafts,
  });

  return !snapshotsEqual(stored, current);
};
