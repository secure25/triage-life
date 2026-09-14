import type { User } from "../../drizzle/schema";
import type { TrpcContext } from "../_core/context";
import { getRepository } from "../repository";

/**
 * Router-level test helpers. Tests run against the process-wide repository,
 * which (per the test setup file) is an in-memory store with no DATABASE_URL.
 */

export function makeContext(user: User | null): TrpcContext {
  return {
    user,
    repo: getRepository(),
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      cookie: () => undefined,
      clearCookie: () => undefined,
    } as unknown as TrpcContext["res"],
  };
}

export async function createUser(
  repo: TrpcContext["repo"],
  email: string,
  name = "Test User",
): Promise<User> {
  return repo.upsertUser({
    openId: `email:${email}`,
    email,
    name,
    loginMethod: "email",
  });
}

export async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs = 15_000,
  intervalMs = 50,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}
