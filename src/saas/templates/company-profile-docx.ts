/**
 * Generates a polished Company Profile DOCX from org company settings.
 * Never invents missing fields — omits blank rows.
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
  UnderlineType,
} from "docx";
import type { CompanyProfile } from "../services/org-settings.js";

export const GENERATED_COMPANY_PROFILE_NAME = "Εταιρικό προφίλ — ARC Tenders";

export type CompanyProfileNarrative = {
  contactName?: string | null;
  portfolioReferences?: string | null;
  techStack?: string | null;
  publicSectorNotes?: string | null;
  activities?: Array<{ code: string; description: string; isPrimary?: boolean }>;
};

const nonEmpty = (value: string | null | undefined): string | null => {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const formatAddress = (company: CompanyProfile): string | null => {
  const parts = [
    [company.address.street, company.address.streetNumber].filter(Boolean).join(" "),
    company.address.zipCode,
    company.address.city || company.address.municipality,
    company.address.prefecture,
  ]
    .map((p) => nonEmpty(p))
    .filter(Boolean);
  return parts.length ? parts.join(", ") : null;
};

const heading = (text: string) =>
  new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
  });

const body = (text: string) =>
  new Paragraph({
    children: [new TextRun({ text, size: 22, font: "Calibri" })],
    spacing: { after: 80 },
  });

const metaRow = (label: string, value: string | null | undefined) => {
  const v = nonEmpty(value);
  if (!v) return null;
  return new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({ text: `${label}: `, bold: true, size: 22, font: "Calibri" }),
      new TextRun({ text: v, size: 22, font: "Calibri" }),
    ],
  });
};

export const buildCompanyProfileDocx = async (
  company: CompanyProfile,
  narrative: CompanyProfileNarrative = {},
): Promise<Buffer> => {
  const brand = nonEmpty(company.distinctiveTitle);
  const legal = nonEmpty(company.legalName) || "Εταιρικό προφίλ";
  const address = formatAddress(company);
  const activities = narrative.activities ?? [];

  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: brand || legal,
          bold: true,
          size: 36,
          font: "Calibri",
          color: "0F766E",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 12, color: "0F766E", space: 8 },
      },
      children: [
        new TextRun({
          text: "Εταιρικό προφίλ για δημόσιες συμβάσεις",
          size: 20,
          font: "Calibri",
          color: "6B7280",
          italics: true,
        }),
      ],
    }),
    heading("Στοιχεία επιχείρησης"),
  ];

  const identity = [
    metaRow("Επωνυμία", company.legalName),
    metaRow("Διακριτικός τίτλος", company.distinctiveTitle),
    metaRow("Νομική μορφή", company.legalType),
    metaRow("ΑΦΜ", company.afm),
    metaRow("ΓΕΜΗ", company.gemiNumber),
    metaRow("Κατάσταση", company.status),
    metaRow("Διεύθυνση", address),
    metaRow("Ιστότοπος", company.website),
    metaRow("Email", company.email),
    metaRow("Τηλέφωνο", company.phone),
    metaRow("Υπεύθυνος επικοινωνίας", narrative.contactName),
  ].filter((p): p is Paragraph => Boolean(p));
  children.push(...identity);

  if (activities.length) {
    children.push(heading("Δραστηριότητες / ΚΑΔ"));
    for (const act of activities) {
      children.push(
        new Paragraph({
          spacing: { after: 40 },
          children: [
            new TextRun({
              text: `${act.isPrimary ? "• " : "  "}${act.code} — ${act.description}`,
              size: 22,
              font: "Calibri",
            }),
          ],
        }),
      );
    }
  }

  const portfolio = nonEmpty(narrative.portfolioReferences);
  const tech = nonEmpty(narrative.techStack);
  const publicNotes = nonEmpty(narrative.publicSectorNotes);

  if (portfolio || tech || publicNotes) {
    children.push(heading("Παρουσίαση"));
    if (portfolio) {
      children.push(
        new Paragraph({
          spacing: { after: 40 },
          children: [
            new TextRun({
              text: "Έργα / αναφορές",
              bold: true,
              size: 22,
              font: "Calibri",
              underline: { type: UnderlineType.SINGLE },
            }),
          ],
        }),
      );
      children.push(body(portfolio));
    }
    if (tech) {
      children.push(
        new Paragraph({
          spacing: { before: 80, after: 40 },
          children: [
            new TextRun({
              text: "Τεχνολογίες",
              bold: true,
              size: 22,
              font: "Calibri",
              underline: { type: UnderlineType.SINGLE },
            }),
          ],
        }),
      );
      children.push(body(tech));
    }
    if (publicNotes) {
      children.push(
        new Paragraph({
          spacing: { before: 80, after: 40 },
          children: [
            new TextRun({
              text: "Δημόσιος τομέας",
              bold: true,
              size: 22,
              font: "Calibri",
              underline: { type: UnderlineType.SINGLE },
            }),
          ],
        }),
      );
      children.push(body(publicNotes));
    }
  } else {
    children.push(heading("Παρουσίαση"));
    children.push(
      body(
        "Συμπληρώστε στα στοιχεία επιχείρησης / δραστηριότητες για πλουσιότερο προφίλ. Το αρχείο ανανεώνεται από τα δεδομένα του ARC Tenders.",
      ),
    );
  }

  children.push(
    new Paragraph({
      spacing: { before: 360 },
      children: [
        new TextRun({
          text: `Δημιουργήθηκε από ARC Tenders · ${new Intl.DateTimeFormat("el-GR").format(new Date())}`,
          size: 16,
          font: "Calibri",
          color: "9CA3AF",
        }),
      ],
    }),
  );

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
};
