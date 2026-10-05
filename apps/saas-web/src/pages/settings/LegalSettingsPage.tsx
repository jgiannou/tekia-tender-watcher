import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { LegalDocumentView } from "@/components/LegalDocumentView";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LEGAL_CONTROLLER,
  LEGAL_VERSIONS,
  getLegalDocument,
  type LegalDocId,
} from "@/legal";
import { saasApi, type LegalAcceptance } from "@/lib/api";
import { cn } from "@/lib/utils";

const docs: Array<{ id: LegalDocId; label: string; blurb: string }> = [
  {
    id: "terms",
    label: "Όροι Χρήσης",
    blurb: "Σύμβαση χρήσης, ευθύνη, trial, αποδεκτή χρήση.",
  },
  {
    id: "privacy",
    label: "Πολιτική Απορρήτου",
    blurb: "Τι δεδομένα τηρούμε, σκοποί, δικαιώματα GDPR.",
  },
  {
    id: "cookies",
    label: "Cookies",
    blurb: "Απαραίτητα cookies συνεδρίας — χωρίς διαφημιστικό tracking.",
  },
];

const isLegalDocId = (value: string | undefined): value is LegalDocId =>
  value === "terms" || value === "privacy" || value === "cookies";

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
              ← Νομικά κείμενα
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
          <CardTitle>Νομικά κείμενα</CardTitle>
          <CardDescription>
            Ισχύοντα κείμενα για την πλατφόρμα {LEGAL_CONTROLLER.productName}. Υπεύθυνος:{" "}
            {LEGAL_CONTROLLER.legalName} (ΑΦΜ {LEGAL_CONTROLLER.afm}, ΓΕΜΗ{" "}
            {LEGAL_CONTROLLER.gemiNumber}). Επικοινωνία: {LEGAL_CONTROLLER.email}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Εκδόσεις: Όροι {LEGAL_VERSIONS.terms} · Απόρρητο {LEGAL_VERSIONS.privacy} · Cookies{" "}
            {LEGAL_VERSIONS.cookies}.
          </p>
          <p className="text-sm text-muted-foreground">
            {acceptance
              ? `Έχετε αποδεχτεί Όρους ${acceptance.termsVersion} και Απόρρητο ${acceptance.privacyVersion} στις ${new Date(acceptance.acceptedAt).toLocaleString("el-GR")}.`
              : "Δεν υπάρχει καταγεγραμμένη αποδοχή για αυτόν τον λογαριασμό (ισχύει για λογαριασμούς πριν την ενεργοποίηση της καταγραφής)."}
          </p>
          <ul className="space-y-2">
            {docs.map((doc) => (
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
        </CardContent>
      </Card>
    </div>
  );
};
