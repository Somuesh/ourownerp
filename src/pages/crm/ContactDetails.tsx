import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeft, Mail, Phone, Send, Trash2 } from "lucide-react";
import { useApiClient } from "@/lib/api-client.ts";
import type { ActivityWithAuthor, ContactWithCompany } from "@/lib/types.ts";
import { Button } from "@/components/ui/button.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { Avatar, AvatarFallback } from "@/components/ui/avatar.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
import { MessageSquare } from "lucide-react";
import { ErrorState, ErrorStateContent, ErrorStateDescription, ErrorStateHeader, ErrorStateMedia, ErrorStateTitle } from "@/components/ui/error-state.tsx";

export default function ContactDetail() {
  const params = useParams<{ contactId: string }>();
  const navigate = useNavigate();
  const contactId = params.contactId as string;
  const api = useApiClient();
  const queryClient = useQueryClient();

  const { data: contact } = useQuery<ContactWithCompany | null>({
    queryKey: ["contacts", contactId],
    queryFn: () => api.get(`/contacts/${contactId}`),
  });
  const { data: activities } = useQuery<ActivityWithAuthor[]>({
    queryKey: ["activities", contactId],
    queryFn: () => api.get(`/contacts/${contactId}/activities`),
  });
  const invalidateActivities = () =>
    queryClient.invalidateQueries({ queryKey: ["activities", contactId] });
  const createActivity = useMutation({
    mutationFn: (note: string) => api.post(`/contacts/${contactId}/activities`, { note }),
    onSuccess: invalidateActivities,
  });
  const deleteActivity = useMutation({
    mutationFn: (activityId: string) => api.del(`/activities/${activityId}`),
    onSuccess: invalidateActivities,
  });
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleAddNote = async () => {
    if (!note.trim()) return;
    setSubmitting(true);
    try {
      await createActivity.mutateAsync(note.trim());
      setNote("");
    } catch {
      toast.error("Failed to add note");
    } finally {
      setSubmitting(false);
    }
  };

  if (contact === undefined || activities === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (contact === null) {
    return (
      <ErrorState>
        <ErrorStateHeader>
          <ErrorStateMedia variant="icon">
            <MessageSquare />
          </ErrorStateMedia>
          <ErrorStateTitle>Contact not found</ErrorStateTitle>
          <ErrorStateDescription>
            This contact may have been deleted.
          </ErrorStateDescription>
        </ErrorStateHeader>
        <ErrorStateContent>
          <Button size="sm" onClick={() => navigate("/crm")}>
            Back to contacts
          </Button>
        </ErrorStateContent>
      </ErrorState>
    );
  }

  const initials = contact.name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="space-y-6">
      <Link
        to="/crm"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to contacts
      </Link>

      <div className="flex items-start gap-4">
        <Avatar size="lg">
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight">
            {contact.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {contact.companyName ?? "No company"}
          </p>
          <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted-foreground">
            {contact.email && (
              <span className="flex items-center gap-1">
                <Mail className="size-3.5" /> {contact.email}
              </span>
            )}
            {contact.phone && (
              <span className="flex items-center gap-1">
                <Phone className="size-3.5" /> {contact.phone}
              </span>
            )}
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Textarea
              placeholder="Log a call, meeting, or note..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="min-h-20"
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={handleAddNote} disabled={submitting || !note.trim()}>
              <Send />
              Add note
            </Button>
          </div>

          {activities.length === 0 ? (
            <Empty className="border-0 p-4">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MessageSquare />
                </EmptyMedia>
                <EmptyTitle>No activity yet</EmptyTitle>
                <EmptyDescription>
                  Notes and interactions with this contact will show up here.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="space-y-3 pt-2">
              {activities.map((activity) => (
                <div
                  key={activity._id}
                  className="group flex items-start justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="space-y-1">
                    <p className="text-sm whitespace-pre-wrap">{activity.note}</p>
                    <p className="text-xs text-muted-foreground">
                      {activity.authorName ?? "Someone"} ·{" "}
                      {formatDistanceToNow(new Date(activity.createdAtIso), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0 opacity-0 group-hover:opacity-100"
                    onClick={() => deleteActivity.mutate(activity._id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
