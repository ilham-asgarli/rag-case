"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button, Card, Input } from "@/components/ui";
import { signIn } from "@/lib/auth-client";

/** Routes a user may be returned to after signing in. */
const RETURN_ROUTES = ["/chat", "/dashboard", "/consent"] as const;
type ReturnRoute = (typeof RETURN_ROUTES)[number];

/**
 * Resolves `?next=` against an allowlist.
 *
 * The parameter is attacker-controlled, so redirecting to it unchecked is an
 * open redirect: `?next=https://evil.example` would send a freshly
 * authenticated user to a phishing page that looks like a continuation of
 * sign-in. An allowlist closes that, and unlike a "starts with /" check it
 * also prevents bouncing users to arbitrary internal paths.
 */
const safeNext = (value: string | null): ReturnRoute => {
  const base = value?.split("?")[0];
  return RETURN_ROUTES.find((route) => route === base) ?? "/chat";
};

const SignInForm = () => {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const result = await signIn.email({ email, password });

    if (result.error) {
      // Deliberately generic: distinguishing "no such account" from "wrong
      // password" tells an attacker which emails are registered.
      setError("That email and password combination is not recognised.");
      setBusy(false);
      return;
    }

    router.push(safeNext(params.get("next")));
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div>
        <label htmlFor="email" className="mb-1 block font-medium text-ink text-sm">
          Email
        </label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1 block font-medium text-ink text-sm">
          Password
        </label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-critical-soft px-3 py-2 text-critical text-sm">
          {error}
        </p>
      )}

      <Button type="submit" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </Button>

      <p className="text-center text-ink-subtle text-sm">
        No account?{" "}
        <Link href="/sign-up" className="text-accent hover:underline">
          Create one
        </Link>
      </p>
    </form>
  );
};

export default function SignInPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-sm p-6">
        <h1 className="font-semibold text-ink text-xl">Sign in</h1>
        <p className="mt-1 mb-5 text-ink-muted text-sm">
          Search and ask questions about the Lumen documentation corpus.
        </p>

        <Suspense fallback={null}>
          <SignInForm />
        </Suspense>

        <div className="mt-5 rounded-lg bg-surface-sunken px-3 py-2 text-ink-muted text-xs">
          <p className="mb-1 font-medium text-ink">Demo accounts</p>
          <p className="font-mono">admin@lumen.test · admin-password-123</p>
          <p className="font-mono">user@lumen.test · user-password-1234</p>
        </div>
      </Card>
    </div>
  );
}
