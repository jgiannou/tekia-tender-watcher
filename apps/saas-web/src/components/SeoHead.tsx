import { useEffect } from "react";
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_TITLE,
  SITE_NAME,
  absoluteUrl,
  type SeoConfig,
} from "@/lib/seo";

const upsertMeta = (
  attr: "name" | "property",
  key: string,
  content: string,
) => {
  const selector = `meta[${attr}="${key}"]`;
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
};

const upsertLink = (rel: string, href: string) => {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
};

/** Client-side document head updates for SPA routes (complements static index.html). */
export const SeoHead = ({
  title,
  description = DEFAULT_DESCRIPTION,
  path = "/",
  noindex = false,
  imagePath = "/og-image.png",
}: SeoConfig) => {
  useEffect(() => {
    const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
    document.title = fullTitle || DEFAULT_TITLE;

    const url = absoluteUrl(path);
    const image = absoluteUrl(imagePath);

    upsertMeta("name", "description", description);
    upsertMeta("name", "robots", noindex ? "noindex, nofollow" : "index, follow");
    upsertMeta("property", "og:title", fullTitle);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:url", url);
    upsertMeta("property", "og:image", image);
    upsertMeta("name", "twitter:title", fullTitle);
    upsertMeta("name", "twitter:description", description);
    upsertMeta("name", "twitter:image", image);
    upsertLink("canonical", url);
  }, [title, description, path, noindex, imagePath]);

  return null;
};
