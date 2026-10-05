import type { PrismaClient } from "@prisma/client";
import { requireOrgMembership } from "../auth/org-context.js";
import { notFound } from "../errors.js";
import {
  buildOutreachDraftContent,
  extractContactsFromText,
} from "../templates/outreach-template.js";
import {
  getOrgSettings,
  normalizeCompanyProfile,
  type CompanyProfile,
} from "./org-settings.js";

export type OutreachDraftView = {
  subject: string;
  body: string;
  documentTitle: string;
  unresolvedKeys: string[];
  manualEdited: boolean;
  status: "DRAFT" | "READY" | "SENT";
  contacts: {
    name: string | null;
    department: string | null;
    email: string | null;
    phone: string | null;
  };
  suggestedContacts: {
    email: string | null;
    phone: string | null;
    source: "stored" | "extracted" | "none";
  };
  company: {
    legalName: string | null;
    brandName: string | null;
    email: string | null;
    phone: string | null;
    contactName: string | null;
  };
};

type DraftsJson = {
  outreach?: {
    subject?: string;
    body?: string;
    manualEdited?: boolean;
    status?: string;
    updatedAt?: string;
  };
};

const asDrafts = (value: unknown): DraftsJson =>
  value && typeof value === "object" ? (value as DraftsJson) : {};

const companyContactName = (company: CompanyProfile): string | null => {
  const raw = company as CompanyProfile & { contactName?: string | null };
  return typeof raw.contactName === "string" && raw.contactName.trim()
    ? raw.contactName.trim()
    : null;
};

const ensureOrgTender = async (
  prisma: PrismaClient,
  input: { organizationId: string; tenderId: string; userId: string },
) => {
  const tender = await prisma.tender.findUnique({ where: { id: input.tenderId } });
  if (!tender) throw notFound("tender_not_found");

  const orgTender = await prisma.organizationTender.upsert({
    where: {
      organizationId_tenderId: {
        organizationId: input.organizationId,
        tenderId: input.tenderId,
      },
    },
    create: {
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      // Draft prep must not imply follow — that happens on recordOutreachSent.
      following: false,
      monitoringActive: false,
    },
    update: {},
    include: { outreachLedger: true },
  });

  return { tender, orgTender };
};

const resolveSuggestedContacts = (input: {
  orgTender: {
    contactEmail: string | null;
    contactPhone: string | null;
  };
  pdfText: string | null;
  rawJson: unknown;
}) => {
  if (input.orgTender.contactEmail || input.orgTender.contactPhone) {
    return {
      email: input.orgTender.contactEmail,
      phone: input.orgTender.contactPhone,
      source: "stored" as const,
    };
  }
  const fromPdf = extractContactsFromText(input.pdfText);
  if (fromPdf.email || fromPdf.phone) {
    return { ...fromPdf, source: "extracted" as const };
  }
  const rawText =
    typeof input.rawJson === "string"
      ? input.rawJson
      : input.rawJson
        ? JSON.stringify(input.rawJson)
        : "";
  const fromRaw = extractContactsFromText(rawText);
  if (fromRaw.email || fromRaw.phone) {
    return { ...fromRaw, source: "extracted" as const };
  }
  return { email: null, phone: null, source: "none" as const };
};

export const getOutreachDraft = async (
  prisma: PrismaClient,
  input: { userId: string; organizationId: string; tenderId: string },
): Promise<OutreachDraftView> => {
  await requireOrgMembership(prisma, input.userId, input.organizationId);
  const { tender, orgTender } = await ensureOrgTender(prisma, input);
  const settings = await getOrgSettings(prisma, {
    userId: input.userId,
    organizationId: input.organizationId,
  });
  const company = settings.company;
  const drafts = asDrafts(orgTender.drafts);
  const suggested = resolveSuggestedContacts({
    orgTender,
    pdfText: tender.pdfText,
    rawJson: tender.rawJson,
  });

  const contacts = {
    name: orgTender.contactName,
    department: orgTender.contactDepartment,
    email: orgTender.contactEmail ?? suggested.email,
    phone: orgTender.contactPhone ?? suggested.phone,
  };

  const generated = buildOutreachDraftContent({
    organization: tender.contractingAuthority,
    tenderTitle: tender.title,
    adam: tender.referenceNumber,
    contactName: companyContactName(company) ?? company.email,
    contactEmail: company.email,
    contactPhone: company.phone,
    legalName: company.legalName,
    brandName: company.distinctiveTitle,
  });

  const saved = drafts.outreach;
  const manualEdited = Boolean(saved?.manualEdited);
  const subject = manualEdited && saved?.subject ? saved.subject : generated.subject;
  const body = manualEdited && saved?.body ? saved.body : generated.body;
  const sent = orgTender.outreachLedger?.status === "SENT";

  return {
    subject,
    body,
    documentTitle: generated.documentTitle,
    unresolvedKeys: generated.unresolvedKeys,
    manualEdited,
    status: sent ? "SENT" : ((saved?.status as "DRAFT" | "READY") ?? "DRAFT"),
    contacts,
    suggestedContacts: suggested,
    company: {
      legalName: company.legalName,
      brandName: company.distinctiveTitle,
      email: company.email,
      phone: company.phone,
      contactName: companyContactName(company),
    },
  };
};

export const saveOutreachDraft = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string;
    tenderId: string;
    subject?: string | null;
    body?: string | null;
    manualEdited?: boolean;
    regenerate?: boolean;
    contacts?: {
      name?: string | null;
      department?: string | null;
      email?: string | null;
      phone?: string | null;
    };
  },
): Promise<OutreachDraftView> => {
  await requireOrgMembership(prisma, input.userId, input.organizationId);
  const { tender, orgTender } = await ensureOrgTender(prisma, input);
  const settings = await getOrgSettings(prisma, {
    userId: input.userId,
    organizationId: input.organizationId,
  });
  const company = settings.company;

  const contactPatch = {
    contactName:
      input.contacts?.name !== undefined
        ? input.contacts.name?.trim() || null
        : orgTender.contactName,
    contactDepartment:
      input.contacts?.department !== undefined
        ? input.contacts.department?.trim() || null
        : orgTender.contactDepartment,
    contactEmail:
      input.contacts?.email !== undefined
        ? input.contacts.email?.trim() || null
        : orgTender.contactEmail,
    contactPhone:
      input.contacts?.phone !== undefined
        ? input.contacts.phone?.trim() || null
        : orgTender.contactPhone,
  };

  const generated = buildOutreachDraftContent({
    organization: tender.contractingAuthority,
    tenderTitle: tender.title,
    adam: tender.referenceNumber,
    contactName: companyContactName(company) ?? company.email,
    contactEmail: company.email,
    contactPhone: company.phone,
    legalName: company.legalName,
    brandName: company.distinctiveTitle,
  });

  const previous = asDrafts(orgTender.drafts).outreach;
  const regenerate = Boolean(input.regenerate);
  const manualEdited = regenerate
    ? false
    : input.manualEdited !== undefined
      ? Boolean(input.manualEdited)
      : Boolean(previous?.manualEdited) ||
        (input.subject != null && input.subject !== previous?.subject) ||
        (input.body != null && input.body !== previous?.body);

  const subject = regenerate
    ? generated.subject
    : (input.subject ?? previous?.subject ?? generated.subject);
  const body = regenerate
    ? generated.body
    : (input.body ?? previous?.body ?? generated.body);

  const nextDrafts: DraftsJson = {
    ...asDrafts(orgTender.drafts),
    outreach: {
      subject,
      body,
      manualEdited,
      status: "DRAFT",
      updatedAt: new Date().toISOString(),
    },
  };

  await prisma.organizationTender.update({
    where: { id: orgTender.id },
    data: {
      ...contactPatch,
      drafts: nextDrafts,
    },
  });

  // Keep ledger draft subject/body for continuity (status stays NOT_STARTED until sent).
  if (orgTender.outreachLedger?.status !== "SENT") {
    await prisma.outreachLedger.upsert({
      where: { organizationTenderId: orgTender.id },
      create: {
        organizationId: input.organizationId,
        organizationTenderId: orgTender.id,
        status: "DRAFT",
        subject,
        body,
        recipient: contactPatch.contactEmail,
      },
      update: {
        status: "DRAFT",
        subject,
        body,
        recipient: contactPatch.contactEmail,
      },
    });
  }

  return getOutreachDraft(prisma, input);
};

/** Used by tests / helpers without auth path duplication. */
export const __normalizeCompanyForDraft = normalizeCompanyProfile;
