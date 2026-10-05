import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useSessionContext } from "@/auth/SessionProvider";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saasApi } from "@/lib/api";
import { humanSaasError } from "@/lib/labels";

type TeamData = Awaited<ReturnType<typeof saasApi.getTeam>>;

const roleLabel = (role: string) => {
  if (role === "OWNER") return "Ιδιοκτήτης";
  if (role === "ADMIN") return "Διαχειριστής";
  return "Μέλος";
};

export const TeamSettingsPage = () => {
  const { activeOrganization, user, refresh } = useSessionContext();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [team, setTeam] = useState<TeamData | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"MEMBER" | "ADMIN">("MEMBER");
  const [inviting, setInviting] = useState(false);

  const canManage =
    team?.role === "OWNER" || team?.role === "ADMIN";

  const load = async () => {
    if (!activeOrganization) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await saasApi.getTeam(activeOrganization.id);
      setTeam(data);
    } catch (err) {
      setError(err instanceof Error ? humanSaasError(err.message) : "Αποτυχία φόρτωσης");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [activeOrganization?.id]);

  const handleInvite = async () => {
    if (!activeOrganization || !email.trim()) return;
    setInviting(true);
    try {
      const result = await saasApi.inviteMember(activeOrganization.id, {
        email: email.trim(),
        role,
      });
      setEmail("");
      setRole("MEMBER");
      toast.success(
        result.emailSent
          ? "Η πρόσκληση στάλθηκε με email"
          : "Η πρόσκληση δημιουργήθηκε (το email δεν στάλθηκε — ελέγξτε EMAIL_ENABLED)",
      );
      if (result.acceptUrl) {
        toast.message("Dev link", { description: result.acceptUrl });
      }
      await load();
      await refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? humanSaasError(err.message) : "Αποτυχία πρόσκλησης",
      );
    } finally {
      setInviting(false);
    }
  };

  const handleCancelInvite = async (invitationId: string) => {
    if (!activeOrganization) return;
    try {
      await saasApi.cancelInvitation(activeOrganization.id, invitationId);
      toast.success("Η πρόσκληση ακυρώθηκε");
      await load();
    } catch (err) {
      toast.error(
        err instanceof Error ? humanSaasError(err.message) : "Αποτυχία ακύρωσης",
      );
    }
  };

  const handleRemove = async (memberUserId: string) => {
    if (!activeOrganization) return;
    try {
      await saasApi.removeMember(activeOrganization.id, memberUserId);
      toast.success("Το μέλος αφαιρέθηκε");
      await load();
      await refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? humanSaasError(err.message) : "Αποτυχία αφαίρεσης",
      );
    }
  };

  const handleRoleChange = async (
    memberUserId: string,
    nextRole: "MEMBER" | "ADMIN",
  ) => {
    if (!activeOrganization) return;
    try {
      await saasApi.updateMemberRole(
        activeOrganization.id,
        memberUserId,
        nextRole,
      );
      toast.success("Ο ρόλος ενημερώθηκε");
      await load();
    } catch (err) {
      toast.error(
        err instanceof Error ? humanSaasError(err.message) : "Αποτυχία ενημέρωσης",
      );
    }
  };

  if (loading) return <PageSkeleton />;
  if (!activeOrganization) {
    return (
      <EmptyState
        title="Χωρίς οργανισμό"
        description="Δημιουργήστε οργανισμό για να διαχειριστείτε την ομάδα."
      />
    );
  }
  if (error) return <ErrorState description={error} onRetry={() => void load()} />;
  if (!team) return null;

  const seatUsed = team.members.length + team.invitations.length;
  const seatLimit = team.seats.seatLimit;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Ομάδα</CardTitle>
          <CardDescription>
            Μέλη του οργανισμού «{team.organization.name}». Θέσεις: {seatUsed} /{" "}
            {seatLimit}
            {team.seats.extraSeats > 0
              ? ` (${team.seats.includedSeats} συμπεριλαμβάνονται + ${team.seats.extraSeats} έξτρα)`
              : null}
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {seatUsed >= seatLimit ? (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
              Έχετε καλύψει τις διαθέσιμες θέσεις.{" "}
              <Link className="underline" to="/app/subscription">
                Προσθέστε έξτρα θέσεις στη Συνδρομή
              </Link>
              .
            </p>
          ) : null}

          {canManage ? (
            <form
              className="grid gap-3 md:grid-cols-[1fr_auto_auto]"
              onSubmit={(e) => {
                e.preventDefault();
                void handleInvite();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email πρόσκλησης</Label>
                <Input
                  id="invite-email"
                  type="email"
                  autoComplete="email"
                  placeholder="colleague@company.gr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  aria-label="Email πρόσκλησης"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-role">Ρόλος</Label>
                <select
                  id="invite-role"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={role}
                  onChange={(e) =>
                    setRole(e.target.value === "ADMIN" ? "ADMIN" : "MEMBER")
                  }
                  aria-label="Ρόλος πρόσκλησης"
                >
                  <option value="MEMBER">Μέλος</option>
                  {team.role === "OWNER" ? (
                    <option value="ADMIN">Διαχειριστής</option>
                  ) : null}
                </select>
              </div>
              <div className="flex items-end">
                <Button
                  type="submit"
                  disabled={inviting || seatUsed >= seatLimit}
                  aria-label="Αποστολή πρόσκλησης"
                >
                  {inviting ? "Αποστολή…" : "Πρόσκληση"}
                </Button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              Μόνο ιδιοκτήτης ή διαχειριστής μπορεί να προσκαλέσει μέλη.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Μέλη</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {team.members.map((member) => {
            const isSelf = member.userId === user?.id;
            return (
              <div
                key={member.id}
                className="flex flex-col gap-2 rounded-md border border-border/60 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="font-medium">
                    {member.user.name || member.user.email}
                    {isSelf ? " (εσείς)" : null}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {member.user.email} · {roleLabel(member.role)}
                  </div>
                </div>
                {canManage && !isSelf && member.role !== "OWNER" ? (
                  <div className="flex flex-wrap gap-2">
                    {team.role === "OWNER" ? (
                      <select
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                        value={member.role === "ADMIN" ? "ADMIN" : "MEMBER"}
                        aria-label={`Ρόλος για ${member.user.email}`}
                        onChange={(e) =>
                          void handleRoleChange(
                            member.userId,
                            e.target.value === "ADMIN" ? "ADMIN" : "MEMBER",
                          )
                        }
                      >
                        <option value="MEMBER">Μέλος</option>
                        <option value="ADMIN">Διαχειριστής</option>
                      </select>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleRemove(member.userId)}
                      aria-label={`Αφαίρεση ${member.user.email}`}
                    >
                      Αφαίρεση
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {team.invitations.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Εκκρεμείς προσκλήσεις</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {team.invitations.map((inv) => (
              <div
                key={inv.id}
                className="flex flex-col gap-2 rounded-md border border-border/60 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="font-medium">{inv.email}</div>
                  <div className="text-sm text-muted-foreground">
                    {roleLabel(inv.role)} · λήγει{" "}
                    {new Date(inv.expiresAt).toLocaleDateString("el-GR")}
                  </div>
                </div>
                {canManage ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleCancelInvite(inv.id)}
                    aria-label={`Ακύρωση πρόσκλησης ${inv.email}`}
                  >
                    Ακύρωση
                  </Button>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
};
