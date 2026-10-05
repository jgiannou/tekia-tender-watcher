/**
 * One-shot: send realistic ARC Tenders pushes to an Expo token.
 *
 * Usage:
 *   pnpm exec tsx scripts/send-demo-push.ts ExponentPushToken[xxxxxxxx]
 *
 * Optional 2nd arg = email (defaults to jgiann94@gmail.com) to attach deep-link
 * data from that user's latest attention events when available locally.
 */
import { PrismaClient } from "@prisma/client";

const token = process.argv[2]?.trim();
const email = (process.argv[3] || "jgiann94@gmail.com").trim();

if (!token || !token.startsWith("ExponentPushToken[")) {
  console.error(
    "Usage: pnpm exec tsx scripts/send-demo-push.ts 'ExponentPushToken[…]' [email]",
  );
  process.exit(1);
}

const prisma = new PrismaClient();

type Sample = {
  title: string;
  body: string;
  data: Record<string, unknown>;
};

async function samplesForEmail(): Promise<Sample[]> {
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: {
      members: { select: { organizationId: true } },
    },
  });
  const orgIds = user?.members.map((m) => m.organizationId) ?? [];
  if (orgIds.length === 0) return fallbackSamples();

  const events = await prisma.organizationAttentionEvent.findMany({
    where: { organizationId: { in: orgIds } },
    orderBy: { createdAt: "desc" },
    take: 3,
    select: {
      id: true,
      type: true,
      title: true,
      organizationTender: {
        select: {
          tender: { select: { referenceNumber: true, recordType: true } },
        },
      },
    },
  });
  if (events.length === 0) return fallbackSamples();

  return events.map((event) => {
    const ref = event.organizationTender.tender.referenceNumber;
    const recordType = event.organizationTender.tender.recordType;
    const hint =
      event.type === "NEW_OPPORTUNITY" || event.type === "OPPORTUNITY_DIGEST"
        ? "Νέα ευκαιρία στο inbox σας."
        : event.type.startsWith("RELATED_")
          ? "Νέα εξέλιξη σε παρακολουθούμενο διαγωνισμό."
          : event.type.startsWith("DEADLINE_")
            ? "Ενημέρωση προθεσμίας."
            : event.title;
    return {
      title: "ARC Tenders",
      body: `${event.title}\n${hint}`,
      data: {
        attentionEventId: event.id,
        type: event.type,
        referenceNumber: ref,
        recordType,
        test: true,
        url: `arctenders://tenders/${recordType}/${encodeURIComponent(ref)}`,
      },
    };
  });
}

const fallbackSamples = (): Sample[] => [
  {
    title: "ARC Tenders",
    body: "Πρόσκληση για υποβολή προσφοράς για Πακέτα λογισμικού και συστήματα πληροφορικής\nΝέα ευκαιρία στο inbox σας.",
    data: { type: "NEW_OPPORTUNITY", test: true, url: "arctenders://notifications" },
  },
  {
    title: "ARC Tenders",
    body: "Σχετική κατακύρωση εντοπίστηκε σε παρακολουθούμενο διαγωνισμό\nΝέα εξέλιξη σε παρακολουθούμενο διαγωνισμό.",
    data: {
      type: "RELATED_AWARD_DISCOVERED",
      test: true,
      url: "arctenders://notifications",
    },
  },
  {
    title: "ARC Tenders",
    body: "Λήγει σε 3 ημέρες — τελική υποβολή\nΕνημέρωση προθεσμίας.",
    data: {
      type: "DEADLINE_APPROACHING",
      test: true,
      url: "arctenders://notifications",
    },
  },
];

async function main() {
  const samples = await samplesForEmail();
  const messages = samples.map((sample) => ({
    to: token,
    title: sample.title,
    body: sample.body,
    sound: "default" as const,
    priority: "high" as const,
    channelId: "arc-tenders-alerts",
    data: sample.data,
  }));

  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messages),
  });
  const payload = await response.json();
  console.log(JSON.stringify({ status: response.status, sent: messages.length, payload }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
