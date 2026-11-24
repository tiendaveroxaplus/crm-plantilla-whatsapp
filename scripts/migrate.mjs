import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL no está configurada.");
  process.exit(1);
}

const sql = postgres(connectionString, { max: 1 });
const migrationDir = path.resolve("db/migrations");

try {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
  const applied = new Set((await sql`SELECT name FROM schema_migrations`).map((row) => row.name));
  const files = (await readdir(migrationDir)).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const migration = await readFile(path.join(migrationDir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(migration);
      await tx`INSERT INTO schema_migrations (name) VALUES (${file})`;
    });
    console.log(`Migración aplicada: ${file}`);
  }
} finally {
  await sql.end({ timeout: 5 });
}
