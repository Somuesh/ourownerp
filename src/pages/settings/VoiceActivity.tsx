import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, History, Mic } from "lucide-react";
import { useApiClient } from "@/lib/api-client.ts";
import type { VoiceCommandLog, VoiceToolCallRecord } from "@/lib/types.ts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Avatar, AvatarFallback } from "@/components/ui/avatar.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.tsx";

/** Turns a snake_case tool name plus its input/result into one readable
 * line — e.g. create_product({name:"Widget X",...}) → "Create product —
 * Widget X". Generic on purpose rather than 30 hand-written templates per
 * tool: looks for the most likely "identifying" field in the input or the
 * result (name/title/number), and falls back gracefully if none exist. */
function describeToolCall(call: VoiceToolCallRecord): string {
  const label = call.name.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  const result = call.result as Record<string, unknown> | null;
  const identifier =
    (call.input.name as string) ??
    (call.input.title as string) ??
    (result?.orderNumber as string) ??
    (result?.invoiceNumber as string) ??
    (result?.billNumber as string) ??
    (call.input.description as string) ??
    undefined;
  return identifier ? `${label} — ${identifier}` : label;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function VoiceActivity() {
  const api = useApiClient();
  const { data: logs } = useQuery<VoiceCommandLog[]>({
    queryKey: ["voice-logs"],
    queryFn: () => api.get("/voice/logs"),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <History className="size-5" />
        </div>
        <div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight">Voice assistant activity</h1>
          <p className="text-sm text-muted-foreground">
            Every command anyone has given the voice assistant, and what it did as a result.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activity log</CardTitle>
          <CardDescription>Most recent first. Every action here is also in the audit log.</CardDescription>
        </CardHeader>
        <CardContent>
          {logs === undefined ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Mic />
                </EmptyMedia>
                <EmptyTitle>No voice activity yet</EmptyTitle>
                <EmptyDescription>
                  Once someone uses the voice assistant, their commands and the resulting
                  actions will show up here.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="space-y-4">
              {logs.map((log) => (
                <div key={log._id} className="flex gap-3 rounded-lg border p-3">
                  <Avatar className="size-8 shrink-0">
                    <AvatarFallback className="text-xs">{initials(log.userName)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{log.userName}</span>
                      <span>{new Date(log.createdAtIso).toLocaleString()}</span>
                      {log.language && <Badge variant="secondary">{log.language}</Badge>}
                    </div>
                    <p className="text-sm">
                      <span className="text-muted-foreground">Said: </span>
                      {log.userTranscript}
                    </p>
                    <p className="text-sm">
                      <span className="text-muted-foreground">Replied: </span>
                      {log.assistantReply}
                    </p>
                    {log.toolCalls.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {log.toolCalls.map((call, i) => (
                          <Badge
                            key={i}
                            variant={call.isError ? "destructive" : "secondary"}
                            className="gap-1 font-normal"
                          >
                            {call.isError ? (
                              <AlertTriangle className="size-3" />
                            ) : (
                              <CheckCircle2 className="size-3" />
                            )}
                            {describeToolCall(call)}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
