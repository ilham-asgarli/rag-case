import { eq } from "drizzle-orm";
import { getDb } from "../client";
import { user } from "../schema/auth";

/**
 * User queries.
 *
 * These live here rather than in `@rag/auth` so every SQL statement in the
 * system is issued from one package. That keeps the layering honest, and it
 * also avoids importing drizzle-orm from two packages, which pnpm can resolve
 * to two physically distinct copies whose types are then incompatible.
 */

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: Date;
}

export const findUserByEmail = async (email: string): Promise<UserRecord | undefined> => {
  const rows = await getDb()
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  return rows[0];
};

export const listUsers = async (): Promise<UserRecord[]> =>
  getDb()
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
    })
    .from(user)
    .orderBy(user.createdAt);

export const setUserRole = async (userId: string, role: "admin" | "user"): Promise<void> => {
  await getDb().update(user).set({ role }).where(eq(user.id, userId));
};

export const setUserRoleByEmail = async (email: string, role: "admin" | "user"): Promise<void> => {
  await getDb().update(user).set({ role }).where(eq(user.email, email));
};
