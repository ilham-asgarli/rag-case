import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/server/guards";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Every authenticated page validates the session server-side. The proxy only
  // shapes navigation; this is the check that actually gates rendering.
  const session = await getSession();
  if (!session) redirect("/sign-in");

  return (
    <AppShell
      user={{
        name: session.user.name,
        email: session.user.email,
        role: String(session.user.role ?? "user"),
      }}
    >
      {children}
    </AppShell>
  );
}
