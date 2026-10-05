import type { LegalDocument } from "@/legal";

type LegalDocumentViewProps = {
  document: LegalDocument;
  compact?: boolean;
};

export const LegalDocumentView = ({
  document,
  compact = false,
}: LegalDocumentViewProps) => (
  <article className={compact ? "space-y-5" : "space-y-8"}>
    <header className="space-y-2 border-b border-border pb-4">
      <h1 className={compact ? "text-xl font-semibold" : "text-2xl font-semibold tracking-tight"}>
        {document.title}
      </h1>
      <p className="text-sm text-muted-foreground">{document.summary}</p>
      <p className="text-xs text-muted-foreground">
        Έκδοση {document.version} · Ισχύει από {document.effectiveDate}
      </p>
    </header>

    {document.sections.map((section) => (
      <section key={section.id} className="space-y-3" aria-labelledby={`legal-${section.id}`}>
        <h2 id={`legal-${section.id}`} className="text-base font-semibold">
          {section.title}
        </h2>
        {section.paragraphs.map((paragraph) => (
          <p key={paragraph.slice(0, 64)} className="text-sm leading-relaxed text-muted-foreground">
            {paragraph}
          </p>
        ))}
        {section.bullets && section.bullets.length > 0 ? (
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
            {section.bullets.map((item) => (
              <li key={item.slice(0, 64)}>{item}</li>
            ))}
          </ul>
        ) : null}
        {section.closing?.map((paragraph) => (
          <p key={paragraph.slice(0, 64)} className="text-sm leading-relaxed text-muted-foreground">
            {paragraph}
          </p>
        ))}
        {section.links && section.links.length > 0 ? (
          <ul className="space-y-1.5 pt-1 text-sm">
            {section.links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    ))}
  </article>
);
