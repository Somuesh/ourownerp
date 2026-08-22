import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, MoreHorizontal, Plus, Settings2, Target, Trash2, X } from "lucide-react";
import { useApiClient, ApiError } from "@/lib/api-client.ts";
import type { DealStage, DealWithParty } from "@/lib/types.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Card, CardContent, CardHeader } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
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
import { ViewSwitcher, type ViewMode } from "@/components/ui/view-switcher.tsx";
import { ColumnVisibilityMenu } from "@/components/ui/column-visibility-menu.tsx";
import { useColumnVisibility } from "@/hooks/use-column-visibility.ts";
import DealDialog from "./_components/deal-dialog.tsx";

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0,});

const DEAL_COLUMNS = [
  { id: "party", label: "Company / Contact" },
  { id: "value", label: "Value" },
  { id: "stage", label: "Stage" },
] as const;
type DealColumn = (typeof DEAL_COLUMNS)[number]["id"];

export default function Deals() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const { data: stages } = useQuery<DealStage[]>({
    queryKey: ["deal-stages"],
    queryFn: () => api.get("/deal-stages"),
  });
  const { data: deals } = useQuery<DealWithParty[]>({
    queryKey: ["deals"],
    queryFn: () => api.get("/deals"),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["deals"] });
  const invalidateStages = () => {
    queryClient.invalidateQueries({ queryKey: ["deal-stages"] });
    invalidate();
  };

  const updateDealStage = useMutation({
    mutationFn: ({ dealId, stageId }: { dealId: string; stageId: string }) =>
      api.patch(`/deals/${dealId}/stage`, { stageId }),
    onSuccess: invalidate,
  });
  const deleteDeal = useMutation({
    mutationFn: (dealId: string) => api.del(`/deals/${dealId}`),
    onSuccess: invalidate,
  });
  const createStage = useMutation({
    mutationFn: (name: string) => api.post("/deal-stages", { name }),
    onSuccess: invalidateStages,
  });
  const renameStage = useMutation({
    mutationFn: ({ stageId, name }: { stageId: string; name: string }) =>
      api.patch(`/deal-stages/${stageId}`, { name }),
    onSuccess: invalidateStages,
  });
  const setStageFlag = useMutation({
    mutationFn: (payload: { stageId: string; isWon?: boolean; isLost?: boolean }) =>
      api.patch(`/deal-stages/${payload.stageId}`, payload),
    onSuccess: invalidateStages,
  });
  const deleteStage = useMutation({
    mutationFn: (stageId: string) => api.del(`/deal-stages/${stageId}`),
    onSuccess: invalidateStages,
  });

  const [view, setView] = useState<ViewMode>("kanban");
  const { isVisible: isColumnVisible, toggle: toggleColumn } = useColumnVisibility<DealColumn>(
    "deals-list-columns",
    DEAL_COLUMNS.map((c) => c.id),
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<DealWithParty | undefined>();
  const [deletingDeal, setDeletingDeal] = useState<DealWithParty | undefined>();
  const [newStageName, setNewStageName] = useState("");
  const [addStageOpen, setAddStageOpen] = useState(false);
  const [renamingStage, setRenamingStage] = useState<DealStage | undefined>();
  const [renameValue, setRenameValue] = useState("");

  const openCreate = () => {
    setEditingDeal(undefined);
    setDialogOpen(true);
  };

  const openEdit = (deal: DealWithParty) => {
    setEditingDeal(deal);
    setDialogOpen(true);
  };

  const handleMoveStage = async (dealId: string, stageId: string) => {
    try {
      await updateDealStage.mutateAsync({ dealId, stageId });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to move deal");
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

  const handleCreateStage = async () => {
    if (!newStageName.trim()) return;
    try {
      await createStage.mutateAsync(newStageName.trim());
      setNewStageName("");
      setAddStageOpen(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to create stage");
    }
  };

  const openRename = (stage: DealStage) => {
    setRenamingStage(stage);
    setRenameValue(stage.name);
  };

  const handleRenameStage = async () => {
    if (!renamingStage || !renameValue.trim()) return;
    try {
      await renameStage.mutateAsync({ stageId: renamingStage._id, name: renameValue.trim() });
      setRenamingStage(undefined);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to rename stage");
    }
  };

  const handleDeleteStage = async (stage: DealStage) => {
    try {
      await deleteStage.mutateAsync(stage._id);
      toast.success(`"${stage.name}" stage deleted`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to delete stage");
    }
  };

  const dealActionsMenu = (deal: DealWithParty) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-6 shrink-0">
          <MoreHorizontal className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => openEdit(deal)}>Edit</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Move to</DropdownMenuLabel>
        {stages
          ?.filter((s) => s._id !== deal.stageId)
          .map((s) => (
            <DropdownMenuItem key={s._id} onClick={() => handleMoveStage(deal._id, s._id)}>
              {s.name}
            </DropdownMenuItem>
          ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => setDeletingDeal(deal)}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const stageManageMenu = (stage: DealStage) => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="size-6 shrink-0">
          <Settings2 className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 space-y-2" align="end">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={() => openRename(stage)}
        >
          Rename stage
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={() =>
            setStageFlag.mutate({ stageId: stage._id, isWon: !stage.isWon, isLost: false })
          }
        >
          {stage.isWon ? "Unmark as Won stage" : "Mark as Won stage"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={() =>
            setStageFlag.mutate({ stageId: stage._id, isLost: !stage.isLost, isWon: false })
          }
        >
          {stage.isLost ? "Unmark as Lost stage" : "Mark as Lost stage"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-destructive hover:text-destructive"
          onClick={() => handleDeleteStage(stage)}
        >
          <Trash2 className="size-3.5" />
          Delete stage
        </Button>
      </PopoverContent>
    </Popover>
  );

  if (deals === undefined || stages === undefined) {
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ViewSwitcher value={view} onChange={setView} />
          {view === "list" && (
            <ColumnVisibilityMenu
              columns={DEAL_COLUMNS}
              isVisible={isColumnVisible}
              toggle={toggleColumn}
            />
          )}
        </div>
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
      ) : view === "list" ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              {isColumnVisible("party") && <TableHead>Company / Contact</TableHead>}
              {isColumnVisible("value") && <TableHead>Value</TableHead>}
              {isColumnVisible("stage") && <TableHead>Stage</TableHead>}
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {deals.map((deal) => (
              <TableRow key={deal._id}>
                <TableCell className="font-medium">{deal.title}</TableCell>
                {isColumnVisible("party") && (
                  <TableCell className="text-muted-foreground">
                    {deal.companyName ?? deal.contactName ?? "—"}
                  </TableCell>
                )}
                {isColumnVisible("value") && (
                  <TableCell>{currency.format(deal.value)}</TableCell>
                )}
                {isColumnVisible("stage") && (
                  <TableCell>
                    <Badge variant="secondary">{deal.stageName ?? "—"}</Badge>
                  </TableCell>
                )}
                <TableCell>{dealActionsMenu(deal)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <div className="grid gap-4 overflow-x-auto" style={{ gridTemplateColumns: `repeat(${stages.length + 1}, minmax(220px, 1fr))` }}>
          {stages.map((stage) => {
            const stageDeals = deals.filter((deal) => deal.stageId === stage._id);
            const stageTotal = stageDeals.reduce((sum, deal) => sum + deal.value, 0);

            return (
              <div
                key={stage._id}
                className="min-w-[220px] space-y-3"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const dealId = e.dataTransfer.getData("text/plain");
                  const deal = deals.find((d) => d._id === dealId);
                  if (!deal || deal.stageId === stage._id) return;
                  handleMoveStage(dealId, stage._id);
                }}
              >
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium">{stage.name}</span>
                    {stage.isWon && (
                      <Badge variant="secondary" className="text-[10px]">
                        Won
                      </Badge>
                    )}
                    {stage.isLost && (
                      <Badge variant="destructive" className="text-[10px]">
                        Lost
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant="secondary">{stageDeals.length}</Badge>
                    {stageManageMenu(stage)}
                  </div>
                </div>
                <p className="px-1 text-xs text-muted-foreground">
                  {currency.format(stageTotal)}
                </p>
                <div className="space-y-2">
                  {stageDeals.map((deal) => (
                    <Card
                      key={deal._id}
                      className="cursor-grab py-3 active:cursor-grabbing"
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", deal._id)}
                      onClick={() => openEdit(deal)}
                    >
                      <CardHeader className="px-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium leading-tight">{deal.title}</p>
                          <div onClick={(e) => e.stopPropagation()}>{dealActionsMenu(deal)}</div>
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

          <div className="min-w-[220px] space-y-3">
            <Popover open={addStageOpen} onOpenChange={setAddStageOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full border-dashed">
                  <Plus className="size-3.5" />
                  Add stage
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64">
                <div className="space-y-2">
                  <Input
                    autoFocus
                    placeholder="Stage name"
                    value={newStageName}
                    onChange={(e) => setNewStageName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateStage()}
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setAddStageOpen(false)}>
                      <X className="size-3.5" />
                    </Button>
                    <Button size="sm" onClick={handleCreateStage}>
                      <Check className="size-3.5" />
                      Add
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
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

      <Dialog open={!!renamingStage} onOpenChange={(open) => !open && setRenamingStage(undefined)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename stage</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleRenameStage()}
          />
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRenamingStage(undefined)}>
              Cancel
            </Button>
            <Button onClick={handleRenameStage}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
