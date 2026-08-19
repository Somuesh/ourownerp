import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MoreHorizontal, Plus, Target } from "lucide-react";
import { useApiClient } from "@/lib/api-client.ts";
import type { DealStage, DealWithParty } from "@/lib/types.ts";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Card, CardContent, CardHeader } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import DealDialog from "./_components/deal-dialog.tsx";

const STAGES: Array<{ id: DealStage; label: string }> = [
  { id: "new", label: "New" },
  { id: "qualified", label: "Qualified" },
  { id: "proposal", label: "Proposal" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
];

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export default function Deals() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const { data: deals } = useQuery<DealWithParty[]>({
    queryKey: ["deals"],
    queryFn: () => api.get("/deals"),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["deals"] });
  const updateDealStage = useMutation({
    mutationFn: ({ dealId, stage }: { dealId: string; stage: DealStage }) =>
      api.patch(`/deals/${dealId}/stage`, { stage }),
    onSuccess: invalidate,
  });
  const deleteDeal = useMutation({
    mutationFn: (dealId: string) => api.del(`/deals/${dealId}`),
    onSuccess: invalidate,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<DealWithParty | undefined>();
  const [deletingDeal, setDeletingDeal] = useState<DealWithParty | undefined>();

  const openCreate = () => {
    setEditingDeal(undefined);
    setDialogOpen(true);
  };

  const openEdit = (deal: DealWithParty) => {
    setEditingDeal(deal);
    setDialogOpen(true);
  };

  const handleMoveStage = async (dealId: string, stage: DealStage) => {
    try {
      await updateDealStage.mutateAsync({ dealId, stage });
    } catch {
      toast.error("Failed to move deal");
    }
  };

  const handleDelete = async () => {
    if (!deletingDeal) return;
    try {
      await deleteDeal.mutateAsync(deletingDeal._id);
      toast.success("Deal deleted");
    } catch {
      toast.error("Failed to delete deal");
    } finally {
      setDeletingDeal(undefined);
    }
  };

  if (deals === undefined) {
    return (
      <div className="grid gap-4 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-64 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Plus />
          New deal
        </Button>
      </div>

      {deals.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Target />
            </EmptyMedia>
            <EmptyTitle>No deals yet</EmptyTitle>
            <EmptyDescription>
              Track opportunities through your sales pipeline.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={openCreate}>
              Add deal
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-4 overflow-x-auto md:grid-cols-5">
          {STAGES.map((stage) => {
            const stageDeals = deals.filter((deal) => deal.stage === stage.id);
            const stageTotal = stageDeals.reduce((sum, deal) => sum + deal.value, 0);

            return (
              <div key={stage.id} className="min-w-[220px] space-y-3">
                <div className="flex items-center justify-between px-1">
                  <span className="text-sm font-medium">{stage.label}</span>
                  <Badge variant="secondary">{stageDeals.length}</Badge>
                </div>
                <p className="px-1 text-xs text-muted-foreground">
                  {currency.format(stageTotal)}
                </p>
                <div className="space-y-2">
                  {stageDeals.map((deal) => (
                    <Card key={deal._id} className="py-3">
                      <CardHeader className="px-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium leading-tight">
                            {deal.title}
                          </p>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-6 shrink-0"
                              >
                                <MoreHorizontal className="size-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEdit(deal)}>
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuLabel>Move to</DropdownMenuLabel>
                              {STAGES.filter((s) => s.id !== deal.stage).map(
                                (s) => (
                                  <DropdownMenuItem
                                    key={s.id}
                                    onClick={() => handleMoveStage(deal._id, s.id)}
                                  >
                                    {s.label}
                                  </DropdownMenuItem>
                                ),
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => setDeletingDeal(deal)}
                              >
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </CardHeader>
                      <CardContent className="px-3 text-xs text-muted-foreground">
                        <p className="font-medium text-foreground">
                          {currency.format(deal.value)}
                        </p>
                        {deal.companyName && <p>{deal.companyName}</p>}
                        {deal.contactName && <p>{deal.contactName}</p>}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <DealDialog open={dialogOpen} onOpenChange={setDialogOpen} deal={editingDeal} />

      <AlertDialog
        open={!!deletingDeal}
        onOpenChange={(open) => !open && setDeletingDeal(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete deal?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {deletingDeal?.title}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
