import { BrowserRouter, Route, Routes } from "react-router-dom";
import { DefaultProviders } from "./components/providers/default.tsx";
import AuthCallback from "./pages/auth/Callback.tsx";
import AppLayout from "./pages/app-layout.tsx";
import Index from "./pages/Index.tsx";
import CrmLayout from "./pages/crm/crm-layout.tsx";
import Contacts from "./pages/crm/Contacts.tsx";
import Companies from "./pages/crm/Companies.tsx";
import Deals from "./pages/crm/Deals.tsx";
import ContactDetail from "./pages/crm/ContactDetails.tsx";
import Inventory from "./pages/inventory/Inventory.tsx";
import Invoices from "./pages/invoices/Invoices.tsx";
import SalesOrders from "./pages/sales/SalesOrders.tsx";
import Portal from "./pages/portal/Portal.tsx";
import PortalInvoiceDetail from "./pages/portal/PortalInvoiceDetails.tsx";
import SettingsUsers from "./pages/settings/Users.tsx";
import RequireRole from "./components/require-roles.tsx";
import NotFound from "./pages/NotFound.tsx";

export default function App() {
  return (
    <DefaultProviders>
      <BrowserRouter>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<Index />} />
            <Route path="/crm/contacts/:contactId" element={<ContactDetail />} />
            <Route element={<CrmLayout />}>
              <Route path="/crm" element={<Contacts />} />
              <Route path="/crm/companies" element={<Companies />} />
              <Route path="/crm/deals" element={<Deals />} />
            </Route>
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/sales" element={<SalesOrders />} />
            <Route path="/invoices" element={<Invoices />} />
            <Route
              path="/portal"
              element={
                <RequireRole roles={["client"]}>
                  <Portal />
                </RequireRole>
              }
            />
            <Route
              path="/portal/invoices/:invoiceId"
              element={
                <RequireRole roles={["client"]}>
                  <PortalInvoiceDetail />
                </RequireRole>
              }
            />
            <Route
              path="/settings/users"
              element={
                <RequireRole roles={["admin"]}>
                  <SettingsUsers />
                </RequireRole>
              }
            />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </DefaultProviders>
  );
}

