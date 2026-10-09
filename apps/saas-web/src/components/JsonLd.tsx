import { useEffect } from "react";

/** Injects a JSON-LD script into document.head for the lifetime of the page. */
export const JsonLd = ({
  id,
  data,
}: {
  id: string;
  data: Record<string, unknown> | Record<string, unknown>[];
}) => {
  useEffect(() => {
    const scriptId = `jsonld-${id}`;
    let el = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!el) {
      el = document.createElement("script");
      el.id = scriptId;
      el.type = "application/ld+json";
      document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(data);
    return () => {
      el?.remove();
    };
  }, [id, data]);

  return null;
};
