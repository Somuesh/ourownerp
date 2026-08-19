import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users2 } from "lucide-react";
import { useApiClient, ApiError } from "@/lib/api-client.ts";
import type { Contact, Role, User } from "@/lib/types.ts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Avatar, AvatarFallback } from "@/components/ui/avatar.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { useCurrentUser } from "@/hooks/use-current-user.ts";

const roleLabel: Record<Role, string> = {
  admin: "Admin",
  staff: "Staff",
  client: "Client",
};

export default function SettingsUsers() {
  const { user: currentUser } = useCurrentUser();
  const api = useApiClient();
  const queryClient = useQueryClient();
  const { data: users } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: () => api.get("/users"),
  });
  const { data: contacts } = useQuery<Contact[]>({
    queryKey: ["contacts"],
    queryFn: () => api.get("/contacts"),
  });
  const invalidateUsers = () => queryClient.invalidateQueries({ queryKey: ["users"] });
  const updateUserRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
      api.patch(`/users/${userId}/role`, { role }),
    onSuccess: invalidateUsers,
  });
  const updateUserContact = useMutation({
    mutationFn: ({ userId, contactId }: { userId: string; contactId?: string }) =>
      api.patch(`/users/${userId}/contact`, { contactId }),
    onSuccess: invalidateUsers,
  });
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const handleRoleChange = async (userId: string, role: Role) => {
    setUpdatingId(userId);
    try {
      await updateUserRole.mutateAsync({ userId, role });
      toast.success("Role updated");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to update role");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleContactChange = async (userId: string, value: string) => {
    setUpdatingId(userId);
    try {
      await updateUserContact.mutateAsync({
        userId,
        contactId: value === "none" ? undefined : value,
      });
      toast.success("Contact link updated");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to update contact link");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Users2 className="size-5" />
        </div>
        <div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight">
            Team & roles
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage who can access your workspace and what they can do.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            Admins manage everything. Staff manage CRM, inventory, and
            invoices. Clients only see their own portal, invoices, and
            company info — link each client to a CRM contact below so they
            see the right data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {users === undefined ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="w-36">Role</TableHead>
                  <TableHead className="w-48">Linked contact</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => {
                  const initials = (user.name ?? user.email ?? "U")
                    .split(" ")
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase();
                  const isSelf = currentUser?._id === user._id;

                  return (
                    <TableRow key={user._id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="size-7">
                            <AvatarFallback className="text-xs">
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">
                            {user.name ?? "Unnamed"}
                            {isSelf && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                (you)
                              </span>
                            )}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {user.email ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={user.role}
                          disabled={isSelf || updatingId === user._id}
                          onValueChange={(value) =>
                            handleRoleChange(user._id, value as Role)
                          }
                        >
                          <SelectTrigger size="sm" className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(roleLabel).map(([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {user.role === "client" ? (
                          <Select
                            value={user.contactId ?? "none"}
                            disabled={updatingId === user._id}
                            onValueChange={(value) => handleContactChange(user._id, value)}
                          >
                            <SelectTrigger size="sm" className="w-44">
                              <SelectValue placeholder="Not linked" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Not linked</SelectItem>
                              {contacts?.map((contact) => (
                                <SelectItem key={contact._id} value={contact._id}>
                                  {contact.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
