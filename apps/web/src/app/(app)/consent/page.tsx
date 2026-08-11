"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button, Card } from "@/components/ui";

const SCOPE_LABELS: Record<string, string> = {
  "corpus:search": "Search the documentation corpus and read matching passages",
  openid: "Confirm your identity",
  profile: "See your name",
  email: "See your email address",
};

/**
 * OAuth consent screen.
 *
 * An MCP client (Inspector, Claude Code) is redirected here mid-authorization
 * flow. The decision is posted back to Better Auth's consent endpoint, which
 * owns the authorization code exchange.
 */
const ConsentForm = () => {
  const params = useSearchParams();
  const [busy, setBusy] = useState<"accept" | "reject" | null>(null);

  const clientName = params.get("client_name") ?? params.get("client_id") ?? "An application";
  const scopes = (params.get("scope") ?? "").split(" ").filter(Boolean);

  const decide = async (accept: boolean) => {
    setBusy(accept ? "accept" : "reject");
    const response = await fetch("/api/auth/oauth2/consent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accept }),
    });

    const result = (await response.json().catch(() => null)) as { redirectURI?: string } | null;
    if (result?.redirectURI) {
      window.location.href = result.redirectURI;
      return;
    }
    setBusy(null);
  };

  return (
    <Card className="w-full max-w-md p-6">
      <h1 className="font-semibold text-ink text-lg">Authorize {clientName}</h1>
      <p className="mt-1 text-ink-muted text-sm">
        This application is requesting access to your account on the Lumen corpus.
      </p>

      <ul className="my-5 flex flex-col gap-2">
        {(scopes.length > 0 ? scopes : ["corpus:search"]).map((scope) => (
          <li key={scope} className="flex gap-2 text-sm">
            <span aria-hidden className="text-accent">
              •
            </span>
            <span className="text-ink">{SCOPE_LABELS[scope] ?? scope}</span>
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => void decide(true)} disabled={busy !== null}>
          {busy === "accept" ? "Authorizing…" : "Allow"}
        </Button>
        <Button
          className="flex-1"
          variant="secondary"
          onClick={() => void decide(false)}
          disabled={busy !== null}
        >
          Deny
        </Button>
      </div>

      <p className="mt-4 text-ink-subtle text-xs">
        Access is limited to searching the corpus. The application never receives your password.
      </p>
    </Card>
  );
};

export default function ConsentPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Suspense fallback={null}>
        <ConsentForm />
      </Suspense>
    </div>
  );
}
