import postgres from "postgres";
import { loadRootEnv } from "../env.js";

loadRootEnv();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env.");
  process.exit(1);
}

const client = postgres(connectionString, { max: 1 });

try {
  // Without fresh statistics after a bulk ingest, the planner sequential-scans
  // and the HNSW index looks like it "doesn't work".
  console.info("Analyzing chunks and documents...");
  await client.unsafe("ANALYZE chunks; ANALYZE documents;");
  console.info("Done.");
  await client.end();
  process.exit(0);
} catch (error) {
  console.error("ANALYZE failed:", error);
  await client.end();
  process.exit(1);
}
