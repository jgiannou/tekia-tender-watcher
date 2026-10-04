import { EmptyState } from "@/components/states";

export const SubmissionsPage = () => (
  <div className="space-y-6">
    <div>
      <h2 className="text-2xl font-semibold tracking-tight">Υποβολές</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Καταγραφή επίσημων υποβολών και παρακολούθηση αποτελεσμάτων.
      </p>
    </div>
    <EmptyState
      title="Δεν υπάρχουν υποβολές ακόμη"
      description="Όταν καταγράψετε επίσημη υποβολή σε διαγωνισμό που παρακολουθείτε, θα εμφανιστεί εδώ."
    />
  </div>
);
