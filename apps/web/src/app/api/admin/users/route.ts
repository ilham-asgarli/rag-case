import { auth } from "@rag/auth";
import { inviteUserSchema, type UserSummary, updateUserRoleSchema } from "@rag/contracts";
import { findUserByEmail, listUsers, setUserRole } from "@rag/db";
import { NextResponse } from "next/server";
import { errorResponse, parseBody, toErrorResponse } from "@/server/api";
import { requireAdmin } from "@/server/guards";

export const dynamic = "force-dynamic";

const toSummary = (row: {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: Date;
}): UserSummary => ({
  id: row.id,
  email: row.email,
  name: row.name,
  role: row.role === "admin" ? "admin" : "user",
  createdAt: row.createdAt.toISOString(),
});

export async function GET(): Promise<Response> {
  try {
    await requireAdmin();
    return NextResponse.json({ users: (await listUsers()).map(toSummary) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Invites a user by creating the account directly — there is no mail provider configured. */
export async function POST(request: Request): Promise<Response> {
  try {
    await requireAdmin();
    const body = await parseBody(request, inviteUserSchema);

    if (await findUserByEmail(body.email)) {
      return errorResponse("invalid_request", "An account with that email already exists.");
    }

    await auth.api.signUpEmail({
      body: { email: body.email, password: body.password, name: body.name },
    });

    // Role is applied after creation: it is not settable through sign-up, so a
    // self-registering user can never choose it.
    const created = await findUserByEmail(body.email);
    if (!created) return errorResponse("internal", "The account could not be created.");
    if (body.role === "admin") await setUserRole(created.id, "admin");

    return NextResponse.json({ user: toSummary({ ...created, role: body.role }) }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const session = await requireAdmin();
    const { userId, role } = await parseBody(request, updateUserRoleSchema);

    // Without this an admin can demote themselves and lock the last
    // administrator out of the dashboard entirely.
    if (userId === session.user.id && role !== "admin") {
      return errorResponse("invalid_request", "You cannot remove your own administrator access.");
    }

    await setUserRole(userId, role);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
