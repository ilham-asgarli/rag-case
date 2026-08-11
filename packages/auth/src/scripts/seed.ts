import { findUserByEmail, loadRootEnv, setUserRoleByEmail } from "@rag/db";

loadRootEnv();

// Imported after env is loaded: the auth instance reads BETTER_AUTH_SECRET and
// DATABASE_URL at module scope.
const { auth } = await import("../index.js");

interface SeedUser {
  email: string;
  name: string;
  password: string;
  role: "admin" | "user";
}

/**
 * Demo accounts, documented in the README so a reviewer can sign in
 * immediately. Passwords meet the 12-character minimum the auth config sets.
 */
const SEED_USERS: SeedUser[] = [
  {
    email: "admin@lumen.test",
    name: "Ana Admin",
    password: "admin-password-123",
    role: "admin",
  },
  {
    email: "user@lumen.test",
    name: "Uma User",
    password: "user-password-1234",
    role: "user",
  },
];

/**
 * Sign-up goes through Better Auth rather than a direct insert, so the stored
 * password hash is produced by exactly the code path that later verifies it.
 * Hand-rolling the hash is how seeded accounts end up unable to sign in.
 *
 * Idempotent: existing accounts are skipped, and the role is re-asserted in
 * case it drifted.
 */
const seedUser = async (seed: SeedUser): Promise<"created" | "exists"> => {
  const existing = await findUserByEmail(seed.email);
  if (existing) {
    await setUserRoleByEmail(seed.email, seed.role);
    return "exists";
  }

  await auth.api.signUpEmail({
    body: { email: seed.email, password: seed.password, name: seed.name },
  });

  // `role` is not settable through sign-up (input: false) so nobody can
  // self-promote. Setting it here is the seeder acting as an administrator.
  await setUserRoleByEmail(seed.email, seed.role);
  return "created";
};

const main = async (): Promise<void> => {
  console.info("Seeding demo users...");
  for (const seed of SEED_USERS) {
    const result = await seedUser(seed);
    console.info(
      `  ${result === "created" ? "created " : "existing"}  ${seed.email} (${seed.role})`,
    );
  }

  console.info("\nSign in with:");
  for (const seed of SEED_USERS) {
    console.info(`  ${seed.email.padEnd(18)} ${seed.password}`);
  }
  process.exit(0);
};

main().catch((error: unknown) => {
  console.error("Seeding failed:", error);
  process.exit(1);
});
