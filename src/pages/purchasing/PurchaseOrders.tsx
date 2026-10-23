import { useState } from "react";
import WarehousePickerDialog from "@/components/warehouse-picker-dialog.tsx";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  MoreHorizontal,
  Package,
  Plus,
  Receipt,
  ShoppingCart,
  XCircle,
} from "lucide-react";
import { useApiClient, ApiError } from "@/lib/api-client.ts";
import type {
  PurchaseOrderLineItem,
  PurchaseOrderStatus,
  PurchaseOrderWithVendor, Warehouse } from "@/lib/types.ts";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent, CardHeader } from "@/components/ui/card.tsx";
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
import { ViewSwitcher, type ViewMode } from "@/components/ui/view-switcher.tsx";
import { ColumnVisibilityMenu } from "@/components/ui/column-visibility-menu.tsx";
import { useColumnVisibility } from "@/hooks/use-column-visibility.ts";
import PurchaseOrderDialog from "./_components/purchase-order-dialog.tsx";

const STATUSES: Array<{ id: PurchaseOrderStatus; label: string }> = [
  { id: "draft", label: "RFQ" },
  { id: "confirmed", label: "Confirmed" },
  { id: "received", label: "Received" },
  { id: "billed", label: "Billed" },
  { id: "cancelled", label: "Cancelled" },
];

const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.id, s.label])) as Record<
  PurchaseOrderStatus,
  string
>;

const statusVariant: Record<PurchaseOrderStatus, "secondary" | "default" | "destructive"> = {
  draft: "secondary",
  confirmed: "default",
  received: "default",
  billed: "secondary",
  cancelled: "destructive",
};

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const PO_COLUMNS = [
  { id: "vendor", label: "Vendor" },
  { id: "orderDate", label: "Order date" },
  { id: "total", label: "Total" },
  { id: "status", label: "Status" },
] as const;
type PoColumn = (typeof PO_COLUMNS)[number]["id"];

// Mirrors the state machine server/routes/purchaseOrders.ts enforces —
// same reasoning as Sales Orders' STATUS_TRANSITIONS.
const STATUS_TRANSITIONS: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  draft: ["confirmed", "cancelled"],
  confirmed: ["received", "cancelled"],
  received: ["billed"],
  billed: [],
  cancelled: [],
};

export default function PurchaseOrders() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const { data: orders } = useQuery<PurchaseOrderWithVendor[]>({
    queryKey: ["purchase-orders"],
    queryFn: () => api.get("/purchase-orders"),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });

  const confirmOrder = useMutation({
    mutationFn: (id: string) => api.post(`/purchase-orders/${id}/confirm`),
    onSuccess: invalidate,
  });
  const receiveOrder = useMutation({
    mutationFn: ({ id, warehouseId }: { id: string; warehouseId?: string }) =>
      api.post(`/purchase-orders/${id}/receive`, { warehouseId }),
    onSuccess: invalidate,
  });
  const { data: warehouseList } = useQuery<Warehouse[]>({
    queryKey: ["warehouses"],
    queryFn: () => api.get("/warehouses"),
  });
  const activeWarehouses = (warehouseList ?? []).filter((w) => w.isActive);
  const [pickingOrderId, setPickingOrderId] = useState<string | null>(null);
  const requestFulfil = async (id: string) => {
    if (activeWarehouses.length > 1) {
      setPickingOrderId(id);
      return;
    }
    await fulfil(id);
  };
  const fulfil = async (id: string, warehouseId?: string) => {
    try {
      await receiveOrder.mutateAsync({ id, warehouseId });
      toast.success("Marked as received");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong");
    }
  };
  const billOrder = useMutation({
    mutationFn: (id: string) => api.post(`/purchase-orders/${id}/bill`),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["vendor-bills"] });
    },
  });
  const cancelOrder = useMutation({
    mutationFn: (id: string) => api.post(`/purchase-orders/${id}/cancel`),
    onSuccess: invalidate,
  });
  const deleteOrder = useMutation({
    mutationFn: (id: string) => api.del(`/purchase-orders/${id}`),
    onSuccess: invalidate,
  });

  const [view, setView] = useState<ViewMode>("list");
  const { isVisible: isColumnVisible, toggle: toggleColumn } = useColumnVisibility<PoColumn>(
    "purchase-orders-list-columns",
    PO_COLUMNS.map((c) => c.id),
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | undefined>();
  const [editingLineItems, setEditingLineItems] = useState<PurchaseOrderLineItem[] | undefined>();
  const [deletingOrder, setDeletingOrder] = useState<PurchaseOrderWithVendor | undefined>();

  const openCreate = () => {
    setEditingOrderId(undefined);
    setEditingLineItems(undefined);
    setDialogOpen(true);
  };

  const openView = async (orderId: string) => {
    const detail = await api.get(`/purchase-orders/${orderId}`);
    if (!detail) return;
    setEditingOrderId(orderId);
    setEditingLineItems(detail.lineItems);
    setDialogOpen(true);
  };

  const runAction = async (
    mutation: { mutateAsync: (id: string) => Promise<unknown> },
    id: string,
    successMessage: string,
  ) => {
    try {
      await mutation.mutateAsync(id);
      toast.success(successMessage);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong");
    }
  };

  const handleDelete = async () => {
    if (!deletingOrder) return;
    try {
      await deleteOrder.mutateAsync(deletingOrder._id);
      toast.success("RFQ deleted");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to delete");
    } finally {
      setDeletingOrder(undefined);
    }
  };

  const editingOrder = orders?.find((o) => o._id === editingOrderId);

  const handleDrop = (targetStatus: PurchaseOrderStatus, orderId: string) => {
    const order = orders?.find((o) => o._id === orderId);
    if (!order || !orderId || order.status === targetStatus) return;
    if (!STATUS_TRANSITIONS[order.status].includes(targetStatus)) {
      toast.error(
        `Can't move directly from "${STATUS_LABEL[order.status]}" to "${STATUS_LABEL[targetStatus]}" — orders move through each stage in order.`,
      );
      return;
    }
    if (targetStatus === "confirmed") runAction(confirmOrder, orderId, "Order confirmed");
    else if (targetStatus === "received") requestFulfil(orderId);
    else if (targetStatus === "billed") runAction(billOrder, orderId, "Vendor bill created");
    else if (targetStatus === "cancelled") runAction(cancelOrder, orderId, "Order cancelled");
  };

  const orderActionsMenu = (order: PurchaseOrderWithVendor) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => openView(order._id)}>
          {order.status === "draft" ? "Edit" : "View details"}
        </DropdownMenuItem>
        {order.status === "draft" && (
          <DropdownMenuItem onClick={() => runAction(confirmOrder, order._id, "Order confirmed")}>
            <CheckCircle2 className="size-3.5" />
            Confirm order
          </DropdownMenuItem>
        )}
        {order.status === "confirmed" && (
          <DropdownMenuItem onClick={() => requestFulfil(order._id)}>
            <Package className="size-3.5" />
            Mark received
          </DropdownMenuItem>
        )}
        {order.status === "received" && (
          <DropdownMenuItem onClick={() => runAction(billOrder, order._id, "Vendor bill created")}>
            <Receipt className="size-3.5" />
            Create vendor bill
          </DropdownMenuItem>
        )}
        {(order.status === "draft" || order.status === "confirmed") && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => runAction(cancelOrder, order._id, "Order cancelled")}
            >
              <XCircle className="size-3.5" />
              Cancel order
            </DropdownMenuItem>
          </>
        )}
        {order.status === "draft" && (
          <DropdownMenuItem variant="destructive" onClick={() => setDeletingOrder(order)}>
            Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (orders === undefined) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Plus />
          New RFQ
        </Button>
      </div>

      {orders.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShoppingCart />
            </EmptyMedia>
            <EmptyTitle>No purchase orders yet</EmptyTitle>
            <EmptyDescription>
              Start an RFQ for a vendor, then confirm it into a purchase order.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={openCreate}>
              New RFQ
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <ViewSwitcher value={view} onChange={setView} />
            {view === "list" && (
              <ColumnVisibilityMenu
                columns={PO_COLUMNS}
                isVisible={isColumnVisible}
                toggle={toggleColumn}
              />
            )}
          </div>

          {view === "list" ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  {isColumnVisible("vendor") && <TableHead>Vendor</TableHead>}
                  {isColumnVisible("orderDate") && <TableHead>Order date</TableHead>}
                  {isColumnVisible("total") && <TableHead>Total</TableHead>}
                  {isColumnVisible("status") && <TableHead>Status</TableHead>}
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow
                    key={order._id}
                    className="cursor-pointer"
                    onClick={() => openView(order._id)}
                  >
                    <TableCell className="font-medium">{order.orderNumber}</TableCell>
                    {isColumnVisible("vendor") && (
                      <TableCell className="text-muted-foreground">
                        {order.vendorCompanyName ?? order.vendorContactName ?? "—"}
                      </TableCell>
                    )}
                    {isColumnVisible("orderDate") && (
                      <TableCell className="text-muted-foreground">
                        {new Date(order.orderDateIso).toLocaleDateString()}
                      </TableCell>
                    )}
                    {isColumnVisible("total") && (
                      <TableCell>{currency.format(order.total)}</TableCell>
                    )}
                    {isColumnVisible("status") && (
                      <TableCell>
                        <Badge variant={statusVariant[order.status]}>
                          {STATUS_LABEL[order.status]}
                        </Badge>
                      </TableCell>
                    )}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {orderActionsMenu(order)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="grid gap-4 overflow-x-auto md:grid-cols-5">
              {STATUSES.map((status) => {
                const statusOrders = orders.filter((o) => o.status === status.id);
                const statusTotal = statusOrders.reduce((sum, o) => sum + o.total, 0);

                return (
                  <div
                    key={status.id}
                    className="min-w-[220px] space-y-3"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleDrop(status.id, e.dataTransfer.getData("text/plain"));
                    }}
                  >
                    <div className="flex items-center justify-between px-1">
                      <span className="text-sm font-medium">{status.label}</span>
                      <Badge variant="secondary">{statusOrders.length}</Badge>
                    </div>
                    <p className="px-1 text-xs text-muted-foreground">
                      {currency.format(statusTotal)}
                    </p>
                    <div className="space-y-2">
                      {statusOrders.map((order) => (
                        <Card
                          key={order._id}
                          className="cursor-grab py-3 active:cursor-grabbing"
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData("text/plain", order._id)}
                          onClick={() => openView(order._id)}
                        >
                          <CardHeader className="px-3">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium leading-tight">
                                {order.orderNumber}
                              </p>
                              <div onClick={(e) => e.stopPropagation()}>
                                {orderActionsMenu(order)}
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="px-3 text-xs text-muted-foreground">
                            <p className="font-medium text-foreground">
                              {currency.format(order.total)}
                            </p>
                            {order.vendorCompanyName && <p>{order.vendorCompanyName}</p>}
                            {order.vendorContactName && <p>{order.vendorContactName}</p>}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <PurchaseOrderDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        order={editingOrder}
        lineItems={editingLineItems}
      />

      <AlertDialog
        open={!!deletingOrder}
        onOpenChange={(open) => !open && setDeletingOrder(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete RFQ?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {deletingOrder?.orderNumber}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <WarehousePickerDialog
        open={pickingOrderId !== null}
        title="Receive order"
        description="Choose the warehouse this order is received into."
        confirmLabel="Receive"
        warehouses={activeWarehouses}
        onClose={() => setPickingOrderId(null)}
        onConfirm={(warehouseId) => {
          const id = pickingOrderId;
          setPickingOrderId(null);
          if (id) void fulfil(id, warehouseId);
        }}
      />
    </div>
  );
}
