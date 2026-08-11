"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, Input } from "@/components/ui";
import { signUp } from "@/lib/auth-client";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    // New accounts are always role "user". The role field is not settable from
    // a sign-up payload, so nobody can register themselves as an admin.
    const result = await signUp.email({ name, email, password });

    if (result.error) {
      setError(result.error.message ?? "Could not create that account.");
      setBusy(false);
      return;
    }

    router.push("/chat");
    router.refresh();
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-sm p-6">
        <h1 className="font-semibold text-ink text-xl">Create an account</h1>
        <p className="mt-1 mb-5 text-ink-muted text-sm">
          New accounts can search and ask questions. Dashboard access is granted by an
          administrator.
        </p>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <div>
            <label htmlFor="name" className="mb-1 block font-medium text-ink text-sm">
              Name
            </label>
            <Input
              id="name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

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
              autoComplete="new-password"
              required
              minLength={12}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <p className="mt-1 text-ink-subtle text-xs">At least 12 characters.</p>
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-critical-soft px-3 py-2 text-critical text-sm">
              {error}
            </p>
          )}

          <Button type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create account"}
          </Button>

          <p className="text-center text-ink-subtle text-sm">
            Already have one?{" "}
            <Link href="/sign-in" className="text-accent hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </Card>
    </div>
  );
}
