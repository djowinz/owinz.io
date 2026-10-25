// Database access. Neon is reached over HTTP (no connection pool to manage
// in serverless functions); a local Postgres (docker compose) over a normal
// TCP pool. Tests swap in an in-process PGlite database with setDb().
import { neon } from "@neondatabase/serverless";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { databaseUrl } from "./url";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

let instance: Db | undefined;

const isLocal = (url: string) => /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);

export function getDb(): Db {
  if (!instance) {
    const url = databaseUrl();
    instance = (
      isLocal(url)
        ? drizzlePg(new Pool({ connectionString: url, max: 5 }), { schema })
        : drizzleNeon(neon(url), { schema })
    ) as unknown as Db;
  }
  return instance;
}

/** Test hook: point the content layer at another database. */
export function setDb(db: Db | undefined): void {
  instance = db;
}

export { databaseUrl, schema };
