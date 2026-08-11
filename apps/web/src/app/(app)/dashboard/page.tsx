import type { Metadata } from "next";
import { DashboardView } from "@/features/dashboard/dashboard-view";
import { requireAdmin } from "@/server/guards";

export const metadata: Metadata = { title: "Dashboard · Lumen Corpus" };

export default async function DashboardPage() {
  // The guard, not the proxy, is what makes this admin-only. A non-admin who
  // navigates here directly gets a 403 from this call.
  await requireAdmin();
  return <DashboardView />;
}
