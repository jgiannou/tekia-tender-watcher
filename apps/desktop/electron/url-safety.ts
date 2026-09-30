export const isAllowedExternalUrl = (
  raw: string,
  options?: { allowHttpLocalhost?: boolean },
): boolean => {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }

  if (parsed.protocol === "https:") return true;

  if (
    options?.allowHttpLocalhost &&
    parsed.protocol === "http:" &&
    (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
  ) {
    return true;
  }

  return false;
};

export const parseDeepLink = (
  url: string,
): { type: "tender"; referenceNumber: string } | null => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== "tekia-tender:") return null;

  // tekia-tender://tender/26REQ019...
  const host = parsed.hostname || parsed.host;
  const parts = [host, ...parsed.pathname.split("/").filter(Boolean)].filter(
    Boolean,
  );

  if (parts[0] === "tender" && parts[1]) {
    return { type: "tender", referenceNumber: decodeURIComponent(parts[1]) };
  }

  return null;
};
