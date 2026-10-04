import type { PrismaClient, ThemePreference } from "@prisma/client";

export const getUserPreference = async (prisma: PrismaClient, userId: string) => {
  const existing = await prisma.userPreference.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.userPreference.create({
    data: { userId, theme: "DARK" },
  });
};

export const setUserTheme = async (
  prisma: PrismaClient,
  input: { userId: string; theme: ThemePreference },
) =>
  prisma.userPreference.upsert({
    where: { userId: input.userId },
    create: { userId: input.userId, theme: input.theme },
    update: { theme: input.theme },
  });
