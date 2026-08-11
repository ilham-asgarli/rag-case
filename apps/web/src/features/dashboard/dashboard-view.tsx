"use client";

import type { DashboardStats, DocumentSummary, IngestionRun, UserSummary } from "@rag/contracts";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { formatDateTime, formatDuration } from "@/lib/utils";

type Tab = "overview" | "documents" | "ingestion" | "users";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "documents", label: "Documents" },
  { id: "ingestion", label: "Ingestion" },
  { id: "users", label: "Users" },
];

const Stat = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <Card className="p-4">
    <p className="text-ink-subtle text-xs uppercase tracking-wide">{label}</p>
    <p className="mt-1 font-semibold text-2xl text-ink tabular-nums">{value}</p>
    {hint && <p className="mt-0.5 text-ink-subtle text-xs">{hint}</p>}
  </Card>
);

/** Volume sparkline. Plain SVG — a chart library for seven bars is not worth the bundle. */
const VolumeChart = ({ data }: { data: Array<{ day: string; count: number }> }) => {
  if (data.length === 0) {
    return <p className="text-ink-subtle text-sm">No searches in the last 7 days.</p>;
  }
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="flex h-24 items-end gap-2" role="img" aria-label="Searches per day">
      {data.map((point) => (
        <div key={point.day} className="flex flex-1 flex-col items-center gap-1">
          <div
            className="w-full rounded-t bg-accent"
            style={{ height: `${Math.max(4, (point.count / max) * 80)}px` }}
            title={`${point.day}: ${point.count}`}
          />
          <span className="text-ink-subtle text-[10px]">{point.day.slice(5)}</span>
        </div>
      ))}
    </div>
  );
};

export const DashboardView = () => {
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<(DashboardStats & { runs: IngestionRun[] }) | null>(null);
  const [documents, setDocuments] = useState<DocumentSummary[] | null>(null);
  const [users, setUsers] = useState<UserSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reindexing, setReindexing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setError(null);
    const response = await fetch("/api/admin/stats");
    if (!response.ok) {
      setError("Could not load dashboard statistics.");
      return;
    }
    setStats(await response.json());
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    if (tab !== "documents" || documents) return;
    void fetch("/api/admin/documents?limit=200")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((data: { documents: DocumentSummary[] }) => setDocuments(data.documents))
      .catch(() => setError("Could not load documents."));
  }, [tab, documents]);

  useEffect(() => {
    if (tab !== "users" || users) return;
    void fetch("/api/admin/users")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((data: { users: UserSummary[] }) => setUsers(data.users))
      .catch(() => setError("Could not load users."));
  }, [tab, users]);

  const reindex = async () => {
    setReindexing(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/ingest", { method: "POST" });
      if (!response.ok) throw new Error("failed");
      const result = (await response.json()) as {
        counts: { added: number; updated: number; unchanged: number; removed: number };
      };
      const { added, updated, unchanged, removed } = result.counts;
      setNotice(
        `Re-index complete: ${added} added, ${updated} updated, ${unchanged} unchanged, ${removed} removed.`,
      );
      setDocuments(null);
      await loadStats();
    } catch {
      setError("The re-index failed. Check the server logs.");
    } finally {
      setReindexing(false);
    }
  };

  const changeRole = async (userId: string, role: "admin" | "user") => {
    const response = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });
    if (!response.ok) {
      const problem = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(problem?.error?.message ?? "Could not change that role.");
      return;
    }
    setUsers(null);
  };

  if (error && !stats) return <ErrorState message={error} onRetry={() => void loadStats()} />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <nav className="flex gap-1 rounded-lg bg-surface-sunken p-1" aria-label="Dashboard views">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTab(entry.id)}
              aria-current={tab === entry.id ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                tab === entry.id
                  ? "bg-surface-raised font-medium text-ink shadow-sm"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {entry.label}
            </button>
          ))}
        </nav>

        <Button className="ml-auto" onClick={() => void reindex()} disabled={reindexing}>
          {reindexing ? "Re-indexing…" : "Re-index corpus"}
        </Button>
      </div>

      {notice && (
        <p className="rounded-lg bg-positive-soft px-3 py-2 text-positive text-sm">{notice}</p>
      )}
      {error && stats && (
        <p className="rounded-lg bg-critical-soft px-3 py-2 text-critical text-sm">{error}</p>
      )}

      {tab === "overview" &&
        (!stats ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="Documents"
                value={String(stats.index.documentCount)}
                hint={`${stats.index.failedCount} failed`}
              />
              <Stat
                label="Chunks"
                value={String(stats.index.chunkCount)}
                hint={`~${stats.index.avgChunkTokens} tokens each`}
              />
              <Stat
                label="Searches"
                value={String(stats.search.totalQueries)}
                hint={`${stats.search.queriesLast7Days} in 7 days`}
              />
              <Stat
                label="Abstain rate"
                value={`${Math.round(stats.search.abstainRate * 100)}%`}
                hint="answers with no citation"
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="p-4">
                <h2 className="mb-3 font-medium text-ink text-sm">Index health</h2>
                <dl className="grid gap-2 text-sm">
                  {[
                    [
                      "Embedding model",
                      `${stats.index.embeddingModel} (${stats.index.embeddingDimensions}d)`,
                    ],
                    ["Reranker", stats.index.rerankModel],
                    ["Answer model", stats.index.answerModel],
                    ["Vector index", stats.index.vectorIndex],
                    ["Last indexed", formatDateTime(stats.index.lastIndexedAt)],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-4">
                      <dt className="text-ink-muted">{label}</dt>
                      <dd className="text-right font-mono text-ink text-xs">{value}</dd>
                    </div>
                  ))}
                </dl>
              </Card>

              <Card className="p-4">
                <h2 className="mb-3 font-medium text-ink text-sm">Search latency and volume</h2>
                <div className="mb-3 flex gap-6 text-sm">
                  <div>
                    <p className="text-ink-subtle text-xs">p50</p>
                    <p className="font-mono text-ink">{stats.search.latencyP50Ms} ms</p>
                  </div>
                  <div>
                    <p className="text-ink-subtle text-xs">p95</p>
                    <p className="font-mono text-ink">{stats.search.latencyP95Ms} ms</p>
                  </div>
                  <div>
                    <p className="text-ink-subtle text-xs">by source</p>
                    <p className="font-mono text-ink text-xs">
                      {stats.search.bySource.map((s) => `${s.source} ${s.count}`).join(" · ") ||
                        "—"}
                    </p>
                  </div>
                </div>
                <VolumeChart data={stats.search.volumeByDay} />
              </Card>
            </div>

            {stats.search.topQueries.length > 0 && (
              <Card className="p-4">
                <h2 className="mb-3 font-medium text-ink text-sm">Most frequent questions</h2>
                <ul className="flex flex-col gap-1.5">
                  {stats.search.topQueries.map((entry) => (
                    <li key={entry.query} className="flex justify-between gap-4 text-sm">
                      <span className="truncate text-ink-muted">{entry.query}</span>
                      <span className="shrink-0 font-mono text-ink-subtle">{entry.count}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </>
        ))}

      {tab === "documents" && (
        <Card className="overflow-x-auto">
          {!documents ? (
            <div className="p-4">
              <Skeleton className="h-40" />
            </div>
          ) : documents.length === 0 ? (
            <EmptyState
              title="Nothing indexed yet"
              description="Run `pnpm ingest`, or use Re-index corpus above."
            />
          ) : (
            <table className="w-full min-w-[46rem] text-sm">
              <thead className="border-border border-b text-ink-subtle text-xs">
                <tr>
                  {["Path", "Type", "Status", "Chunks", "Indexed"].map((header) => (
                    <th key={header} className="px-4 py-2 text-left font-medium">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id} className="border-border/60 border-b last:border-0">
                    <td className="px-4 py-2">
                      <p className="font-mono text-ink text-xs">{doc.path}</p>
                      {doc.lastError && (
                        <p className="mt-0.5 text-critical text-xs">{doc.lastError}</p>
                      )}
                    </td>
                    <td className="px-4 py-2 text-ink-muted">{doc.docType}</td>
                    <td className="px-4 py-2">
                      <Badge
                        tone={
                          doc.status === "indexed"
                            ? "positive"
                            : doc.status === "failed"
                              ? "critical"
                              : "neutral"
                        }
                      >
                        {doc.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 font-mono text-ink-muted">{doc.chunkCount}</td>
                    <td className="px-4 py-2 text-ink-muted text-xs">
                      {formatDateTime(doc.indexedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {tab === "ingestion" && (
        <Card className="overflow-x-auto">
          {!stats ? (
            <div className="p-4">
              <Skeleton className="h-40" />
            </div>
          ) : stats.runs.length === 0 ? (
            <EmptyState
              title="No ingestion runs yet"
              description="Run `pnpm ingest` to index the corpus."
            />
          ) : (
            <table className="w-full min-w-[42rem] text-sm">
              <thead className="border-border border-b text-ink-subtle text-xs">
                <tr>
                  {[
                    "Started",
                    "Trigger",
                    "Status",
                    "Added",
                    "Updated",
                    "Unchanged",
                    "Removed",
                    "Failed",
                    "Duration",
                  ].map((header) => (
                    <th key={header} className="px-3 py-2 text-left font-medium">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.runs.map((run) => (
                  <tr key={run.id} className="border-border/60 border-b last:border-0">
                    <td className="px-3 py-2 text-ink-muted text-xs">
                      {formatDateTime(run.startedAt)}
                    </td>
                    <td className="px-3 py-2 text-ink-muted">{run.trigger}</td>
                    <td className="px-3 py-2">
                      <Badge
                        tone={
                          run.status === "succeeded"
                            ? "positive"
                            : run.status === "failed"
                              ? "critical"
                              : "warning"
                        }
                      >
                        {run.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 font-mono">{run.counts.added}</td>
                    <td className="px-3 py-2 font-mono">{run.counts.updated}</td>
                    <td className="px-3 py-2 font-mono text-ink-subtle">{run.counts.unchanged}</td>
                    <td className="px-3 py-2 font-mono">{run.counts.removed}</td>
                    <td className="px-3 py-2 font-mono">{run.counts.failed}</td>
                    <td className="px-3 py-2 font-mono text-ink-muted text-xs">
                      {formatDuration(run.durationMs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {tab === "users" && (
        <Card className="overflow-x-auto">
          {!users ? (
            <div className="p-4">
              <Skeleton className="h-32" />
            </div>
          ) : (
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="border-border border-b text-ink-subtle text-xs">
                <tr>
                  {["Email", "Name", "Role", "Created", ""].map((header) => (
                    <th key={header} className="px-4 py-2 text-left font-medium">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((entry) => (
                  <tr key={entry.id} className="border-border/60 border-b last:border-0">
                    <td className="px-4 py-2 font-mono text-ink text-xs">{entry.email}</td>
                    <td className="px-4 py-2 text-ink-muted">{entry.name}</td>
                    <td className="px-4 py-2">
                      <Badge tone={entry.role === "admin" ? "accent" : "neutral"}>
                        {entry.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-ink-muted text-xs">
                      {formatDateTime(entry.createdAt)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          void changeRole(entry.id, entry.role === "admin" ? "user" : "admin")
                        }
                      >
                        {entry.role === "admin" ? "Make user" : "Make admin"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  );
};
