import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { LegalDocumentView } from "@/components/LegalDocumentView";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DATA_SOURCE_ATTRIBUTION,
  LEGAL_CONTROLLER,
  LEGAL_HUB_ITEMS,
  LEGAL_VERSIONS,
  getLegalDocument,
  isLegalDocId,
} from "@/legal";
import { saasApi, type LegalAcceptance } from "@/lib/api";
import { cn } from "@/lib/utils";

export const LegalSettingsPage = () => {
  const { docId } = useParams();
  const activeId = isLegalDocId(docId) ? docId : null;
  const [acceptance, setAcceptance] = useState<LegalAcceptance | null>(null);

  useEffect(() => {
    if (activeId) return;
    void saasApi
      .me()
      .then((me) => setAcceptance(me.legalAcceptance ?? null))
      .catch(() => setAcceptance(null));
  }, [activeId]);

  if (activeId) {
    return (
      <Card>
        <CardHeader>
          <CardDescription>
            <Link
              to="/app/settings/legal"
              className="text-primary underline-offset-4 hover:underline"
            >
              ← Νομικά & Πηγές
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LegalDocumentView document={getLegalDocument(activeId)} compact />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Νομικά &amp; Πηγές</CardTitle>
          <CardDescription>
            Όροι, απόρρητο, cookies, πηγές δεδομένων, DPA και στοιχεία παρόχου για{" "}
            {LEGAL_CONTROLLER.productName}. Χωρίς footer στην εφαρμογή — όλα είναι εδώ,
            μονίμως προσβάσιμα.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Ανεξάρτητη υπηρεσία</p>
            <p className="mt-1 leading-relaxed">
              Το ARC Tenders είναι ιδιωτική υπηρεσία λογισμικού και δεν αποτελεί επίσημη
              υπηρεσία ή συνεργάτη του ΚΗΜΔΗΣ / ΕΣΗΔΗΣ / Ελληνικού Δημοσίου.
            </p>
            <p className="mt-2 text-xs">{DATA_SOURCE_ATTRIBUTION.kimdisFull}</p>
          </div>

          <p className="text-sm text-muted-foreground">
            Εκδόσεις: Όροι {LEGAL_VERSIONS.terms} · Απόρρητο {LEGAL_VERSIONS.privacy} ·
            Cookies {LEGAL_VERSIONS.cookies} · DPA {LEGAL_VERSIONS.dpa}.
          </p>
          <p className="text-sm text-muted-foreground">
            {acceptance
              ? `Έχετε αποδεχτεί Όρους ${acceptance.termsVersion} και Απόρρητο ${acceptance.privacyVersion} στις ${new Date(acceptance.acceptedAt).toLocaleString("el-GR")}.`
              : "Δεν υπάρχει καταγεγραμμένη αποδοχή για αυτόν τον λογαριασμό (ισχύει για λογαριασμούς πριν την ενεργοποίηση της καταγραφής)."}
          </p>

          <ul className="space-y-2">
            {LEGAL_HUB_ITEMS.map((doc) => (
              <li key={doc.id}>
                <Link
                  to={`/app/settings/legal/${doc.id}`}
                  className={cn(
                    "block rounded-md border border-border px-4 py-3 transition-colors hover:bg-muted",
                  )}
                >
                  <div className="text-sm font-medium text-foreground">{doc.label}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{doc.blurb}</div>
                </Link>
              </li>
            ))}
          </ul>

          <p className="text-xs text-muted-foreground">
            Διαγραφή λογαριασμού:{" "}
            <Link
              to="/app/settings/profile"
              className="text-primary underline-offset-4 hover:underline"
            >
              Ρυθμίσεις → Προφίλ
            </Link>
            . Δημόσια κείμενα χωρίς σύνδεση:{" "}
            <Link
              to="/legal/terms"
              className="text-primary underline-offset-4 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              /legal/…
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
