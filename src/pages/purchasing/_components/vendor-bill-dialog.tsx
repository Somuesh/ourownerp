import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, PlusCircle, Trash2 } from "lucide-react";
import { useApiClient, ApiError } from "@/lib/api-client.ts";
import type { Company, Contact, Product, VendorBill, VendorBillLineItem } from "@/lib/types.ts";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import CompanyDialog from "@/pages/crm/_components/company-dialog.tsx";
import ContactDialog from "@/pages/crm/_components/contact-dialog.tsx";

const CREATE_COMPANY = "__create_company__";
const CREATE_CONTACT = "__create_contact__";

const lineItemSchema = z.object({
  productId: z.string().optional(),
  description: z.string().min(1, "Description is required"),
  quantity: z
    .string()
    .min(1, "Required")
    .refine((v) => !Number.isNaN(Number(v)) && Number(v) > 0, "Enter a positive number"),
  unitPrice: z
    .string()
    .min(1, "Required")
    .refine((v) => !Number.isNaN(Number(v)) && Number(v) >= 0, "Enter a valid price"),
});

const billSchema = z.object({
  vendorContactId: z.string().optional(),
  vendorCompanyId: z.string().optional(),
  billDate: z.string().min(1, "Bill date is required"),
  dueDate: z.string().min(1, "Due date is required"),
  taxRate: z
    .string()
    .refine((v) => !Number.isNaN(Number(v)) && Number(v) >= 0, "Enter a valid rate"),
  notes: z.string().optional(),
  lineItems: z.array(lineItemSchema).min(1, "Add at least one line item"),
});

type BillFormValues = z.infer<typeof billSchema>;

export default function VendorBillDialog({
  open,
  onOpenChange,
  bill,
  lineItems,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bill?: VendorBill;
  lineItems?: Array<VendorBillLineItem>;
}) {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const { data: contacts } = useQuery<Contact[]>({
    queryKey: ["contacts"],
    queryFn: () => api.get("/contacts"),
  });
  const { data: companies } = useQuery<Company[]>({
    queryKey: ["companies"],
    queryFn: () => api.get("/companies"),
  });
  const { data: products } = useQuery<Product[]>({
    queryKey: ["products"],
    queryFn: () => api.get("/products"),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["vendor-bills"] });

  const createBill = useMutation({
    mutationFn: (payload: unknown) => api.post("/vendor-bills", payload),
    onSuccess: invalidate,
  });
  const updateBill = useMutation({
    mutationFn: ({ billId, ...payload }: { billId: string } & Record<string, unknown>) =>
      api.patch(`/vendor-bills/${billId}`, payload),
    onSuccess: invalidate,
  });

  const [newCompanyDialogOpen, setNewCompanyDialogOpen] = useState(false);
  const [newContactDialogOpen, setNewContactDialogOpen] = useState(false);

  const form = useForm<BillFormValues>({
    resolver: zodResolver(billSchema),
    defaultValues: {
      vendorContactId: "none",
      vendorCompanyId: "none",
      billDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date().toISOString().slice(0, 10),
      taxRate: "0",
      notes: "",
      lineItems: [{ productId: "none", description: "", quantity: "1", unitPrice: "0" }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "lineItems" });

  useEffect(() => {
    if (open) {
      form.reset({
        vendorContactId: bill?.vendorContactId ?? "none",
        vendorCompanyId: bill?.vendorCompanyId ?? "none",
        billDate: bill?.billDateIso.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
        dueDate: bill?.dueDateIso.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
        taxRate: bill ? String(bill.taxRate) : "0",
        notes: bill?.notes ?? "",
        lineItems:
          lineItems && lineItems.length > 0
            ? lineItems.map((item) => ({
                productId: item.productId ?? "none",
                description: item.description,
                quantity: String(item.quantity),
                unitPrice: String(item.unitPrice),
              }))
            : [{ productId: "none", description: "", quantity: "1", unitPrice: "0" }],
      });
    }
  }, [open, bill, lineItems, form]);

  const watchedLineItems = form.watch("lineItems");
  const watchedTaxRate = form.watch("taxRate");
  const subtotal = watchedLineItems.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unitPrice) || 0;
    return sum + qty * price;
  }, 0);
  const taxAmount = subtotal * ((Number(watchedTaxRate) || 0) / 100);
  const total = subtotal + taxAmount;
  const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

  const handleProductSelect = (index: number, productId: string) => {
    form.setValue(`lineItems.${index}.productId`, productId);
    if (productId !== "none") {
      const product = products?.find((p) => p._id === productId);
      if (product) {
        form.setValue(`lineItems.${index}.description`, product.name);
        form.setValue(`lineItems.${index}.unitPrice`, String(product.price));
      }
    }
  };

  const onSubmit = async (values: BillFormValues) => {
    try {
      const vendorContactId =
        values.vendorContactId && values.vendorContactId !== "none"
          ? values.vendorContactId
          : undefined;
      const vendorCompanyId =
        values.vendorCompanyId && values.vendorCompanyId !== "none"
          ? values.vendorCompanyId
          : undefined;

      const payload = {
        vendorContactId,
        vendorCompanyId,
        billDateIso: new Date(values.billDate).toISOString(),
        dueDateIso: new Date(values.dueDate).toISOString(),
        notes: values.notes || undefined,
        taxRate: Number(values.taxRate),
        lineItems: values.lineItems.map((item) => ({
          productId: item.productId && item.productId !== "none" ? item.productId : undefined,
          description: item.description,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
        })),
      };

      if (bill) {
        await updateBill.mutateAsync({ billId: bill._id, ...payload });
        toast.success("Vendor bill updated");
      } else {
        await createBill.mutateAsync(payload);
        toast.success("Vendor bill created");
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{bill ? "Edit vendor bill" : "New vendor bill"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="vendorCompanyId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vendor company</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(value) =>
                        value === CREATE_COMPANY
                          ? setNewCompanyDialogOpen(true)
                          : field.onChange(value)
                      }
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="No company" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">No company</SelectItem>
                        {companies?.map((company) => (
                          <SelectItem key={company._id} value={company._id}>
                            {company.name}
                          </SelectItem>
                        ))}
                        <SelectSeparator />
                        <SelectItem value={CREATE_COMPANY}>
                          <PlusCircle className="size-3.5" />
                          Create new company
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="vendorContactId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vendor contact</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(value) =>
                        value === CREATE_CONTACT
                          ? setNewContactDialogOpen(true)
                          : field.onChange(value)
                      }
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="No contact" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">No contact</SelectItem>
                        {contacts?.map((contact) => (
                          <SelectItem key={contact._id} value={contact._id}>
                            {contact.name}
                          </SelectItem>
                        ))}
                        <SelectSeparator />
                        <SelectItem value={CREATE_CONTACT}>
                          <PlusCircle className="size-3.5" />
                          Create new contact
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="billDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bill date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Due date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="taxRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tax rate (%)</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step="0.1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <FormLabel>Line items</FormLabel>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    append({ productId: "none", description: "", quantity: "1", unitPrice: "0" })
                  }
                >
                  <Plus className="size-3.5" />
                  Add item
                </Button>
              </div>

              <div className="space-y-3">
                {fields.map((field, index) => (
                  <div
                    key={field.id}
                    className="grid grid-cols-[1fr_1fr_70px_90px_28px] items-start gap-2 rounded-lg border p-2"
                  >
                    <Select
                      value={form.watch(`lineItems.${index}.productId`)}
                      onValueChange={(value) => handleProductSelect(index, value)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Product" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Custom</SelectItem>
                        {products?.map((product) => (
                          <SelectItem key={product._id} value={product._id}>
                            {product.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormField
                      control={form.control}
                      name={`lineItems.${index}.description`}
                      render={({ field: descField }) => (
                        <FormItem>
                          <FormControl>
                            <Input placeholder="Description" {...descField} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`lineItems.${index}.quantity`}
                      render={({ field: qtyField }) => (
                        <FormItem>
                          <FormControl>
                            <Input type="number" min={0} step="1" placeholder="Qty" {...qtyField} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`lineItems.${index}.unitPrice`}
                      render={({ field: priceField }) => (
                        <FormItem>
                          <FormControl>
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              placeholder="Price"
                              {...priceField}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      disabled={fields.length === 1}
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              {form.formState.errors.lineItems?.message && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.lineItems.message}
                </p>
              )}
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Payment terms, reference number, etc." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex flex-col items-end gap-1 rounded-lg bg-muted/50 p-3 text-sm">
              <div className="flex w-48 justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{currency.format(subtotal)}</span>
              </div>
              <div className="flex w-48 justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span>{currency.format(taxAmount)}</span>
              </div>
              <div className="flex w-48 justify-between font-semibold">
                <span>Total</span>
                <span>{currency.format(total)}</span>
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {bill ? "Save changes" : "Create vendor bill"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>

      <CompanyDialog
        open={newCompanyDialogOpen}
        onOpenChange={setNewCompanyDialogOpen}
        onCreated={(id) => {
          queryClient.invalidateQueries({ queryKey: ["companies"] });
          form.setValue("vendorCompanyId", id);
        }}
      />
      <ContactDialog
        open={newContactDialogOpen}
        onOpenChange={setNewContactDialogOpen}
        onCreated={(id) => {
          queryClient.invalidateQueries({ queryKey: ["contacts"] });
          form.setValue("vendorContactId", id);
        }}
      />
    </Dialog>
  );
}
