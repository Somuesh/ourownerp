import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  Boxes,
  History,
  MoreHorizontal,
  Plus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useApiClient } from "@/lib/api-client.ts";
import type { Product, StockAdjustmentWithAuthor } from "@/lib/types.ts";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import ProductDialog from "./_components/product-dialog.tsx";
import StockAdjustmentDialog from "./_components/stock-adjustment-dialog.tsx";

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

export default function Inventory() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const { data: products } = useQuery<Product[]>({
    queryKey: ["products"],
    queryFn: () => api.get("/products"),
  });
  const deleteProduct = useMutation({
    mutationFn: (productId: string) => api.del(`/products/${productId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | undefined>();
  const [deletingProduct, setDeletingProduct] = useState<Product | undefined>();
  const [adjustingProduct, setAdjustingProduct] = useState<Product | undefined>();
  const [historyProduct, setHistoryProduct] = useState<Product | undefined>();

  const openCreate = () => {
    setEditingProduct(undefined);
    setDialogOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingProduct) return;
    try {
      await deleteProduct.mutateAsync(deletingProduct._id);
      toast.success("Product deleted");
    } catch {
      toast.error("Failed to delete product");
    } finally {
      setDeletingProduct(undefined);
    }
  };

  if (products === undefined) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  const lowStockProducts = products.filter(
    (product) => product.stockQuantity <= product.lowStockThreshold,
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Boxes className="size-5" />
        </div>
        <div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight">
            Inventory
          </h1>
          <p className="text-sm text-muted-foreground">
            Track products, stock levels, and low-stock alerts.
          </p>
        </div>
      </div>

      {lowStockProducts.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div className="text-sm">
            <p className="font-medium text-destructive">
              {lowStockProducts.length} product
              {lowStockProducts.length > 1 ? "s" : ""} running low on stock
            </p>
            <p className="text-muted-foreground">
              {lowStockProducts.map((p) => p.name).join(", ")}
            </p>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Plus />
          New product
        </Button>
      </div>

      {products.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Boxes />
            </EmptyMedia>
            <EmptyTitle>No products yet</EmptyTitle>
            <EmptyDescription>
              Add products to start tracking stock levels and pricing.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={openCreate}>
              Add product
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => {
              const isLow = product.stockQuantity <= product.lowStockThreshold;
              return (
                <TableRow key={product._id}>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {product.sku}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {product.category ?? "—"}
                  </TableCell>
                  <TableCell>{currency.format(product.price)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span>{product.stockQuantity}</span>
                      {isLow && (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="size-3" />
                          Low
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setAdjustingProduct(product)}>
                          <TrendingUp className="size-3.5" />
                          Adjust stock
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setHistoryProduct(product)}>
                          <History className="size-3.5" />
                          View history
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEdit(product)}>
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setDeletingProduct(product)}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <ProductDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        product={editingProduct}
      />

      <StockAdjustmentDialog
        open={!!adjustingProduct}
        onOpenChange={(open) => !open && setAdjustingProduct(undefined)}
        product={adjustingProduct}
      />

      <StockHistoryDialog
        open={!!historyProduct}
        onOpenChange={(open) => !open && setHistoryProduct(undefined)}
        product={historyProduct}
      />

      <AlertDialog
        open={!!deletingProduct}
        onOpenChange={(open) => !open && setDeletingProduct(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete product?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {deletingProduct?.name} and its stock
              history.
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

function StockHistoryDialog({
  open,
  onOpenChange,
  product,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product;
}) {
  const api = useApiClient();
  const { data: adjustments } = useQuery<StockAdjustmentWithAuthor[]>({
    queryKey: ["adjustments", product?._id],
    queryFn: () => api.get(`/products/${product!._id}/adjustments`),
    enabled: !!product,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Stock history{product ? ` — ${product.name}` : ""}</DialogTitle>
        </DialogHeader>
        <div className="max-h-96 space-y-2 overflow-y-auto">
          {adjustments === undefined ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : adjustments.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No stock adjustments yet.
            </p>
          ) : (
            adjustments.map((adjustment) => (
              <div
                key={adjustment._id}
                className="flex items-start justify-between gap-3 rounded-lg border p-3"
              >
                <div className="space-y-0.5">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    {adjustment.quantityChange > 0 ? (
                      <TrendingUp className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <TrendingDown className="size-3.5 text-destructive" />
                    )}
                    {adjustment.quantityChange > 0 ? "+" : ""}
                    {adjustment.quantityChange}
                  </p>
                  <p className="text-xs text-muted-foreground">{adjustment.reason}</p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>{adjustment.createdByName ?? "Someone"}</p>
                  <p>
                    {formatDistanceToNow(new Date(adjustment.createdAtIso), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
