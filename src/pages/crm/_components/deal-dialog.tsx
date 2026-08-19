import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useApiClient, ApiError } from "@/lib/api-client.ts";
import type { Company, Contact, Deal } from "@/lib/types.ts";
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
import { Button } from "@/components/ui/button.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";

const dealSchema = z.object({
  title: z.string().min(1, "Title is required"),
  value: z
    .string()
    .min(1, "Value is required")
    .refine((v) => !Number.isNaN(Number(v)) && Number(v) >= 0, "Enter a valid amount"),
  contactId: z.string().optional(),
  companyId: z.string().optional(),
});

type DealFormValues = z.infer<typeof dealSchema>;

export default function DealDialog({
  open,
  onOpenChange,
  deal,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal?: Deal;
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
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["deals"] });

  const createDeal = useMutation({
    mutationFn: (values: {
      title: string;
      value: number;
      stage: string;
      contactId?: string;
      companyId?: string;
    }) => api.post("/deals", values),
    onSuccess: invalidate,
  });
  const updateDeal = useMutation({
    mutationFn: (values: {
      dealId: string;
      title: string;
      value: number;
      contactId?: string;
      companyId?: string;
    }) => api.patch(`/deals/${values.dealId}`, values),
    onSuccess: invalidate,
  });

  const form = useForm<DealFormValues>({
    resolver: zodResolver(dealSchema),
    defaultValues: { title: "", value: "0", contactId: "none", companyId: "none" },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        title: deal?.title ?? "",
        value: deal ? String(deal.value) : "0",
        contactId: deal?.contactId ?? "none",
        companyId: deal?.companyId ?? "none",
      });
    }
  }, [open, deal, form]);

  const onSubmit = async (values: DealFormValues) => {
    try {
      const contactId =
        values.contactId && values.contactId !== "none" ? values.contactId : undefined;
      const companyId =
        values.companyId && values.companyId !== "none" ? values.companyId : undefined;
      const value = Number(values.value);

      if (deal) {
        await updateDeal.mutateAsync({
          dealId: deal._id,
          title: values.title,
          value,
          contactId,
          companyId,
        });
        toast.success("Deal updated");
      } else {
        await createDeal.mutateAsync({
          title: values.title,
          value,
          stage: "new",
          contactId,
          companyId,
        });
        toast.success("Deal created");
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{deal ? "Edit deal" : "New deal"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Website redesign project" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="value"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Value (USD)</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} step="0.01" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="companyId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Company</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
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
                  <Select value={field.value} onValueChange={field.onChange}>
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
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {deal ? "Save changes" : "Create deal"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
