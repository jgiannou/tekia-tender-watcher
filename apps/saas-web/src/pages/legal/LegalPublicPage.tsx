import { Link, useParams } from "react-router-dom";
import { LegalDocumentView } from "@/components/LegalDocumentView";
import { getLegalDocument, type LegalDocId } from "@/legal";

const isLegalDocId = (value: string | undefined): value is LegalDocId =>
  value === "terms" || value === "privacy" || value === "cookies";

export const LegalPublicPage = () => {
  const { docId } = useParams();
  if (!isLegalDocId(docId)) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <p className="text-sm text-muted-foreground">Το νομικό κείμενο δεν βρέθηκε.</p>
        <Link className="mt-4 inline-block text-sm text-primary underline-offset-4 hover:underline" to="/login">
          Επιστροφή
        </Link>
      </div>
    );
  }

  const document = getLegalDocument(docId);

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            ARC Tenders
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <Link className="hover:text-foreground" to="/legal/terms">
              Όροι
            </Link>
            <Link className="hover:text-foreground" to="/legal/privacy">
              Απόρρητο
            </Link>
            <Link className="hover:text-foreground" to="/legal/cookies">
              Cookies
            </Link>
            <Link className="hover:text-foreground" to="/login">
              Σύνδεση
            </Link>
          </div>
        </div>
      </div>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <LegalDocumentView document={document} />
      </main>
    </div>
  );
};
