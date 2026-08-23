import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, PlusCircle, Trash2 } from "lucide-react";
import { useApiClient, ApiError } from "@/lib/api-client.ts";
import type { Company, Contact, Invoice, InvoiceLineItem, Product } from "@/lib/types.ts";
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

// Sentinel Select values that trigger the inline "create new" dialogs below
// instead of being treated as a real selection.
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

const invoiceSchema = z.object({
  contactId: z.string().optional(),
  companyId: z.string().optional(),
  issueDate: z.string().min(1, "Issue date is required"),
  dueDate: z.string().min(1, "Due date is required"),
  taxRate: z
    .string()
    .refine((v) => !Number.isNaN(Number(v)) && Number(v) >= 0, "Enter a valid rate"),
  notes: z.string().optional(),
  lineItems: z.array(lineItemSchema).min(1, "Add at least one line item"),
});

type InvoiceFormValues = z.infer<typeof invoiceSchema>;

export default function InvoiceDialog({
  open,
  onOpenChange,
  invoice,
  lineItems,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice?: Invoice;
  lineItems?: Array<InvoiceLineItem>;
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
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["invoices"] });

  const createInvoice = useMutation({
    mutationFn: (payload: unknown) => api.post("/invoices", payload),
    onSuccess: invalidate,
  });
  const updateInvoice = useMutation({
    mutationFn: ({ invoiceId, ...payload }: { invoiceId: string } & Record<string, unknown>) =>
      api.patch(`/invoices/${invoiceId}`, payload),
    onSuccess: invalidate,
  });

  const [newCompanyDialogOpen, setNewCompanyDialogOpen] = useState(false);
  const [newContactDialogOpen, setNewContactDialogOpen] = useState(false);

  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      contactId: "none",
      companyId: "none",
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date().toISOString().slice(0, 10),
      taxRate: "0",
      notes: "",
      lineItems: [{ productId: "none", description: "", quantity: "1", unitPrice: "0" }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lineItems",
  });

  useEffect(() => {
    if (open) {
      form.reset({
        contactId: invoice?.contactId ?? "none",
        companyId: invoice?.companyId ?? "none",
        issueDate: invoice?.issueDateIso.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
        dueDate: invoice?.dueDateIso.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
        taxRate: invoice ? String(invoice.taxRate) : "0",
        notes: invoice?.notes ?? "",
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
  }, [open, invoice, lineItems, form]);

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

  const onSubmit = async (values: InvoiceFormValues) => {
    try {
      const contactId =
        values.contactId && values.contactId !== "none" ? values.contactId : undefined;
      const companyId =
        values.companyId && values.companyId !== "none" ? values.companyId : undefined;

      const payload = {
        contactId,
        companyId,
        issueDateIso: new Date(values.issueDate).toISOString(),
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

      if (invoice) {
        await updateInvoice.mutateAsync({ invoiceId: invoice._id, ...payload });
        toast.success("Invoice updated");
      } else {
        await createInvoice.mutateAsync(payload);
        toast.success("Invoice created");
      }
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(error.message);
      } else {
        toast.error("Something went wrong");
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{invoice ? "Edit invoice" : "New invoice"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="companyId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company</FormLabel>
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
                name="contactId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact</FormLabel>
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
                name="issueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Issue date</FormLabel>
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
                    <Textarea placeholder="Payment terms, thank you note, etc." {...field} />
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
                {invoice ? "Save changes" : "Create invoice"}
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
          form.setValue("companyId", id);
        }}
      />
      <ContactDialog
        open={newContactDialogOpen}
        onOpenChange={setNewContactDialogOpen}
        onCreated={(id) => {
          queryClient.invalidateQueries({ queryKey: ["contacts"] });
          form.setValue("contactId", id);
        }}
      />
    </Dialog>
  );
}
