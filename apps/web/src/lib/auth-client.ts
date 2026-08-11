"use client";

import { createAuthClient } from "better-auth/react";

/**
 * No baseURL: the client calls the origin it was served from.
 *
 * Pinning it to an env var would bake the origin into the browser bundle at
 * build time, so the same image could not be run at localhost and at a
 * deployed URL without rebuilding.
 */
export const authClient = createAuthClient();

export const { signIn, signOut, signUp, useSession } = authClient;
