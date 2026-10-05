import type { PrismaClient, ThemePreference } from "@prisma/client";

export const getUserPreference = async (prisma: PrismaClient, userId: string) => {
  const existing = await prisma.userPreference.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.userPreference.create({
    data: { userId, theme: "DARK", mobilePushEnabled: true },
  });
};

export const setUserTheme = async (
  prisma: PrismaClient,
  input: { userId: string; theme: ThemePreference },
) =>
  prisma.userPreference.upsert({
    where: { userId: input.userId },
    create: { userId: input.userId, theme: input.theme, mobilePushEnabled: true },
    update: { theme: input.theme },
  });

export const setMobilePushPreference = async (
  prisma: PrismaClient,
  input: { userId: string; mobilePushEnabled: boolean },
) =>
  prisma.userPreference.upsert({
    where: { userId: input.userId },
    create: {
      userId: input.userId,
      theme: "DARK",
      mobilePushEnabled: input.mobilePushEnabled,
    },
    update: { mobilePushEnabled: input.mobilePushEnabled },
  });
