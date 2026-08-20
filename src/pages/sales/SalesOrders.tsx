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
import SalesOrderDialog from "./_components/sales-order-dialog.tsx";

const STATUS_LABEL: Record<SalesOrderStatus, string> = {
  draft: "Quotation",
  confirmed: "Confirmed",
  delivered: "Delivered",
  invoiced: "Invoiced",
  cancelled: "Cancelled",
};

const statusVariant: Record<SalesOrderStatus, "secondary" | "default" | "destructive"> = {
  draft: "secondary",
  confirmed: "default",
  delivered: "default",
  invoiced: "secondary",
  cancelled: "destructive",
};

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

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

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | undefined>();
  const [editingLineItems, setEditingLineItems] = useState<SalesOrderLineItem[] | undefined>();
  const [deletingOrder, setDeletingOrder] = useState<SalesOrderWithParty | undefined>();

  const openCreate = () => {
    setEditingOrderId(undefined);
    setEditingLineItems(undefined);
    setDialogOpen(true);
  };

  const openEdit = async (orderId: string) => {
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Order date</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order._id}>
                <TableCell className="font-medium">{order.orderNumber}</TableCell>
                <TableCell className="text-muted-foreground">
                  {order.companyName ?? order.contactName ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(order.orderDateIso).toLocaleDateString()}
                </TableCell>
                <TableCell>{currency.format(order.total)}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant[order.status]}>{STATUS_LABEL[order.status]}</Badge>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8">
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {order.status === "draft" && (
                        <>
                          <DropdownMenuItem onClick={() => openEdit(order._id)}>Edit</DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => runAction(confirmOrder, order._id, "Order confirmed")}
                          >
                            <CheckCircle2 className="size-3.5" />
                            Confirm order
                          </DropdownMenuItem>
                        </>
                      )}
                      {order.status === "confirmed" && (
                        <DropdownMenuItem
                          onClick={() => runAction(deliverOrder, order._id, "Marked as delivered")}
                        >
                          <Package className="size-3.5" />
                          Mark delivered
                        </DropdownMenuItem>
                      )}
                      {order.status === "delivered" && (
                        <DropdownMenuItem
                          onClick={() => runAction(invoiceOrder, order._id, "Invoice created")}
                        >
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
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setDeletingOrder(order)}
                        >
                          Delete
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
