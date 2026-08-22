import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useApiClient, ApiError } from "@/lib/api-client.ts";
import type { Company } from "@/lib/types.ts";
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

const companySchema = z.object({
  name: z.string().min(1, "Name is required"),
  website: z.string().optional(),
  industry: z.string().optional(),
});

type CompanyFormValues = z.infer<typeof companySchema>;

export default function CompanyDialog({
  open,
  onOpenChange,
  company,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company?: Company;
  /** Called with the new company's id right after a successful create
   * (not on edit) — lets a calling form (e.g. the Invoice or Sales Order
   * dialog) auto-select the company it just created inline. */
  onCreated?: (id: string) => void;
}) {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["companies"] });

  const createCompany = useMutation({
    mutationFn: (values: { name: string; website?: string; industry?: string }) =>
      api.post("/companies", values),
    onSuccess: invalidate,
  });
  const updateCompany = useMutation({
    mutationFn: (values: { companyId: string; name: string; website?: string; industry?: string }) =>
      api.patch(`/companies/${values.companyId}`, values),
    onSuccess: invalidate,
  });

  const form = useForm<CompanyFormValues>({
    resolver: zodResolver(companySchema),
    defaultValues: { name: "", website: "", industry: "" },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: company?.name ?? "",
        website: company?.website ?? "",
        industry: company?.industry ?? "",
      });
    }
  }, [open, company, form]);

  const onSubmit = async (values: CompanyFormValues) => {
    try {
      if (company) {
        await updateCompany.mutateAsync({
          companyId: company._id,
          name: values.name,
          website: values.website || undefined,
          industry: values.industry || undefined,
        });
        toast.success("Company updated");
      } else {
        const created = await createCompany.mutateAsync({
          name: values.name,
          website: values.website || undefined,
          industry: values.industry || undefined,
        });
        toast.success("Company created");
        onCreated?.(created._id);
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
          <DialogTitle>{company ? "Edit company" : "New company"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Acme Inc." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="industry"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Industry</FormLabel>
                  <FormControl>
                    <Input placeholder="Software" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="website"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Website</FormLabel>
                  <FormControl>
                    <Input placeholder="acme.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {company ? "Save changes" : "Create company"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
