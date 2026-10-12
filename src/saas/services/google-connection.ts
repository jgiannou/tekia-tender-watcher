import { randomBytes } from "node:crypto";
import type { GoogleCapabilityStatus, PrismaClient } from "@prisma/client";
import { requireOrgMembership } from "../auth/org-context.js";
import {
  badRequest,
  forbidden,
  notFound,
  serviceUnavailable,
} from "../errors.js";
import { entitlementsForPlanKey } from "../plans/catalog.js";
import {
  cancelPendingGoogleJobsForConnection,
  cancelPendingGoogleJobsForUserOrg,
  GOOGLE_DRIVE_SAAS_JOB_TYPES,
} from "../jobs/outbox.js";
import { resolveOrganizationScanAccess } from "./scan-access.js";
import {
  GOOGLE_DRIVE_IMPORT_COPY_HINT_EL,
  hasGrantedScope,
  isSaasGoogleCalendarEnabled,
  isSaasGoogleDriveEnabled,
  isSaasGoogleOAuthConfigured,
  isSaasGooglePickerConfigured,
  isSaasGoogleSheetsEnabled,
  GOOGLE_SCOPE_CALENDAR_APP_CREATED,
  GOOGLE_SCOPE_DRIVE_FILE,
  GOOGLE_SCOPE_SPREADSHEETS,
  parseCapabilities,
  type GoogleCapability,
} from "./google-config.js";
import {
  buildGoogleAuthorizeUrl,
  createPkcePair,
  decryptGoogleToken,
  encryptGoogleToken,
  exchangeGoogleAuthorizationCode,
  fetchGoogleUserInfo,
  mergeGrantedScopes,
  refreshGoogleAccessToken,
  revokeGoogleToken,
} from "./google-oauth.js";
import { createSecondaryCalendar, getCalendar } from "./google-calendar-api.js";

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const ACCESS_TOKEN_SKEW_MS = 60_000;

export type GoogleIntegrationsPublicView = {
  oauthConfigured: boolean;
  calendar: {
    featureAvailable: boolean;
    entitled: boolean;
    status: GoogleCapabilityStatus | "DISCONNECTED";
    statusLabelEl: string;
    googleEmail: string | null;
    calendarSummary: string | null;
    calendarHtmlLink: string | null;
    lastSuccessAt: string | null;
    canManage: boolean;
  };
  drive: {
    featureAvailable: boolean;
    entitled: boolean;
    status: GoogleCapabilityStatus | "DISCONNECTED";
    statusLabelEl: string;
    googleEmail: string | null;
    canManage: boolean;
    /** Picker API key + app id configured (import button needs this). */
    pickerConfigured: boolean;
    /** Plan includes Drive AND the company vault (import writes into the vault). */
    importEntitled: boolean;
  };
  sheets: {
    featureAvailable: boolean;
    entitled: boolean;
    status: GoogleCapabilityStatus | "DISCONNECTED";
    statusLabelEl: string;
    googleEmail: string | null;
    spreadsheetUrl: string | null;
    lastSuccessAt: string | null;
    canManage: boolean;
    /** Hidden until Phase 4 ships behind flag. */
    released: boolean;
  };
  messages: {
    freeLockedEl: string;
    calendarHintEl: string;
    calendarPauseHintEl: string;
    calendarOneWayEl: string;
    driveHintEl: string;
    importCopyHintEl: string;
    sheetsHintEl: string;
    reconnectEl: string;
    oauthCancelEl: string;
    disconnectExplainEl: string;
  };
};

const MESSAGES = {
  freeLockedEl: "Η δυνατότητα είναι διαθέσιμη στα πακέτα Basic και Pro.",
  calendarHintEl:
    "Θα δημιουργήσουμε ένα ξεχωριστό ημερολόγιο για τις προθεσμίες των διαγωνισμών που παρακολουθείτε. Οι αλλαγές που εντοπίζει το ARC θα ενημερώνονται εκεί αυτόματα.",
  calendarPauseHintEl:
    "Όσο ο συγχρονισμός είναι σε παύση, οι προθεσμίες στο Google Calendar δεν ενημερώνονται.",
  calendarOneWayEl:
    "Το ARC ενημερώνει τα συμβάντα αυτού του ημερολογίου. Οι αλλαγές που κάνετε στο Google Calendar δεν μεταφέρονται στο ARC και μπορεί να αντικατασταθούν στον επόμενο συγχρονισμό.",
  driveHintEl:
    "Εισαγάγετε επιλεγμένα έγγραφα από το Google Drive και οργανώστε τον φάκελο του διαγωνισμού σας.",
  importCopyHintEl: GOOGLE_DRIVE_IMPORT_COPY_HINT_EL,
  sheetsHintEl:
    "Δείτε τους διαγωνισμούς που παρακολουθείτε σε ένα φύλλο που ενημερώνεται από το ARC.",
  reconnectEl: "Χρειάζεται επανασύνδεση",
  oauthCancelEl: "Η σύνδεση δεν ολοκληρώθηκε. Μπορείτε να δοκιμάσετε ξανά.",
  disconnectExplainEl:
    "Η αποσύνδεση σταματά τις ενημερώσεις από το ARC. Τα ημερολόγια και τα αρχεία στο Google παραμένουν στον λογαριασμό σας και δεν διαγράφονται.",
} as const;

const calendarStatusLabelEl = (
  status: GoogleCapabilityStatus | "DISCONNECTED",
): string => {
  switch (status) {
    case "DISCONNECTED":
    case "DISABLED":
      return "Δεν έχει συνδεθεί";
    case "ACTIVE":
      return "Ο συγχρονισμός είναι ενεργός";
    case "PAUSED":
      return "Ο συγχρονισμός είναι σε παύση";
    case "PLAN_PAUSED":
      return "Οι ενημερώσεις έχουν τεθεί σε παύση. Απαιτείται ενεργό Basic ή Pro.";
    case "NEEDS_RECONNECT":
      return "Χρειάζεται επανασύνδεση";
    case "NEEDS_RECREATE":
      return "Το ημερολόγιο δεν βρέθηκε. Μπορείτε να το δημιουργήσετε ξανά.";
    case "SYNCING":
      return "Αρχικός συγχρονισμός σε εξέλιξη";
    default:
      return "Δεν έχει συνδεθεί";
  }
};

export const driveStatusLabelEl = (
  status: GoogleCapabilityStatus | "DISCONNECTED",
): string => {
  switch (status) {
    case "DISCONNECTED":
    case "DISABLED":
      return "Δεν έχει συνδεθεί";
    case "NEEDS_RECONNECT":
      return MESSAGES.reconnectEl;
    case "PLAN_PAUSED":
      return "Απαιτείται ενεργό Basic ή Pro.";
    default:
      return "Συνδεδεμένο";
  }
};

export const requireVerifiedMember = async (
  prisma: PrismaClient,
  input: { userId: string; organizationId: string | null },
) => {
  const ctx = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { emailVerified: true },
  });
  if (!user?.emailVerified) throw forbidden("email_not_verified");
  return ctx;
};

export const assertGoogleEntitled = async (
  prisma: PrismaClient,
  input: { userId: string; organizationId: string },
  capability: GoogleCapability,
) => {
  const scanAccess = await resolveOrganizationScanAccess(prisma, input);
  if (scanAccess.status !== "active" && scanAccess.status !== "trial") {
    throw forbidden("subscription_inactive");
  }
  const plan = entitlementsForPlanKey(scanAccess.planKey);
  if (capability === "calendar" && !plan.googleCalendar) {
    throw forbidden("plan_feature_locked");
  }
  if (capability === "drive" && !plan.googleDrive) {
    throw forbidden("plan_feature_locked");
  }
  if (capability === "sheets" && !plan.googleSheets) {
    throw forbidden("plan_feature_locked");
  }
  return { scanAccess, plan };
};

export const getGoogleIntegrationsView = async (
  prisma: PrismaClient,
  input: { userId: string; organizationId: string | null },
): Promise<GoogleIntegrationsPublicView> => {
  const ctx = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );
  const scanAccess = await resolveOrganizationScanAccess(prisma, {
    userId: input.userId,
    organizationId: ctx.organizationId,
  });
  const plan = entitlementsForPlanKey(scanAccess.planKey);
  const entitledBase =
    scanAccess.status === "active" || scanAccess.status === "trial";
  const row = await prisma.userOrganizationGoogleConnection.findUnique({
    where: {
      organizationId_userId: {
        organizationId: ctx.organizationId,
        userId: input.userId,
      },
    },
  });

  const calendarStatus = !row
    ? ("DISCONNECTED" as const)
    : row.tokenStatus === "NEEDS_RECONNECT"
      ? ("NEEDS_RECONNECT" as const)
      : row.calendarStatus;
  const driveStatus = !row
    ? ("DISCONNECTED" as const)
    : row.tokenStatus === "NEEDS_RECONNECT"
      ? ("NEEDS_RECONNECT" as const)
      : row.driveStatus;
  const sheetsStatus = !row
    ? ("DISCONNECTED" as const)
    : row.tokenStatus === "NEEDS_RECONNECT"
      ? ("NEEDS_RECONNECT" as const)
      : row.sheetsStatus;

  return {
    oauthConfigured: isSaasGoogleOAuthConfigured(),
    calendar: {
      featureAvailable: isSaasGoogleCalendarEnabled(),
      entitled: entitledBase && plan.googleCalendar,
      status: calendarStatus,
      statusLabelEl: calendarStatusLabelEl(calendarStatus),
      googleEmail: row?.googleEmail ?? null,
      calendarSummary: row?.calendarSummary ?? null,
      calendarHtmlLink: row?.calendarHtmlLink ?? null,
      lastSuccessAt: row?.calendarLastSuccessAt?.toISOString() ?? null,
      canManage: true,
    },
    drive: {
      featureAvailable: isSaasGoogleDriveEnabled(),
      entitled: entitledBase && plan.googleDrive,
      status: driveStatus,
      statusLabelEl: driveStatusLabelEl(driveStatus),
      googleEmail: row?.googleEmail ?? null,
      canManage: true,
      pickerConfigured: isSaasGooglePickerConfigured(),
      importEntitled:
        entitledBase && plan.googleDrive && plan.companyVault,
    },
    sheets: {
      featureAvailable: isSaasGoogleSheetsEnabled(),
      entitled: entitledBase && plan.googleSheets,
      status: sheetsStatus,
      statusLabelEl:
        sheetsStatus === "DISCONNECTED" || sheetsStatus === "DISABLED"
          ? "Δεν έχει συνδεθεί"
          : sheetsStatus === "NEEDS_RECONNECT"
            ? MESSAGES.reconnectEl
            : sheetsStatus === "ACTIVE"
              ? "Ο συγχρονισμός είναι ενεργός"
              : sheetsStatus === "PAUSED"
                ? "Ο συγχρονισμός είναι σε παύση"
                : String(sheetsStatus),
      googleEmail: row?.googleEmail ?? null,
      spreadsheetUrl: row?.spreadsheetUrl ?? null,
      lastSuccessAt: row?.sheetsLastSuccessAt?.toISOString() ?? null,
      canManage: true,
      released: isSaasGoogleSheetsEnabled(),
    },
    messages: { ...MESSAGES },
  };
};

export const beginGoogleOAuth = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string | null;
    capabilities: GoogleCapability[];
    purpose?: "CONNECT" | "REPLACE" | "INCREMENTAL";
  },
): Promise<{ authorizeUrl: string }> => {
  if (!isSaasGoogleOAuthConfigured()) {
    throw serviceUnavailable("google_not_configured");
  }
  const caps = input.capabilities;
  if (caps.length === 0) throw badRequest("google_capabilities_required");
  if (caps.includes("calendar") && !isSaasGoogleCalendarEnabled()) {
    throw serviceUnavailable("google_calendar_disabled");
  }
  if (caps.includes("drive") && !isSaasGoogleDriveEnabled()) {
    throw serviceUnavailable("google_drive_disabled");
  }
  if (caps.includes("sheets") && !isSaasGoogleSheetsEnabled()) {
    throw serviceUnavailable("google_sheets_disabled");
  }

  const ctx = await requireVerifiedMember(prisma, input);
  for (const cap of caps) {
    await assertGoogleEntitled(
      prisma,
      { userId: ctx.userId, organizationId: ctx.organizationId },
      cap,
    );
  }

  const existing = await prisma.userOrganizationGoogleConnection.findUnique({
    where: {
      organizationId_userId: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
      },
    },
  });
  const purpose = input.purpose ?? (existing ? "INCREMENTAL" : "CONNECT");
  const { codeVerifier, codeChallenge } = createPkcePair();
  const state = randomBytes(24).toString("base64url");
  await prisma.googleOAuthState.create({
    data: {
      state,
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      purpose,
      capabilities: caps.join(","),
      codeVerifier,
      expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
    },
  });

  return {
    authorizeUrl: buildGoogleAuthorizeUrl({
      state,
      codeChallenge,
      capabilities: caps,
      loginHint: existing?.googleEmail,
    }),
  };
};

export type GoogleOAuthCallbackResult = {
  ok: boolean;
  redirectPath: string;
  errorCode?: string;
};

export const completeGoogleOAuthCallback = async (
  prisma: PrismaClient,
  input: {
    code?: string | null;
    state?: string | null;
    error?: string | null;
  },
): Promise<GoogleOAuthCallbackResult> => {
  const base = "/app/settings/connections";
  if (input.error) {
    return {
      ok: false,
      redirectPath: `${base}?google=cancelled`,
      errorCode: "cancelled",
    };
  }
  if (!input.code || !input.state) {
    return {
      ok: false,
      redirectPath: `${base}?google=error&reason=missing_params`,
      errorCode: "missing_params",
    };
  }

  const stateRow = await prisma.googleOAuthState.findUnique({
    where: { state: input.state },
  });
  if (!stateRow || stateRow.consumedAt) {
    return {
      ok: false,
      redirectPath: `${base}?google=error&reason=invalid_state`,
      errorCode: "invalid_state",
    };
  }
  if (stateRow.expiresAt.getTime() < Date.now()) {
    return {
      ok: false,
      redirectPath: `${base}?google=error&reason=expired_state`,
      errorCode: "expired_state",
    };
  }
  const consumed = await prisma.googleOAuthState.updateMany({
    where: { id: stateRow.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (consumed.count !== 1) {
    return {
      ok: false,
      redirectPath: `${base}?google=error&reason=replayed_state`,
      errorCode: "replayed_state",
    };
  }

  const capabilities = parseCapabilities(stateRow.capabilities);
  try {
    await requireVerifiedMember(prisma, {
      userId: stateRow.userId,
      organizationId: stateRow.organizationId,
    });
    for (const cap of capabilities) {
      await assertGoogleEntitled(
        prisma,
        {
          userId: stateRow.userId,
          organizationId: stateRow.organizationId,
        },
        cap,
      );
    }
  } catch {
    return {
      ok: false,
      redirectPath: `${base}?google=error&reason=forbidden`,
      errorCode: "forbidden",
    };
  }

  let tokens;
  try {
    tokens = await exchangeGoogleAuthorizationCode({
      code: input.code,
      codeVerifier: stateRow.codeVerifier,
    });
  } catch {
    return {
      ok: false,
      redirectPath: `${base}?google=error&reason=exchange_failed`,
      errorCode: "exchange_failed",
    };
  }
  if (!tokens.access_token) {
    return {
      ok: false,
      redirectPath: `${base}?google=error&reason=no_access_token`,
      errorCode: "no_access_token",
    };
  }

  let userInfo;
  try {
    userInfo = await fetchGoogleUserInfo(tokens.access_token);
  } catch {
    return {
      ok: false,
      redirectPath: `${base}?google=error&reason=userinfo_failed`,
      errorCode: "userinfo_failed",
    };
  }

  const existing = await prisma.userOrganizationGoogleConnection.findUnique({
    where: {
      organizationId_userId: {
        organizationId: stateRow.organizationId,
        userId: stateRow.userId,
      },
    },
  });

  // Preserve refresh token when Google omits it on re-consent.
  let refreshPlain = tokens.refresh_token ?? null;
  if (!refreshPlain && existing) {
    try {
      refreshPlain = decryptGoogleToken({
        ciphertext: existing.refreshTokenCiphertext,
        nonce: existing.refreshTokenNonce,
      });
    } catch {
      refreshPlain = null;
    }
  }
  if (!refreshPlain) {
    return {
      ok: false,
      redirectPath: `${base}?google=error&reason=missing_refresh_token`,
      errorCode: "missing_refresh_token",
    };
  }

  const encRefresh = encryptGoogleToken(refreshPlain);
  const encAccess = encryptGoogleToken(tokens.access_token);
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000)
    : new Date(Date.now() + 3500_000);
  const grantedScopes = mergeGrantedScopes(
    existing?.grantedScopes ?? "",
    tokens.scope,
  );

  // Account switch: cancel old jobs so they cannot write to the new account.
  if (existing && existing.googleAccountId !== userInfo.sub) {
    await cancelPendingGoogleJobsForConnection(prisma, existing.id);
    await cancelPendingGoogleJobsForConnection(
      prisma,
      existing.id,
      "google_account_changed",
      GOOGLE_DRIVE_SAAS_JOB_TYPES,
    );
    // Folders stay (history, labelled with their account) but unfinished ones are stopped.
    await prisma.googleDriveFolderLink.updateMany({
      where: { connectionId: existing.id, status: "PENDING" },
      data: {
        status: "FAILED",
        errorSafe: "account_changed",
        completedAt: new Date(),
      },
    });
    await prisma.googleDriveImportRecord.updateMany({
      where: { connectionId: existing.id, status: "PENDING" },
      data: { status: "FAILED", errorSafe: "connection_stopped" },
    });
    await prisma.googleCalendarEventLink.deleteMany({
      where: { connectionId: existing.id },
    });
  }

  const org = await prisma.organization.findUnique({
    where: { id: stateRow.organizationId },
    select: { name: true },
  });
  const companyName = org?.name?.trim() || "Οργανισμός";

  let calendarStatus: GoogleCapabilityStatus =
    existing?.calendarStatus ?? "DISABLED";
  let calendarId = existing?.calendarId ?? null;
  let calendarHtmlLink = existing?.calendarHtmlLink ?? null;
  let calendarSummary = existing?.calendarSummary ?? null;
  let calendarError: string | null = existing?.calendarLastErrorSafe ?? null;

  if (capabilities.includes("calendar")) {
    if (!hasGrantedScope(grantedScopes, GOOGLE_SCOPE_CALENDAR_APP_CREATED)) {
      return {
        ok: false,
        redirectPath: `${base}?google=error&reason=missing_calendar_scope`,
        errorCode: "missing_calendar_scope",
      };
    }
    const wantNewCalendar =
      !calendarId ||
      stateRow.purpose === "REPLACE" ||
      (existing && existing.googleAccountId !== userInfo.sub) ||
      calendarStatus === "NEEDS_RECREATE";
    if (wantNewCalendar) {
      const created = await createSecondaryCalendar({
        accessToken: tokens.access_token,
        summary: `ARC Tenders — ${companyName}`,
        description:
          "Ημερολόγιο προθεσμιών ARC Tenders. Ενημερώνεται αυτόματα από την εφαρμογή.",
      });
      if (!created.ok) {
        return {
          ok: false,
          redirectPath: `${base}?google=error&reason=calendar_create_failed`,
          errorCode: created.error.code,
        };
      }
      if (existing?.calendarId && existing.calendarId !== created.id) {
        await prisma.googleCalendarEventLink.deleteMany({
          where: { connectionId: existing.id },
        });
      }
      calendarId = created.id;
      calendarSummary = created.summary;
      calendarHtmlLink =
        created.htmlLink ??
        `https://calendar.google.com/calendar/u/0?cid=${encodeURIComponent(created.id)}`;
      calendarStatus = "SYNCING";
      calendarError = null;
    } else if (calendarStatus === "DISABLED" || calendarStatus === "PAUSED") {
      calendarStatus = "SYNCING";
    }
  }

  let driveStatus: GoogleCapabilityStatus = existing?.driveStatus ?? "DISABLED";
  if (capabilities.includes("drive")) {
    if (!hasGrantedScope(grantedScopes, GOOGLE_SCOPE_DRIVE_FILE)) {
      return {
        ok: false,
        redirectPath: `${base}?google=error&reason=missing_drive_scope`,
        errorCode: "missing_drive_scope",
      };
    }
    if (driveStatus === "DISABLED" || driveStatus === "NEEDS_RECONNECT") {
      driveStatus = "ACTIVE";
    }
  }

  let sheetsStatus: GoogleCapabilityStatus =
    existing?.sheetsStatus ?? "DISABLED";
  if (capabilities.includes("sheets")) {
    if (
      !hasGrantedScope(grantedScopes, GOOGLE_SCOPE_SPREADSHEETS) ||
      !hasGrantedScope(grantedScopes, GOOGLE_SCOPE_DRIVE_FILE)
    ) {
      return {
        ok: false,
        redirectPath: `${base}?google=error&reason=missing_sheets_scope`,
        errorCode: "missing_sheets_scope",
      };
    }
    if (sheetsStatus === "DISABLED" || sheetsStatus === "NEEDS_RECONNECT") {
      sheetsStatus = "SYNCING";
    }
  }

  await prisma.userOrganizationGoogleConnection.upsert({
    where: {
      organizationId_userId: {
        organizationId: stateRow.organizationId,
        userId: stateRow.userId,
      },
    },
    create: {
      organizationId: stateRow.organizationId,
      userId: stateRow.userId,
      googleAccountId: userInfo.sub,
      googleEmail: userInfo.email,
      refreshTokenCiphertext: encRefresh.ciphertext,
      refreshTokenNonce: encRefresh.nonce,
      accessTokenCiphertext: encAccess.ciphertext,
      accessTokenNonce: encAccess.nonce,
      accessTokenExpiresAt: expiresAt,
      grantedScopes,
      tokenStatus: "ACTIVE",
      calendarStatus,
      calendarId,
      calendarHtmlLink,
      calendarSummary,
      calendarLastErrorSafe: calendarError,
      driveStatus,
      sheetsStatus,
    },
    update: {
      googleAccountId: userInfo.sub,
      googleEmail: userInfo.email,
      refreshTokenCiphertext: encRefresh.ciphertext,
      refreshTokenNonce: encRefresh.nonce,
      accessTokenCiphertext: encAccess.ciphertext,
      accessTokenNonce: encAccess.nonce,
      accessTokenExpiresAt: expiresAt,
      grantedScopes,
      tokenStatus: "ACTIVE",
      calendarStatus,
      calendarId,
      calendarHtmlLink,
      calendarSummary,
      calendarLastErrorSafe: calendarError,
      calendarLastErrorAt: calendarError ? new Date() : null,
      driveStatus,
      sheetsStatus,
    },
  });

  const connected = await prisma.userOrganizationGoogleConnection.findUniqueOrThrow({
    where: {
      organizationId_userId: {
        organizationId: stateRow.organizationId,
        userId: stateRow.userId,
      },
    },
  });

  if (calendarStatus === "SYNCING") {
    const { enqueueGoogleCalendarFullSync } = await import(
      "./google-calendar-sync.js"
    );
    await enqueueGoogleCalendarFullSync(prisma, {
      connectionId: connected.id,
      organizationId: stateRow.organizationId,
      userId: stateRow.userId,
    });
  }

  const feature = capabilities.includes("calendar")
    ? "calendar"
    : capabilities.includes("drive")
      ? "drive"
      : "sheets";
  return {
    ok: true,
    redirectPath: `${base}?google=connected&feature=${feature}`,
  };
};

/** Returns a valid access token, refreshing when needed. Never logs tokens. */
export const getValidGoogleAccessToken = async (
  prisma: PrismaClient,
  connectionId: string,
): Promise<
  | { ok: true; accessToken: string; connectionId: string }
  | { ok: false; needsReconnect: boolean; errorSafe: string }
> => {
  const row = await prisma.userOrganizationGoogleConnection.findUnique({
    where: { id: connectionId },
  });
  if (!row) {
    return { ok: false, needsReconnect: true, errorSafe: "connection_missing" };
  }
  if (row.tokenStatus === "NEEDS_RECONNECT") {
    return { ok: false, needsReconnect: true, errorSafe: "needs_reconnect" };
  }

  const stillValid =
    row.accessTokenCiphertext &&
    row.accessTokenNonce &&
    row.accessTokenExpiresAt &&
    row.accessTokenExpiresAt.getTime() - ACCESS_TOKEN_SKEW_MS > Date.now();
  if (stillValid && row.accessTokenCiphertext && row.accessTokenNonce) {
    try {
      return {
        ok: true,
        accessToken: decryptGoogleToken({
          ciphertext: row.accessTokenCiphertext,
          nonce: row.accessTokenNonce,
        }),
        connectionId: row.id,
      };
    } catch {
      // fall through to refresh
    }
  }

  let refreshToken: string;
  try {
    refreshToken = decryptGoogleToken({
      ciphertext: row.refreshTokenCiphertext,
      nonce: row.refreshTokenNonce,
    });
  } catch {
    await prisma.userOrganizationGoogleConnection.update({
      where: { id: row.id },
      data: {
        tokenStatus: "NEEDS_RECONNECT",
        calendarStatus:
          row.calendarStatus === "DISABLED"
            ? "DISABLED"
            : "NEEDS_RECONNECT",
      },
    });
    return { ok: false, needsReconnect: true, errorSafe: "decrypt_failed" };
  }

  try {
    const refreshed = await refreshGoogleAccessToken({ refreshToken });
    if (!refreshed.access_token) {
      throw new Error("no_access_token");
    }
    const encAccess = encryptGoogleToken(refreshed.access_token);
    // Keep existing refresh if Google omits a new one.
    const encRefresh = refreshed.refresh_token
      ? encryptGoogleToken(refreshed.refresh_token)
      : null;
    await prisma.userOrganizationGoogleConnection.update({
      where: { id: row.id },
      data: {
        accessTokenCiphertext: encAccess.ciphertext,
        accessTokenNonce: encAccess.nonce,
        accessTokenExpiresAt: refreshed.expires_in
          ? new Date(Date.now() + refreshed.expires_in * 1000)
          : new Date(Date.now() + 3500_000),
        ...(encRefresh
          ? {
              refreshTokenCiphertext: encRefresh.ciphertext,
              refreshTokenNonce: encRefresh.nonce,
            }
          : {}),
        grantedScopes: mergeGrantedScopes(row.grantedScopes, refreshed.scope),
        tokenStatus: "ACTIVE",
      },
    });
    return {
      ok: true,
      accessToken: refreshed.access_token,
      connectionId: row.id,
    };
  } catch {
    await prisma.userOrganizationGoogleConnection.update({
      where: { id: row.id },
      data: {
        tokenStatus: "NEEDS_RECONNECT",
        calendarStatus:
          row.calendarStatus === "DISABLED"
            ? "DISABLED"
            : "NEEDS_RECONNECT",
        calendarLastErrorSafe: "token_refresh_failed",
        calendarLastErrorAt: new Date(),
      },
    });
    return {
      ok: false,
      needsReconnect: true,
      errorSafe: "token_refresh_failed",
    };
  }
};

export const setGoogleCalendarPaused = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string | null;
    paused: boolean;
  },
) => {
  const ctx = await requireVerifiedMember(prisma, input);
  await assertGoogleEntitled(
    prisma,
    { userId: ctx.userId, organizationId: ctx.organizationId },
    "calendar",
  );
  const row = await prisma.userOrganizationGoogleConnection.findUnique({
    where: {
      organizationId_userId: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
      },
    },
  });
  if (!row || row.calendarStatus === "DISABLED") {
    throw notFound("google_calendar_not_connected");
  }
  if (row.tokenStatus === "NEEDS_RECONNECT" || row.calendarStatus === "NEEDS_RECONNECT") {
    throw badRequest("google_needs_reconnect");
  }
  if (input.paused) {
    await cancelPendingGoogleJobsForConnection(prisma, row.id, "calendar_paused");
    await prisma.userOrganizationGoogleConnection.update({
      where: { id: row.id },
      data: { calendarStatus: "PAUSED" },
    });
  } else {
    if (row.calendarStatus === "PLAN_PAUSED") {
      // Allowed when entitled (assert already passed).
    }
    if (!row.calendarId) throw badRequest("google_calendar_missing");
    await prisma.userOrganizationGoogleConnection.update({
      where: { id: row.id },
      data: { calendarStatus: "SYNCING", calendarLastErrorSafe: null },
    });
    const { enqueueGoogleCalendarFullSync } = await import(
      "./google-calendar-sync.js"
    );
    await enqueueGoogleCalendarFullSync(prisma, {
      connectionId: row.id,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
    });
  }
  return getGoogleIntegrationsView(prisma, input);
};

export const requestGoogleCalendarSyncNow = async (
  prisma: PrismaClient,
  input: { userId: string; organizationId: string | null },
) => {
  const ctx = await requireVerifiedMember(prisma, input);
  await assertGoogleEntitled(
    prisma,
    { userId: ctx.userId, organizationId: ctx.organizationId },
    "calendar",
  );
  const row = await prisma.userOrganizationGoogleConnection.findUnique({
    where: {
      organizationId_userId: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
      },
    },
  });
  if (!row?.calendarId) throw notFound("google_calendar_not_connected");
  if (
    row.calendarStatus !== "ACTIVE" &&
    row.calendarStatus !== "SYNCING" &&
    row.calendarStatus !== "PAUSED"
  ) {
    throw badRequest("google_calendar_not_ready");
  }
  if (row.calendarLastSuccessAt) {
    const elapsed = Date.now() - row.calendarLastSuccessAt.getTime();
    if (elapsed < 60_000) throw badRequest("google_sync_rate_limited");
  }
  const { enqueueGoogleCalendarFullSync } = await import(
    "./google-calendar-sync.js"
  );
  await enqueueGoogleCalendarFullSync(prisma, {
    connectionId: row.id,
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    force: true,
  });
  return getGoogleIntegrationsView(prisma, input);
};

export const recreateGoogleCalendar = async (
  prisma: PrismaClient,
  input: { userId: string; organizationId: string | null },
) => {
  const ctx = await requireVerifiedMember(prisma, input);
  await assertGoogleEntitled(
    prisma,
    { userId: ctx.userId, organizationId: ctx.organizationId },
    "calendar",
  );
  const row = await prisma.userOrganizationGoogleConnection.findUnique({
    where: {
      organizationId_userId: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
      },
    },
  });
  if (!row) throw notFound("google_connection_missing");
  const token = await getValidGoogleAccessToken(prisma, row.id);
  if (!token.ok) throw badRequest("google_needs_reconnect");

  const org = await prisma.organization.findUnique({
    where: { id: ctx.organizationId },
    select: { name: true },
  });
  const created = await createSecondaryCalendar({
    accessToken: token.accessToken,
    summary: `ARC Tenders — ${org?.name?.trim() || "Οργανισμός"}`,
  });
  if (!created.ok) {
    if (created.error.permanent) {
      await prisma.userOrganizationGoogleConnection.update({
        where: { id: row.id },
        data: {
          tokenStatus: "NEEDS_RECONNECT",
          calendarStatus: "NEEDS_RECONNECT",
          calendarLastErrorSafe: created.error.messageSafe,
          calendarLastErrorAt: new Date(),
        },
      });
    }
    throw serviceUnavailable("google_calendar_create_failed");
  }
  await prisma.googleCalendarEventLink.deleteMany({
    where: { connectionId: row.id },
  });
  await prisma.userOrganizationGoogleConnection.update({
    where: { id: row.id },
    data: {
      calendarId: created.id,
      calendarSummary: created.summary,
      calendarHtmlLink:
        created.htmlLink ??
        `https://calendar.google.com/calendar/u/0?cid=${encodeURIComponent(created.id)}`,
      calendarStatus: "SYNCING",
      calendarLastErrorSafe: null,
    },
  });
  const { enqueueGoogleCalendarFullSync } = await import(
    "./google-calendar-sync.js"
  );
  await enqueueGoogleCalendarFullSync(prisma, {
    connectionId: row.id,
    organizationId: ctx.organizationId,
    userId: ctx.userId,
  });
  return getGoogleIntegrationsView(prisma, input);
};

export const disconnectGoogle = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string | null;
    /** When set, only disable that capability; omit for full disconnect. */
    capability?: GoogleCapability;
  },
) => {
  const ctx = await requireVerifiedMember(prisma, input);
  const row = await prisma.userOrganizationGoogleConnection.findUnique({
    where: {
      organizationId_userId: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
      },
    },
  });
  if (!row) return getGoogleIntegrationsView(prisma, input);

  if (input.capability === "calendar") {
    await cancelPendingGoogleJobsForConnection(prisma, row.id, "calendar_off");
    await prisma.googleCalendarEventLink.deleteMany({
      where: { connectionId: row.id },
    });
    await prisma.userOrganizationGoogleConnection.update({
      where: { id: row.id },
      data: {
        calendarStatus: "DISABLED",
        calendarId: null,
        calendarHtmlLink: null,
        calendarSummary: null,
        calendarInitialSyncAt: null,
      },
    });
    return getGoogleIntegrationsView(prisma, input);
  }

  if (input.capability === "drive") {
    await cancelPendingGoogleJobsForConnection(
      prisma,
      row.id,
      "drive_off",
      GOOGLE_DRIVE_SAAS_JOB_TYPES,
    );
    await prisma.googleDriveImportRecord.updateMany({
      where: { connectionId: row.id, status: "PENDING" },
      data: { status: "FAILED", errorSafe: "connection_stopped" },
    });
    await prisma.googleDriveFolderLink.updateMany({
      where: { connectionId: row.id, status: "PENDING" },
      data: {
        status: "FAILED",
        errorSafe: "connection_stopped",
        completedAt: new Date(),
      },
    });
    await prisma.userOrganizationGoogleConnection.update({
      where: { id: row.id },
      data: { driveStatus: "DISABLED" },
    });
    return getGoogleIntegrationsView(prisma, input);
  }

  if (input.capability === "sheets") {
    await prisma.userOrganizationGoogleConnection.update({
      where: { id: row.id },
      data: {
        sheetsStatus: "DISABLED",
        spreadsheetId: null,
        spreadsheetUrl: null,
      },
    });
    return getGoogleIntegrationsView(prisma, input);
  }

  // Full disconnect.
  await cancelPendingGoogleJobsForUserOrg(
    prisma,
    ctx.organizationId,
    ctx.userId,
  );
  await cancelPendingGoogleJobsForUserOrg(
    prisma,
    ctx.organizationId,
    ctx.userId,
    "google_connection_stopped",
    GOOGLE_DRIVE_SAAS_JOB_TYPES,
  );
  try {
    const refresh = decryptGoogleToken({
      ciphertext: row.refreshTokenCiphertext,
      nonce: row.refreshTokenNonce,
    });
    await revokeGoogleToken(refresh);
  } catch {
    // ignore
  }
  await prisma.userOrganizationGoogleConnection.delete({
    where: { id: row.id },
  });
  return getGoogleIntegrationsView(prisma, input);
};

/** Verify calendar still exists; mark NEEDS_RECREATE if deleted. */
export const assertGoogleCalendarExists = async (
  prisma: PrismaClient,
  connectionId: string,
  accessToken: string,
): Promise<boolean> => {
  const row = await prisma.userOrganizationGoogleConnection.findUnique({
    where: { id: connectionId },
  });
  if (!row?.calendarId) return false;
  const found = await getCalendar({
    accessToken,
    calendarId: row.calendarId,
  });
  if (found.ok) return true;
  if (found.error.status === 404 || found.error.code === "notFound") {
    await prisma.userOrganizationGoogleConnection.update({
      where: { id: connectionId },
      data: {
        calendarStatus: "NEEDS_RECREATE",
        calendarLastErrorSafe: "calendar_deleted",
        calendarLastErrorAt: new Date(),
      },
    });
    return false;
  }
  if (found.error.permanent) {
    await prisma.userOrganizationGoogleConnection.update({
      where: { id: connectionId },
      data: {
        tokenStatus: "NEEDS_RECONNECT",
        calendarStatus: "NEEDS_RECONNECT",
        calendarLastErrorSafe: found.error.messageSafe,
        calendarLastErrorAt: new Date(),
      },
    });
  }
  return false;
};

export const onGooglePlanDowngradeToFree = async (
  prisma: PrismaClient,
  organizationId: string,
): Promise<{ paused: number }> => {
  const result = await prisma.userOrganizationGoogleConnection.updateMany({
    where: {
      organizationId,
      OR: [
        { calendarStatus: { in: ["ACTIVE", "PAUSED", "SYNCING"] } },
        { sheetsStatus: { in: ["ACTIVE", "PAUSED", "SYNCING"] } },
      ],
    },
    data: {
      calendarStatus: "PLAN_PAUSED",
      sheetsStatus: "PLAN_PAUSED",
    },
  });
  await cancelPendingGoogleJobsForUserOrg(prisma, organizationId, null);
  return { paused: result.count };
};
