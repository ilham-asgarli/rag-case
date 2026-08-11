import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

export type Database = ReturnType<typeof createDb>;

const createDb = (connectionString: string) => {
  const client = postgres(connectionString, {
    // pgvector returns `vector` as a string; postgres.js needs no special
    // handling, but keep the pool small — Next dev creates a client per
    // module reload without the global cache below.
    max: 10,
    prepare: false,
  });
  return drizzle(client, { schema });
};

/**
 * Cached on globalThis so Next.js hot reloads and route handlers share one
 * pool instead of opening a new one per module evaluation.
 */
const globalForDb = globalThis as unknown as { __ragDb?: Database };

export const getDb = (): Database => {
  const existing = globalForDb.__ragDb;
  if (existing) return existing;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and start Postgres with `docker compose up -d`.",
    );
  }

  const db = createDb(connectionString);
  globalForDb.__ragDb = db;
  return db;
};
