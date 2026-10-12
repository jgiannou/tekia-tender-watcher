/** Shared human labels for stored enum/code values shown in Greek SaaS UI. */

export const SUBMISSION_METHOD_LABELS: Record<string, string> = {
  PORTAL: "Ηλεκτρονική πλατφόρμα",
  EMAIL: "Email",
  PHYSICAL: "Φυσική παράδοση",
  OTHER: "Άλλο",
  ESIDIS: "ΕΣΗΔΗΣ",
  UNKNOWN: "Άγνωστο",
};

export const OUTREACH_METHOD_LABELS: Record<string, string> = {
  EMAIL: "Email",
  PHONE: "Τηλέφωνο",
  PORTAL: "Ηλεκτρονική πλατφόρμα",
  PHYSICAL: "Δια ζώσης / φυσική",
  OTHER: "Άλλο",
};

export const submissionMethodLabel = (code: string | null | undefined): string => {
  if (!code) return "—";
  return SUBMISSION_METHOD_LABELS[code] ?? code;
};

export const outreachMethodLabel = (code: string | null | undefined): string => {
  if (!code) return "—";
  return OUTREACH_METHOD_LABELS[code] ?? code;
};

export const humanSaasError = (message: string): string => {
  if (
    message.includes("watch_profile_similar_exists") ||
    message.includes("similar_exists")
  ) {
    return "Υπάρχει ήδη αποθηκευμένη αναζήτηση με τα ίδια κριτήρια. Ανοίξτε την υπάρχουσα ή αλλάξτε τα κριτήρια.";
  }
  if (message.includes("watch_profile_active_limit")) {
    return "Έχετε φτάσει το όριο ενεργών αποθηκευμένων αναζητήσεων.";
  }
  if (message.includes("followed_tender_limit")) {
    return "Παρακολουθείτε ήδη 5 διαγωνισμούς. Με το Basic μπορείτε να παρακολουθείτε έως 30 διαγωνισμούς, να αποθηκεύετε έως 5 αναζητήσεις και να οργανώνετε τα δικαιολογητικά σας.";
  }
  if (message.includes("seat_limit_contact_sales")) {
    return "Χρειάζεστε περισσότερους από 20 χρήστες; Επικοινωνήστε μαζί μας.";
  }
  if (message.includes("seat_limit_reached")) {
    return "Έχετε φτάσει το όριο θέσεων χρηστών. Προσθέστε έξτρα θέσεις στο Pro ή αναβαθμίστε.";
  }
  if (message.includes("already_a_member")) {
    return "Αυτό το email είναι ήδη μέλος του οργανισμού.";
  }
  if (message.includes("invite_already_pending")) {
    return "Υπάρχει ήδη ανοιχτή πρόσκληση για αυτό το email.";
  }
  if (message.includes("invite_email_mismatch")) {
    return "Συνδεθείτε με το email της πρόσκλησης για να την αποδεχτείτε.";
  }
  if (message.includes("invitation_expired")) {
    return "Η πρόσκληση έχει λήξει. Ζητήστε νέα από τον διαχειριστή.";
  }
  if (message.includes("invitation_not_found")) {
    return "Η πρόσκληση δεν βρέθηκε ή έχει ακυρωθεί.";
  }
  if (message.includes("cannot_remove_owner") || message.includes("cannot_remove_self")) {
    return "Δεν μπορείτε να αφαιρέσετε αυτό το μέλος.";
  }
  if (message.includes("advanced_watch_filters_requires_pro")) {
    return "Τα προχωρημένα φίλτρα (αρχή, προϋπολογισμός, ειδοποιήσεις ανά εξέλιξη) είναι διαθέσιμα στο Pro.";
  }
  if (message.includes("vault_storage_limit_reached")) {
    return "Έχετε φτάσει το όριο αποθήκευσης του πακέτου. Αναβαθμίστε ή διαγράψτε αρχεία.";
  }
  if (message.includes("billing_not_configured")) {
    return "Η χρέωση δεν είναι ρυθμισμένη ακόμη. Ολοκληρώστε τα Stripe Price IDs.";
  }
  if (message.includes("stripe_tax_not_enabled")) {
    return "Ενεργοποιήστε το Stripe Tax στο Dashboard και δοκιμάστε ξανά.";
  }
  if (message.includes("too_many_members_for_plan")) {
    return "Υπάρχουν περισσότερα μέλη από όσα επιτρέπει το επιλεγμένο πλάνο. Αφαιρέστε χρήστες πρώτα.";
  }
  if (message.includes("no_billing_customer")) {
    return "Δεν υπάρχει ακόμη πελάτης χρέωσης — επιλέξτε πρώτα ένα πλάνο.";
  }
  if (message.includes("email_not_verified")) {
    return "Επιβεβαιώστε το email σας για να ενεργοποιήσετε αποθηκευμένες αναζητήσεις.";
  }
  if (message.includes("trial_expired")) {
    return "Η δοκιμαστική περίοδος έληξε. Αναβαθμίστε το πακέτο για περιοδικούς ελέγχους.";
  }
  if (message.includes("pro_trial_already_used")) {
    return "Η δοκιμή Pro έχει ήδη χρησιμοποιηθεί για αυτόν τον οργανισμό. Επιλέξτε Basic ή Pro.";
  }
  if (message.includes("trial_only_from_free")) {
    return "Η δοκιμή Pro είναι διαθέσιμη μόνο από το δωρεάν πλάνο.";
  }
  if (message.includes("paid_plan_active")) {
    return "Υπάρχει ήδη ενεργή συνδρομή πληρωμής για αυτόν τον οργανισμό.";
  }
  if (message.includes("periodic_scan_quota_exceeded")) {
    return "Έχετε εξαντλήσει τους περιοδικούς ελέγχους για σήμερα.";
  }
  if (message.includes("manual_scan_quota_exceeded")) {
    return "Έχετε εξαντλήσει τους χειροκίνητους ελέγχους για σήμερα.";
  }
  if (
    message.includes("subscription_inactive") ||
    message.includes("manual_scan_blocked") ||
    message.includes("periodic_scan_blocked")
  ) {
    return "Οι έλεγχοι αποθηκευμένων αναζητήσεων δεν είναι διαθέσιμοι για τον τρέχοντα λογαριασμό.";
  }
  if (message.includes("watch_profile_requires_keywords_or_cpvs")) {
    return "Απαιτείται τουλάχιστον μία λέξη-κλειδί ή CPV.";
  }
  if (message.includes("watch_profile_date_from_after_date_to")) {
    return "Η ημερομηνία «από» πρέπει να είναι πριν από την «έως».";
  }
  if (
    message.includes("watch_profile_date_from_and_to_required_together") ||
    message.includes("dateFrom and dateTo must be provided together")
  ) {
    return "Μπορείτε να ορίσετε μόνο «από», μόνο «έως», ή και τις δύο ημερομηνίες.";
  }
  if (message.startsWith("HTTP 500") || message.includes("internal_error")) {
    return "Προσωρινό σφάλμα διακομιστή. Δοκιμάστε ξανά.";
  }
  if (message.startsWith("HTTP 404") || message.includes("not_found")) {
    return "Δεν βρέθηκε.";
  }
  if (message.startsWith("HTTP 401") || message.includes("unauthorized")) {
    return "Απαιτείται σύνδεση.";
  }
  if (message.startsWith("HTTP ")) {
    return "Προέκυψε σφάλμα. Δοκιμάστε ξανά.";
  }
  return message;
};
