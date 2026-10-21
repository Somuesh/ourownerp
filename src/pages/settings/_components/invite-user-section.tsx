import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mail, X } from "lucide-react";
import { useApiClient, ApiError } from "@/lib/api-client.ts";
import type { Role, UserInvite } from "@/lib/types.ts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";

const roleLabel: Record<Role, string> = { admin: "Admin", staff: "Staff", client: "Client" };

/** The missing piece that makes multi-user signup actually work now that
 * /users/sync requires a matching invite (see server/routes/users.ts). */
export function InviteUserSection() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const { data: invites } = useQuery<UserInvite[]>({
    queryKey: ["user-invites"],
    queryFn: () => api.get("/user-invites"),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["user-invites"] });

  const createInvite = useMutation({
    mutationFn: (payload: { email: string; role: Role }) => api.post("/user-invites", payload),
    onSuccess: invalidate,
  });
  const revokeInvite = useMutation({
    mutationFn: (id: string) => api.del(`/user-invites/${id}`),
    onSuccess: invalidate,
  });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("staff");

  const handleInvite = async () => {
    if (!email.trim()) return;
    try {
      const result = await createInvite.mutateAsync({ email: email.trim(), role });
      toast.success(
        result.emailSent
          ? `Invite sent to ${email}`
          : `Invite created for ${email} (email wasn't sent — SMTP isn't configured; share access manually)`,
      );
      setEmail("");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to send invite");
    }
  };

  const pendingInvites = invites?.filter((i) => !i.acceptedAtIso && !i.revokedAtIso) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite someone</CardTitle>
        <CardDescription>
          They can only sign in once invited — pick their role now, they get it automatically
          the first time they log in with this email.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="teammate@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleInvite()}
          />
          <Select value={role} onValueChange={(v) => setRole(v as Role)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(roleLabel) as Array<[Role, string]>).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleInvite} disabled={createInvite.isPending || !email.trim()}>
            <Mail className="size-4" />
            Invite
          </Button>
        </div>

        {pendingInvites.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Invited by</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingInvites.map((invite) => (
                <TableRow key={invite._id}>
                  <TableCell>{invite.email}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{roleLabel[invite.role]}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {invite.invitedByName ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => revokeInvite.mutate(invite._id)}
                      title="Revoke invite"
                    >
                      <X className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
