import type { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { KimdisClient } from "../../kimdis/client.js";
import { resolveSaasAppUrl } from "../mail/mail.js";
import {
  beginGoogleOAuth,
  completeGoogleOAuthCallback,
  disconnectGoogle,
  getGoogleIntegrationsView,
  recreateGoogleCalendar,
  requestGoogleCalendarSyncNow,
  setGoogleCalendarPaused,
} from "../services/google-connection.js";
import {
  getGoogleDriveImportStatus,
  mintPickerAccessToken,
  previewGoogleDriveFiles,
  startGoogleDriveImport,
} from "../services/google-drive-import.js";
import {
  getDriveFolderStatus,
  listExistingFolders,
  previewCreateTenderDriveFolder,
  retryTenderDriveFolder,
  startCreateTenderDriveFolder,
} from "../services/google-drive-folder.js";

type GoogleVariables = {
  userId: string;
  sessionToken: string;
  activeOrganizationId: string | null;
};

type RegisterGoogleRoutesInput = {
  app: Hono<{ Variables: GoogleVariables }>;
  prisma: PrismaClient;
  requireSession: MiddlewareHandler<{ Variables: GoogleVariables }>;
  resolveOrgId: (c: {
    req: { header: (name: string) => string | undefined };
    get: (key: keyof GoogleVariables) => string | null;
  }) => string | null;
  /** Needed to copy official KIMDIS PDFs into tender folders. */
  kimdis?: KimdisClient;
};

export const registerGoogleIntegrationRoutes = (
  input: RegisterGoogleRoutesInput,
): void => {
  const { app, prisma, requireSession, resolveOrgId, kimdis } = input;

  app.get("/api/saas/integrations/google", requireSession, async (c) => {
    const view = await getGoogleIntegrationsView(prisma, {
      userId: c.get("userId"),
      organizationId: resolveOrgId(c),
    });
    return c.json(view);
  });

  app.post(
    "/api/saas/integrations/google/oauth/start",
    requireSession,
    async (c) => {
      const body = z
        .object({
          capabilities: z
            .array(z.enum(["calendar", "drive", "sheets"]))
            .min(1),
          purpose: z.enum(["CONNECT", "REPLACE", "INCREMENTAL"]).optional(),
        })
        .parse(await c.req.json().catch(() => ({})));
      const result = await beginGoogleOAuth(prisma, {
        userId: c.get("userId"),
        organizationId: resolveOrgId(c),
        capabilities: body.capabilities,
        purpose: body.purpose,
      });
      return c.json(result);
    },
  );

  app.get("/api/saas/integrations/google/oauth/callback", async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state");
    const error = c.req.query("error");
    const result = await completeGoogleOAuthCallback(prisma, {
      code,
      state,
      error,
    });
    const appUrl = resolveSaasAppUrl().replace(/\/+$/, "");
    return c.redirect(`${appUrl}${result.redirectPath}`, 302);
  });

  app.post(
    "/api/saas/integrations/google/calendar/pause",
    requireSession,
    async (c) => {
      const body = z
        .object({ paused: z.boolean() })
        .parse(await c.req.json());
      const view = await setGoogleCalendarPaused(prisma, {
        userId: c.get("userId"),
        organizationId: resolveOrgId(c),
        paused: body.paused,
      });
      return c.json(view);
    },
  );

  app.post(
    "/api/saas/integrations/google/calendar/sync",
    requireSession,
    async (c) => {
      const view = await requestGoogleCalendarSyncNow(prisma, {
        userId: c.get("userId"),
        organizationId: resolveOrgId(c),
      });
      return c.json(view);
    },
  );

  app.post(
    "/api/saas/integrations/google/calendar/recreate",
    requireSession,
    async (c) => {
      const view = await recreateGoogleCalendar(prisma, {
        userId: c.get("userId"),
        organizationId: resolveOrgId(c),
      });
      return c.json(view);
    },
  );

  // --- Drive import (Phase 2) -------------------------------------------

  /** Short-lived Picker token. Client keeps it in memory only; never cached. */
  app.post(
    "/api/saas/integrations/google/drive/picker-token",
    requireSession,
    async (c) => {
      const result = await mintPickerAccessToken(prisma, {
        userId: c.get("userId"),
        organizationId: resolveOrgId(c),
      });
      c.header("Cache-Control", "no-store");
      return c.json(result);
    },
  );

  app.post(
    "/api/saas/integrations/google/drive/preview",
    requireSession,
    async (c) => {
      const body = z
        .object({
          files: z
            .array(
              z.object({
                id: z.string().min(1).max(256),
                name: z.string().max(512).optional(),
                mimeType: z.string().max(256).optional(),
                sizeBytes: z.number().int().nonnegative().optional(),
              }),
            )
            .min(1)
            .max(50),
        })
        .parse(await c.req.json().catch(() => ({})));
      const result = await previewGoogleDriveFiles(prisma, {
        userId: c.get("userId"),
        organizationId: resolveOrgId(c),
        files: body.files,
      });
      return c.json(result);
    },
  );

  app.post(
    "/api/saas/integrations/google/drive/import",
    requireSession,
    async (c) => {
      const body = z
        .object({
          folderId: z.string().min(1),
          files: z
            .array(
              z.object({
                googleFileId: z.string().min(1).max(256),
                name: z.string().max(512).optional(),
              }),
            )
            .min(1)
            .max(50),
        })
        .parse(await c.req.json().catch(() => ({})));
      const result = await startGoogleDriveImport(prisma, {
        userId: c.get("userId"),
        organizationId: resolveOrgId(c),
        folderId: body.folderId,
        files: body.files,
      });
      return c.json(result, 202);
    },
  );

  /** Poll import records by id (`?ids=a,b,c`). Scoped to the caller + org. */
  app.get(
    "/api/saas/integrations/google/drive/import/status",
    requireSession,
    async (c) => {
      const ids = String(c.req.query("ids") ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      const result = await getGoogleDriveImportStatus(prisma, {
        userId: c.get("userId"),
        organizationId: resolveOrgId(c),
        recordIds: ids,
      });
      return c.json(result);
    },
  );

  // --- Drive tender folders (Phase 3) -----------------------------------

  /** Existing snapshot folders for a tender (this user + org only). */
  app.get(
    "/api/saas/integrations/google/drive/folders",
    requireSession,
    async (c) => {
      const tenderId = z.string().min(1).parse(c.req.query("tenderId"));
      const result = await listExistingFolders(prisma, {
        userId: c.get("userId"),
        organizationId: resolveOrgId(c),
        tenderId,
      });
      return c.json(result);
    },
  );

  app.post(
    "/api/saas/integrations/google/drive/folders/preview",
    requireSession,
    async (c) => {
      const body = z
        .object({
          tenderId: z.string().min(1),
          vaultDocumentIds: z.array(z.string().min(1)).max(50).optional(),
        })
        .parse(await c.req.json().catch(() => ({})));
      const result = await previewCreateTenderDriveFolder(
        prisma,
        {
          userId: c.get("userId"),
          organizationId: resolveOrgId(c),
          tenderId: body.tenderId,
          vaultDocumentIds: body.vaultDocumentIds,
        },
        { kimdis },
      );
      c.header("Cache-Control", "no-store");
      return c.json(result);
    },
  );

  app.post(
    "/api/saas/integrations/google/drive/folders",
    requireSession,
    async (c) => {
      const body = z
        .object({
          tenderId: z.string().min(1),
          folderName: z.string().max(200).optional(),
          vaultDocumentIds: z.array(z.string().min(1)).max(50).optional(),
          includeOfficialDocs: z.boolean().optional(),
          includeChecklistSummary: z.boolean().optional(),
          clientRequestId: z.string().max(64).optional(),
        })
        .parse(await c.req.json().catch(() => ({})));
      const result = await startCreateTenderDriveFolder(
        prisma,
        {
          userId: c.get("userId"),
          organizationId: resolveOrgId(c),
          ...body,
        },
        { kimdis },
      );
      return c.json({ folder: result }, 202);
    },
  );

  /** Poll one snapshot (`linkId` is the batch id returned by start). */
  app.get(
    "/api/saas/integrations/google/drive/folders/jobs/:linkId",
    requireSession,
    async (c) => {
      const result = await getDriveFolderStatus(prisma, {
        userId: c.get("userId"),
        organizationId: resolveOrgId(c),
        linkId: c.req.param("linkId"),
      });
      return c.json({ folder: result });
    },
  );

  /** Re-run only the failed / unfinished items of the same snapshot. */
  app.post(
    "/api/saas/integrations/google/drive/folders/:linkId/retry",
    requireSession,
    async (c) => {
      const result = await retryTenderDriveFolder(prisma, {
        userId: c.get("userId"),
        organizationId: resolveOrgId(c),
        linkId: c.req.param("linkId"),
      });
      return c.json({ folder: result }, 202);
    },
  );

  app.post(
    "/api/saas/integrations/google/disconnect",
    requireSession,
    async (c) => {
      const body = z
        .object({
          capability: z.enum(["calendar", "drive", "sheets"]).optional(),
        })
        .parse(await c.req.json().catch(() => ({})));
      const view = await disconnectGoogle(prisma, {
        userId: c.get("userId"),
        organizationId: resolveOrgId(c),
        capability: body.capability,
      });
      return c.json(view);
    },
  );
};
