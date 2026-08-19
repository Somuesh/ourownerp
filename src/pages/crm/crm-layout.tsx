import { Link, Outlet, useLocation } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { Users2 } from "lucide-react";

const TABS = [
  { to: "/crm", label: "Contacts" },
  { to: "/crm/companies", label: "Companies" },
  { to: "/crm/deals", label: "Deals" },
];

export default function CrmLayout() {
  const location = useLocation();
  const activeTab =
    TABS.find((tab) => tab.to === location.pathname)?.to ?? TABS[0].to;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Users2 className="size-5" />
        </div>
        <div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight">
            CRM
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage contacts, companies, and your sales pipeline.
          </p>
        </div>
      </div>

      <Tabs value={activeTab}>
        <TabsList>
          {TABS.map((tab) => (
            <TabsTrigger key={tab.to} value={tab.to} asChild>
              <Link to={tab.to}>{tab.label}</Link>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Outlet />
    </div>
  );
}
