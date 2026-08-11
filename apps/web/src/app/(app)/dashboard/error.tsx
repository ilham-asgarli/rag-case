"use client";

import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";

export default function DashboardError({ error }: { error: Error }) {
  const router = useRouter();
  const forbidden = error.message.toLowerCase().includes("administrator");

  return (
    <Card className="mx-auto max-w-md p-6 text-center">
      <h1 className="font-semibold text-ink text-lg">
        {forbidden ? "Administrators only" : "Something went wrong"}
      </h1>
      <p className="mt-2 text-ink-muted text-sm">
        {forbidden
          ? "This dashboard is restricted to administrator accounts."
          : "The dashboard could not be loaded."}
      </p>
      <Button className="mt-4" onClick={() => router.push("/chat")}>
        Back to chat
      </Button>
    </Card>
  );
}
