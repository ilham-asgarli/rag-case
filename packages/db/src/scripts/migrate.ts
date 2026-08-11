import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { loadRootEnv } from "../env";

loadRootEnv();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env.");
  process.exit(1);
}

// A dedicated single connection: the migrator runs DDL serially and should not
// borrow from the application pool.
const client = postgres(connectionString, { max: 1 });

try {
  console.info("Applying migrations...");
  await migrate(drizzle(client), {
    migrationsFolder: resolve(import.meta.dirname, "../../migrations"),
  });
  console.info("Migrations applied.");
  await client.end();
  process.exit(0);
} catch (error) {
  console.error("Migration failed:", error);
  await client.end();
  process.exit(1);
}
