import { oauthProvider } from "@better-auth/oauth-provider";
import { MCP_SEARCH_SCOPE } from "@rag/contracts";
import { getDb, loadRootEnv, schema } from "@rag/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { jwt } from "better-auth/plugins";

// Next.js loads `.env` from the app directory, which in a monorepo is not
// where the file lives. Loading it here makes this package work the same from
// `next build`, the MCP server, and the seed script.
loadRootEnv();

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Copy .env.example to .env and fill it in.`);
  }
  return value;
};

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

/** Issuer for tokens this server mints. The MCP resource server verifies against it. */
export const AUTH_ISSUER = `${baseURL}/api/auth`;
export const JWKS_URL = `${AUTH_ISSUER}/jwks`;

/**
 * The authorization server.
 *
 * `oauthProvider` turns this app into an OAuth 2.1 / OIDC provider so an MCP
 * client can obtain a token for the MCP server through a standard authorization
 * code + PKCE flow. It supersedes Better Auth's older `mcp()` plugin, which no
 * longer ships a server-side export in 1.6.x.
 */
export const auth = betterAuth({
  baseURL,
  secret: requireEnv("BETTER_AUTH_SECRET"),
  database: drizzleAdapter(getDb(), {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    // This build seeds accounts rather than sending mail; there is no SMTP
    // provider configured, so verification is off by design, not by omission.
    requireEmailVerification: false,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: true,
        defaultValue: "user",
        // Never settable from a sign-up payload — role changes go through the
        // admin API, which checks the caller is an admin first.
        input: false,
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 60,
  },
  plugins: [
    // Signs access tokens as JWTs and publishes the JWKS the MCP server
    // verifies against, so the resource server needs no shared secret.
    jwt(),
    oauthProvider({
      loginPage: "/sign-in",
      consentPage: "/consent",
      // RFC 7591. MCP clients register themselves at connect time rather than
      // being pre-provisioned, which is what makes "just point Inspector at it"
      // work.
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      scopes: [MCP_SEARCH_SCOPE],
    }),
  ],
});

export type Session = typeof auth.$Infer.Session;
export type AuthUser = Session["user"];
