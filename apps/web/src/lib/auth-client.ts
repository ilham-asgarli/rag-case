"use client";

import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { createAuthClient } from "better-auth/react";

/**
 * No baseURL: the client calls the origin it was served from.
 *
 * Pinning it to an env var would bake the origin into the browser bundle at
 * build time, so the same image could not be run at localhost and at a
 * deployed URL without rebuilding.
 *
 * `oauthProviderClient` attaches the signed authorization query from the current
 * page to outgoing requests. The authorization server signs the parameters it
 * hands to `/consent`, and the consent endpoint verifies that signature to
 * recover which request is being approved — a plain `fetch` omits it and is
 * rejected as `invalid_signature`.
 */
export const authClient = createAuthClient({ plugins: [oauthProviderClient()] });

export const { signIn, signOut, signUp, useSession } = authClient;
