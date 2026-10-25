// A fresh in-process Postgres (PGlite) with the real migrations applied, so
// database tests never touch Neon.
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "../../lib/db";
import * as schema from "../../lib/db/schema";

export async function testDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.join(__dirname, "..", "..", "drizzle") });
  return { db: db as unknown as Db, close: () => client.close() };
}
