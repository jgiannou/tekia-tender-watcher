import { Link, useParams } from "react-router-dom";
import { LegalDocumentView } from "@/components/LegalDocumentView";
import { getLegalDocument, isLegalDocId, LEGAL_HUB_ITEMS } from "@/legal";

export const LegalPublicPage = () => {
  const { docId } = useParams();
  if (!isLegalDocId(docId)) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <p className="text-sm text-muted-foreground">Το νομικό κείμενο δεν βρέθηκε.</p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          {LEGAL_HUB_ITEMS.slice(0, 3).map((item) => (
            <Link
              key={item.id}
              className="text-primary underline-offset-4 hover:underline"
              to={`/legal/${item.id}`}
            >
              {item.label}
            </Link>
          ))}
          <Link className="text-primary underline-offset-4 hover:underline" to="/login">
            Σύνδεση
          </Link>
        </div>
      </div>
    );
  }

  const document = getLegalDocument(docId);

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            ARC Tenders
          </div>
          <nav className="flex flex-wrap gap-3 text-xs text-muted-foreground" aria-label="Νομικά">
            <Link className="hover:text-foreground" to="/legal/terms">
              Όροι Χρήσης
            </Link>
            <Link className="hover:text-foreground" to="/legal/privacy">
              Πολιτική Απορρήτου
            </Link>
            <Link className="hover:text-foreground" to="/legal/cookies">
              Cookies
            </Link>
            <Link className="hover:text-foreground" to="/legal/data-sources">
              Πηγές
            </Link>
            <Link className="hover:text-foreground" to="/login">
              Σύνδεση
            </Link>
          </nav>
        </div>
      </div>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <LegalDocumentView document={document} />
      </main>
    </div>
  );
};
