// Connection strings come from the Vercel ↔ Neon integration, which
// prefixes every variable with OWINZ_IO_.
export function databaseUrl(name = "OWINZ_IO_DATABASE_URL"): string {
  const url = process.env[name];
  if (!url || !/^postgres(ql)?:\/\//.test(url)) {
    throw new Error(
      `${name} is ${url ? "not a postgres:// URL" : "not set"}. ` +
        "Vercel can't download Sensitive variables (`vercel env pull` writes a placeholder), " +
        "so for local development paste a Neon connection string into .env.local. See README → CMS.",
    );
  }
  return url;
}
