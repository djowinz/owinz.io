// Migrations live in drizzle/ and are generated from lib/db/schema.ts:
//   pnpm db:generate   write a migration for schema changes
//   pnpm db:migrate    apply pending migrations (runs before every build)
import { defineConfig } from "drizzle-kit";
import { databaseUrl } from "./lib/db/url";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // Generating needs no database; migrating uses the unpooled connection.
  dbCredentials: {
    get url() {
      return databaseUrl("OWINZ_IO_DATABASE_URL_UNPOOLED");
    },
  },
  strict: true,
});
