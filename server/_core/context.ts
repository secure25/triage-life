import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { authenticateRequest } from "../auth";
import { getRepository, type TriageRepository } from "../repository";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  repo: TriageRepository;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  const repo = getRepository();

  let user: User | null = null;
  try {
    user = await authenticateRequest(opts.req, repo);
  } catch {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    repo,
  };
}
