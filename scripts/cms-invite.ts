// Invites someone to the CMS from the command line; mainly for the very
// first editor, before anyone can use /admin/users.
//
//   pnpm cms:invite you@example.com editor
import { getDb } from "../lib/db";
import { invites, users } from "../lib/db/schema";
import { isRole, ROLES } from "../lib/cms/permissions";
import { normalizeEmail } from "../lib/cms/users";
import { eq } from "drizzle-orm";

async function main() {
  const [rawEmail, role = "editor"] = process.argv.slice(2);
  if (!rawEmail || !isRole(role)) {
    console.error(`usage: pnpm cms:invite <email> [${ROLES.join("|")}]`);
    process.exit(1);
  }
  const email = normalizeEmail(rawEmail);
  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) {
    await db.update(users).set({ role }).where(eq(users.id, existing.id));
    console.log(`${email} already has an account; role set to ${role}.`);
  } else {
    await db.insert(invites).values({ email, role }).onConflictDoUpdate({ target: invites.email, set: { role } });
    console.log(`Invited ${email} as ${role}. They can now sign in at /admin/login.`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
