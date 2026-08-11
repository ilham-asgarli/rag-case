"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Badge, Button } from "@/components/ui";
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const ThemeToggle = () => (
  <Button
    variant="ghost"
    size="sm"
    aria-label="Toggle colour theme"
    onClick={() => {
      const root = document.documentElement;
      const dark = root.classList.toggle("dark");
      localStorage.setItem("theme", dark ? "dark" : "light");
    }}
  >
    Theme
  </Button>
);

export const AppShell = ({
  children,
  user,
}: {
  children: ReactNode;
  user: { name: string; email: string; role: string };
}) => {
  const pathname = usePathname();
  const router = useRouter();

  // `as const` keeps these literal so typedRoutes can check them.
  const links = [
    { href: "/chat", label: "Chat" },
    ...(user.role === "admin" ? ([{ href: "/dashboard", label: "Dashboard" }] as const) : []),
  ] as const;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-border border-b bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/chat" className="font-semibold text-ink">
            Lumen Corpus
          </Link>

          <nav className="flex gap-1" aria-label="Main">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm transition-colors",
                  pathname.startsWith(link.href)
                    ? "bg-surface-sunken font-medium text-ink"
                    : "text-ink-muted hover:text-ink",
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-ink-muted text-sm sm:inline">{user.email}</span>
            {user.role === "admin" && <Badge tone="accent">admin</Badge>}
            <ThemeToggle />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void signOut().then(() => router.push("/sign-in"));
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
};
