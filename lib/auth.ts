// CMS sign-in (Better Auth). Sign-in is GitHub-only and invite-only: an
// account is created only for an email with an invite (lib/cms/users.ts),
// which also sets the account's role. Signing in is all this grants;
// authorization happens per action in lib/cms/session.ts + permissions.ts.
//
// Environment:
//   BETTER_AUTH_SECRET                  session signing key (`openssl rand -base64 32`)
//   GITHUB_CLIENT_ID / _SECRET          GitHub OAuth app for this environment
//   OWINZ_IO_DEV_LOGIN=1                `pnpm dev` against local Postgres only: sign in
//                                       with a link printed to the terminal (no GitHub)
import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins/magic-link";
import { getDb } from "./db";
import { accounts, sessions, users, verifications } from "./db/schema";
import { databaseUrl } from "./db/url";
import { admissionRole, displayName, markInviteAccepted } from "./cms/users";
import { SITE } from "./site";

function baseURL(): string {
  if (process.env.VERCEL_ENV === "production") return SITE.url;
  if (process.env.VERCEL_BRANCH_URL) return `https://${process.env.VERCEL_BRANCH_URL}`;
  return process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
}

/**
 * Email-link sign-in for local development only. Every condition must hold,
 * so a stray environment variable can't enable it on a deployment.
 */
export function devLoginEnabled(): boolean {
  if (process.env.OWINZ_IO_DEV_LOGIN !== "1") return false;
  if (process.env.NODE_ENV === "production") return false; // `pnpm dev` only
  if (process.env.VERCEL) return false;
  try {
    return /@(localhost|127\.0\.0\.1)[:/]/.test(databaseUrl());
  } catch {
    return false;
  }
}

export const auth = betterAuth({
  baseURL: baseURL(),
  basePath: "/api/auth",
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(getDb(), {
    provider: "pg",
    schema: { user: users, session: sessions, account: accounts, verification: verifications },
  }),
  user: {
    additionalFields: {
      role: { type: "string", required: false, input: false, defaultValue: "contributor" },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 14, // two weeks
    updateAge: 60 * 60 * 24, // refreshed at most daily
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Returning false refuses the account; Better Auth then sends the
        // person back to the sign-in page with an error code, which
        // app/admin/login explains.
        before: async (user) => {
          const role = await admissionRole(getDb(), user.email);
          if (!role) return false;
          // Email-link accounts arrive without a name; GitHub supplies one.
          return { data: { ...user, name: user.name?.trim() || displayName(user.email), role } };
        },
        after: async (user) => {
          await markInviteAccepted(getDb(), user.email);
        },
      },
    },
  },
  plugins: [
    ...(devLoginEnabled()
      ? [
          magicLink({
            disableSignUp: false, // still gated by the invite check above
            sendMagicLink: ({ email, url }) => {
              console.log(`\n[dev login] Sign-in link for ${email}:\n${url}\n`);
            },
          }),
        ]
      : []),
    nextCookies(), // must stay last
  ],
});
