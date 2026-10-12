import { GOOGLE_CALENDAR_API } from "./google-config.js";
import type { CalendarEventContent } from "./google-calendar-events.js";

export type GoogleApiError = {
  status: number;
  code?: string;
  messageSafe: string;
  permanent: boolean;
};

const classifyError = (status: number, body: string): GoogleApiError => {
  const permanent =
    status === 401 ||
    status === 403 ||
    status === 404 ||
    /invalid_grant|invalid_credentials|insufficientPermissions/i.test(body);
  let code = `http_${status}`;
  try {
    const json = JSON.parse(body) as {
      error?: { status?: string; errors?: Array<{ reason?: string }> };
    };
    code =
      json.error?.errors?.[0]?.reason ||
      json.error?.status ||
      code;
  } catch {
    // ignore
  }
  return {
    status,
    code: String(code).slice(0, 80),
    messageSafe: `google_calendar_${code}`.slice(0, 120),
    permanent,
  };
};

const calendarFetch = async (
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; json: unknown } | { ok: false; error: GoogleApiError }> => {
  const res = await fetch(`${GOOGLE_CALENDAR_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, error: classifyError(res.status, text) };
  }
  if (!text) return { ok: true, json: null };
  try {
    return { ok: true, json: JSON.parse(text) };
  } catch {
    return { ok: true, json: text };
  }
};

export const createSecondaryCalendar = async (input: {
  accessToken: string;
  summary: string;
  description?: string;
  timeZone?: string;
}): Promise<
  | { ok: true; id: string; summary: string; htmlLink?: string }
  | { ok: false; error: GoogleApiError }
> => {
  const result = await calendarFetch(input.accessToken, "/calendars", {
    method: "POST",
    body: JSON.stringify({
      summary: input.summary,
      description: input.description,
      timeZone: input.timeZone ?? "Europe/Athens",
    }),
  });
  if (!result.ok) return result;
  const json = result.json as {
    id?: string;
    summary?: string;
    htmlLink?: string;
  };
  if (!json.id) {
    return {
      ok: false,
      error: {
        status: 500,
        code: "missing_calendar_id",
        messageSafe: "google_calendar_missing_id",
        permanent: false,
      },
    };
  }
  return {
    ok: true,
    id: json.id,
    summary: json.summary ?? input.summary,
    htmlLink: json.htmlLink,
  };
};

export const getCalendar = async (input: {
  accessToken: string;
  calendarId: string;
}): Promise<
  | { ok: true; id: string; summary?: string }
  | { ok: false; error: GoogleApiError }
> => {
  const result = await calendarFetch(
    input.accessToken,
    `/calendars/${encodeURIComponent(input.calendarId)}`,
  );
  if (!result.ok) return result;
  const json = result.json as { id?: string; summary?: string };
  if (!json.id) {
    return {
      ok: false,
      error: {
        status: 404,
        code: "notFound",
        messageSafe: "google_calendar_not_found",
        permanent: true,
      },
    };
  }
  return { ok: true, id: json.id, summary: json.summary };
};

export const insertCalendarEvent = async (input: {
  accessToken: string;
  calendarId: string;
  event: CalendarEventContent;
}): Promise<
  | { ok: true; id: string; htmlLink?: string }
  | { ok: false; error: GoogleApiError }
> => {
  const result = await calendarFetch(
    input.accessToken,
    `/calendars/${encodeURIComponent(input.calendarId)}/events`,
    {
      method: "POST",
      body: JSON.stringify({
        summary: input.event.summary,
        description: input.event.description,
        start: input.event.start,
        end: input.event.end,
        source: input.event.source,
      }),
    },
  );
  if (!result.ok) return result;
  const json = result.json as { id?: string; htmlLink?: string };
  if (!json.id) {
    return {
      ok: false,
      error: {
        status: 500,
        code: "missing_event_id",
        messageSafe: "google_event_missing_id",
        permanent: false,
      },
    };
  }
  return { ok: true, id: json.id, htmlLink: json.htmlLink };
};

export const patchCalendarEvent = async (input: {
  accessToken: string;
  calendarId: string;
  eventId: string;
  event: CalendarEventContent;
}): Promise<{ ok: true } | { ok: false; error: GoogleApiError }> => {
  const result = await calendarFetch(
    input.accessToken,
    `/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        summary: input.event.summary,
        description: input.event.description,
        start: input.event.start,
        end: input.event.end,
        source: input.event.source,
      }),
    },
  );
  if (!result.ok) return result;
  return { ok: true };
};

export const deleteCalendarEvent = async (input: {
  accessToken: string;
  calendarId: string;
  eventId: string;
}): Promise<{ ok: true } | { ok: false; error: GoogleApiError }> => {
  const result = await calendarFetch(
    input.accessToken,
    `/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}`,
    { method: "DELETE" },
  );
  if (!result.ok) {
    // Already gone is fine.
    if (result.error.status === 404 || result.error.code === "notFound") {
      return { ok: true };
    }
    return result;
  }
  return { ok: true };
};
