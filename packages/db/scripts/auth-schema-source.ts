/**
 * Codegen-only Better Auth config.
 *
 * `@better-auth/cli generate` reads this to emit the Drizzle tables its core
 * and its plugins require. It is intentionally separate from the real runtime
 * config in `auth.ts`: that one imports the generated schema, so using it here
 * would be circular. This file is never imported by application code.
 */
import { oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { jwt } from "better-auth/plugins";

export const auth = betterAuth({
  // The OAuth provider plugin builds its issuer URL at init, so a valid
  // absolute URL must be present even for codegen.
  baseURL: "http://localhost:3000",
  secret: "codegen-only-not-a-real-secret",
  database: drizzleAdapter({}, { provider: "pg" }),
  emailAndPassword: { enabled: true },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: true,
        defaultValue: "user",
        input: false,
      },
    },
  },
  plugins: [jwt(), oauthProvider({ loginPage: "/sign-in", consentPage: "/consent" })],
});
