const isSensitiveParam = (key: string): boolean => {
  const lower = key.toLowerCase();
  return (
    lower.includes("token") ||
    lower.includes("password") ||
    lower.includes("email") ||
    lower.includes("secret") ||
    lower === "code" ||
    lower === "session" ||
    lower === "key"
  );
};

const STASH_KEY = "arc.analytics.sensitiveQuery";

const valueLeaksSecret = (value: string): boolean =>
  value.includes("token=") || value.includes("password=") || value.includes("email=");

const stashSensitive = (sensitive: URLSearchParams): boolean => {
  try {
    const merged = new URLSearchParams(window.sessionStorage.getItem(STASH_KEY) ?? "");
    for (const [key, value] of sensitive.entries()) merged.set(key, value);
    window.sessionStorage.setItem(STASH_KEY, merged.toString());
    return true;
  } catch {
    return false;
  }
};

const splitSearch = (
  search: string,
): { kept: URLSearchParams; sensitive: URLSearchParams } => {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const kept = new URLSearchParams();
  const sensitive = new URLSearchParams();
  for (const [key, value] of params.entries()) {
    if (isSensitiveParam(key) || valueLeaksSecret(value)) {
      sensitive.append(key, value);
      continue;
    }
    kept.append(key, value);
  }
  return { kept, sensitive };
};

const cleanText = (value: string, max = 80): string => {
  const clean = value.replace(/\s+/g, " ").trim().slice(0, max);
  if (!clean || clean.includes("@")) return "";
  return clean;
};

export const safePagePath = (pathname: string, search: string): string => {
  const { kept: rawKept } = splitSearch(search);
  const kept = new URLSearchParams();
  for (const [key, value] of rawKept.entries()) {
    if (key === "ga_debug") continue;
    const next = cleanText(value);
    if (next) kept.append(key, next);
  }
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const qs = kept.toString();
  return qs ? `${path}?${qs}` : path;
};

/** Token saved before it is removed from the address bar. */
export const readStashedParam = (key: string): string => {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.sessionStorage.getItem(STASH_KEY);
    if (!raw) return "";
    return new URLSearchParams(raw).get(key)?.trim() ?? "";
  } catch {
    return "";
  }
};

export const redactSensitiveUrl = (): void => {
  if (typeof window === "undefined") return;
  const { kept, sensitive } = splitSearch(window.location.search);
  if ([...sensitive.keys()].length === 0) return;
  if (!stashSensitive(sensitive)) return;
  const qs = kept.toString();
  const next = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
  window.history.replaceState(window.history.state, "", `${window.location.origin}${next}`);
};

const scrubUrl = (url: string | URL): string => {
  const next = new URL(String(url), window.location.origin);
  const { kept, sensitive } = splitSearch(next.search);
  if ([...sensitive.keys()].length === 0) {
    return `${next.pathname}${next.search}${next.hash}`;
  }
  if (!stashSensitive(sensitive)) {
    return `${next.pathname}${next.search}${next.hash}`;
  }
  const qs = kept.toString();
  return `${next.pathname}${qs ? `?${qs}` : ""}${next.hash}`;
};

/** Call once, before React renders, so Google never sees reset or invite tokens. */
export const installSensitiveUrlScrubber = (): void => {
  if (typeof window === "undefined") return;
  const marked = window as Window & { __arcUrlScrubber?: boolean };
  if (marked.__arcUrlScrubber) return;
  marked.__arcUrlScrubber = true;
  const originalPush = window.history.pushState.bind(window.history);
  const originalReplace = window.history.replaceState.bind(window.history);
  window.history.pushState = (state, unused, url) => {
    originalPush(state, unused, url == null ? url : scrubUrl(url));
  };
  window.history.replaceState = (state, unused, url) => {
    originalReplace(state, unused, url == null ? url : scrubUrl(url));
  };
  redactSensitiveUrl();
};
