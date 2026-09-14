import { defineConfig } from "drizzle-kit";

// Migrations must run over a DIRECT connection (no PgBouncer/-pooler host):
// DDL through Neon's transaction-mode pooler is unreliable. The app itself
// uses DATABASE_URL (the pooled string) at runtime.
const connectionString =
  process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is required to run drizzle commands (or DIRECT_DATABASE_URL)",
  );
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
