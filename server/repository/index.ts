import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { ENV } from "../_core/env";
import { DrizzleTriageRepository } from "./drizzle";
import { MemoryTriageRepository } from "./memory";
import type { TriageRepository } from "./types";

export type { TriageRepository, ObligationFilters, QueueMetrics } from "./types";
export { MemoryTriageRepository, DrizzleTriageRepository };

let _db: NodePgDatabase | null = null;
let _repo: TriageRepository | null = null;

/** Drizzle instance backed by the configured PostgreSQL database, or null. */
export function getDb(): NodePgDatabase | null {
  if (_db) return _db;
  if (!ENV.databaseUrl) return null;

  const pool = new pg.Pool({
    connectionString: ENV.databaseUrl,
    max: 5,
  });
  _db = drizzle(pool);
  return _db;
}

/**
 * Process-wide repository. Uses PostgreSQL when DATABASE_URL is configured;
 * otherwise falls back to an in-memory store so the project runs without
 * infrastructure (data resets on restart — demo/local use only).
 */
export function getRepository(): TriageRepository {
  if (_repo) return _repo;

  const db = getDb();
  if (db) {
    _repo = new DrizzleTriageRepository(db);
  } else {
    console.warn(
      "[Database] DATABASE_URL not configured — using in-memory store. " +
        "Data will not persist across restarts.",
    );
    _repo = new MemoryTriageRepository();
  }
  return _repo;
}
