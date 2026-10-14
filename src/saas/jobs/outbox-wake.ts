import type { PrismaClient } from "@prisma/client";
import type { KimdisClient } from "../../kimdis/client.js";
import { runSaasOutboxWorker } from "./process-outbox.js";

/**
 * Immediate outbox wake after urgent enqueue.
 * Cron remains the durability fallback (every 2 minutes).
 *
 * Concurrency: single in-flight drain; coalesced wakes while busy.
 */

let draining = false;
let wakeQueued = false;
let wakeDeps: {
  prisma: PrismaClient;
  kimdis?: KimdisClient;
} | null = null;

export const configureOutboxWake = (deps: {
  prisma: PrismaClient;
  kimdis?: KimdisClient;
}): void => {
  wakeDeps = deps;
};

const drainOnce = async (): Promise<void> => {
  if (!wakeDeps) return;
  if (draining) {
    wakeQueued = true;
    return;
  }
  draining = true;
  try {
    do {
      wakeQueued = false;
      await runSaasOutboxWorker(wakeDeps.prisma, {
        limit: 25,
        kimdis: wakeDeps.kimdis,
      });
    } while (wakeQueued);
  } catch (error) {
    console.error(
      "[outbox] wake drain failed:",
      error instanceof Error ? error.message : error,
    );
  } finally {
    draining = false;
  }
};

/**
 * Signal an immediate outbox drain (non-blocking).
 * Safe to call after every urgent enqueue.
 */
export const signalOutboxWake = (_input?: { reason?: string }): void => {
  if (!wakeDeps) return;
  void drainOnce();
};
