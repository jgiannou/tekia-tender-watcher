/**
 * Prisma client singleton (Phase 1 foundation).
 *
 * The live watcher still uses better-sqlite3 via `openDatabase` / `createRepository`.
 * Import this module only from Postgres-path code and migrations helpers until cutover.
 */
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const getPrisma = (): PrismaClient => {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      log:
        process.env.NODE_ENV === "development"
          ? ["error", "warn"]
          : ["error"],
    });
  }
  return globalForPrisma.prisma;
};

export type { PrismaClient };
