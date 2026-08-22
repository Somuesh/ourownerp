import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  FileText,
  MoreHorizontal,
  Package,
  Plus,
  Receipt,
  XCircle,
} from "lucide-react";
import { useApiClient, ApiError } from "@/lib/api-client.ts";
import type { SalesOrderStatus, SalesOrderLineItem, SalesOrderWithParty } from "@/lib/types.ts";
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
import SalesOrderDialog from "./_components/sales-order-dialog.tsx";

const STATUSES: Array<{ id: SalesOrderStatus; label: string }> = [
  { id: "draft", label: "Quotation" },
  { id: "confirmed", label: "Confirmed" },
  { id: "delivered", label: "Delivered" },
  { id: "invoiced", label: "Invoiced" },
  { id: "cancelled", label: "Cancelled" },
];

const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.id, s.label])) as Record<
  SalesOrderStatus,
  string
>;

const statusVariant: Record<SalesOrderStatus, "secondary" | "default" | "destructive"> = {
  draft: "secondary",
  confirmed: "default",
  delivered: "default",
  invoiced: "secondary",
  cancelled: "destructive",
};

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

const SO_COLUMNS = [
  { id: "customer", label: "Customer" },
  { id: "orderDate", label: "Order date" },
  { id: "total", label: "Total" },
  { id: "status", label: "Status" },
] as const;
type SoColumn = (typeof SO_COLUMNS)[number]["id"];

// What dragging a card to a column is allowed to do — mirrors the state
// machine server/routes/salesOrders.ts enforces. Dragging to a
// non-adjacent column is rejected client-side with an explanation rather
// than silently failing against the API.
const STATUS_TRANSITIONS: Record<SalesOrderStatus, SalesOrderStatus[]> = {
  draft: ["confirmed", "cancelled"],
  confirmed: ["delivered", "cancelled"],
  delivered: ["invoiced"],
  invoiced: [],
  cancelled: [],
};

export default function SalesOrders() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const { data: orders } = useQuery<SalesOrderWithParty[]>({
    queryKey: ["sales-orders"],
    queryFn: () => api.get("/sales-orders"),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["sales-orders"] });

  const confirmOrder = useMutation({
    mutationFn: (id: string) => api.post(`/sales-orders/${id}/confirm`),
    onSuccess: invalidate,
  });
  const deliverOrder = useMutation({
    mutationFn: (id: string) => api.post(`/sales-orders/${id}/deliver`),
    onSuccess: invalidate,
  });
  const invoiceOrder = useMutation({
    mutationFn: (id: string) => api.post(`/sales-orders/${id}/invoice`),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
  const cancelOrder = useMutation({
    mutationFn: (id: string) => api.post(`/sales-orders/${id}/cancel`),
    onSuccess: invalidate,
  });
  const deleteOrder = useMutation({
    mutationFn: (id: string) => api.del(`/sales-orders/${id}`),
    onSuccess: invalidate,
  });

  const [view, setView] = useState<ViewMode>("list");
  const { isVisible: isColumnVisible, toggle: toggleColumn } = useColumnVisibility<SoColumn>(
    "sales-orders-list-columns",
    SO_COLUMNS.map((c) => c.id),
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | undefined>();
  const [editingLineItems, setEditingLineItems] = useState<SalesOrderLineItem[] | undefined>();
  const [deletingOrder, setDeletingOrder] = useState<SalesOrderWithParty | undefined>();

  const openCreate = () => {
    setEditingOrderId(undefined);
    setEditingLineItems(undefined);
    setDialogOpen(true);
  };

  const openView = async (orderId: string) => {
    const detail = await api.get(`/sales-orders/${orderId}`);
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
      toast.success("Quotation deleted");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to delete");
    } finally {
      setDeletingOrder(undefined);
    }
  };

  const editingOrder = orders?.find((o) => o._id === editingOrderId);

  const handleDrop = (targetStatus: SalesOrderStatus, orderId: string) => {
    const order = orders?.find((o) => o._id === orderId);
    if (!order || !orderId || order.status === targetStatus) return;
    if (!STATUS_TRANSITIONS[order.status].includes(targetStatus)) {
      toast.error(
        `Can't move directly from "${STATUS_LABEL[order.status]}" to "${STATUS_LABEL[targetStatus]}" — orders move through each stage in order.`,
      );
      return;
    }
    if (targetStatus === "confirmed") runAction(confirmOrder, orderId, "Order confirmed");
    else if (targetStatus === "delivered") runAction(deliverOrder, orderId, "Marked as delivered");
    else if (targetStatus === "invoiced") runAction(invoiceOrder, orderId, "Invoice created");
    else if (targetStatus === "cancelled") runAction(cancelOrder, orderId, "Order cancelled");
  };

  const orderActionsMenu = (order: SalesOrderWithParty) => (
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
          <DropdownMenuItem onClick={() => runAction(deliverOrder, order._id, "Marked as delivered")}>
            <Package className="size-3.5" />
            Mark delivered
          </DropdownMenuItem>
        )}
        {order.status === "delivered" && (
          <DropdownMenuItem onClick={() => runAction(invoiceOrder, order._id, "Invoice created")}>
            <FileText className="size-3.5" />
            Create invoice
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Receipt className="size-5" />
          </div>
          <div>
            <h1 className="font-serif text-2xl font-semibold tracking-tight">Sales Orders</h1>
            <p className="text-sm text-muted-foreground">
              Quote → confirm → deliver → invoice, in one flow.
            </p>
          </div>
        </div>
        <Button onClick={openCreate}>
          <Plus />
          New quotation
        </Button>
      </div>

      {orders.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Receipt />
            </EmptyMedia>
            <EmptyTitle>No quotations yet</EmptyTitle>
            <EmptyDescription>
              Start a quotation for a customer, then confirm it into an order.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={openCreate}>
              New quotation
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <ViewSwitcher value={view} onChange={setView} />
            {view === "list" && (
              <ColumnVisibilityMenu
                columns={SO_COLUMNS}
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
                  {isColumnVisible("customer") && <TableHead>Customer</TableHead>}
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
                    {isColumnVisible("customer") && (
                      <TableCell className="text-muted-foreground">
                        {order.companyName ?? order.contactName ?? "—"}
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
                            {order.companyName && <p>{order.companyName}</p>}
                            {order.contactName && <p>{order.contactName}</p>}
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

      <SalesOrderDialog
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
            <AlertDialogTitle>Delete quotation?</AlertDialogTitle>
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
    </div>
  );
}
