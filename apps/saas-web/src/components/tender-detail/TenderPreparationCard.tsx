import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ParticipationChecklist } from "@/lib/api";

type TenderPreparationCardProps = {
  mode: "early" | "checklist";
  checklist?: ParticipationChecklist | null;
  following: boolean;
  onStartPreparation?: () => void;
  showStartPreparation?: boolean;
  busy?: boolean;
};

export const TenderPreparationCard = ({
  mode,
  checklist,
  following,
  onStartPreparation,
  showStartPreparation,
  busy,
}: TenderPreparationCardProps) => {
  if (!following) return null;

  if (mode === "early") {
    return (
      <Card className="border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Προετοιμασία φακέλου</CardTitle>
          <CardDescription>
            Η επίσημη πρόσκληση δεν έχει δημοσιευθεί ακόμη. Μπορείτε προαιρετικά να
            προετοιμάσετε εταιρικά έγγραφα.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link to="/app/documents">Άνοιγμα Αρχείου Εταιρείας</Link>
          </Button>
          {showStartPreparation && onStartPreparation ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={onStartPreparation}
            >
              Προετοιμασία εγγράφων
            </Button>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  if (!checklist) return null;

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Έλεγχος δικαιολογητικών συμμετοχής
        </CardTitle>
        <CardDescription>
          Εντοπίστε τα δικαιολογητικά που ζητά η προκήρυξη και ελέγξτε ποια έχετε ήδη
          αποθηκεύσει.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!checklist.readable ? (
          <div className="space-y-2">
            <p className="text-muted-foreground">
              {checklist.unreadMessage ?? "Δεν διαβάστηκε το PDF"}
            </p>
            {checklist.officialPdfUrl ? (
              <a
                href={checklist.officialPdfUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline-offset-2 hover:underline"
              >
                Επίσημο PDF
              </a>
            ) : null}
          </div>
        ) : (
          <>
            <dl className="grid gap-2 sm:grid-cols-2">
              {checklist.fields.map((field) => (
                <div
                  key={field.key}
                  className="rounded-md border border-border/60 bg-muted/10 px-3 py-2"
                >
                  <dt className="text-xs text-muted-foreground">{field.label}</dt>
                  <dd className="mt-1 font-medium">
                    {field.status === "found" ? field.value : "Δεν εντοπίστηκε"}
                  </dd>
                </div>
              ))}
            </dl>
            <ul className="space-y-1.5">
              {checklist.documents.map((doc) => (
                <li
                  key={doc.key}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2"
                >
                  <span>{doc.label}</span>
                  <Badge
                    variant={
                      doc.status === "in_vault"
                        ? "success"
                        : doc.status === "missing"
                          ? "warning"
                          : "outline"
                    }
                  >
                    {doc.status === "in_vault"
                      ? "Στο vault"
                      : doc.status === "missing"
                        ? "Λείπει"
                        : "Δεν ζητείται"}
                  </Badge>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
};
