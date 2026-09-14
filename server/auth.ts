import { randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import type { User } from "../drizzle/schema";
import { BadRequestError } from "@shared/_core/errors";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ENV } from "./_core/env";
import type { TriageRepository } from "./repository";

const DEV_SECRET = "triage-life-dev-secret-do-not-use-in-production";

let warnedAboutSecret = false;
let bootSecret: Uint8Array | null = null;

function getSecretKey(): Uint8Array {
  if (ENV.cookieSecret) {
    return new TextEncoder().encode(ENV.cookieSecret);
  }

  if (ENV.isProduction) {
    // Never take sign-in down over a missing secret: fall back to a random
    // per-boot key. Sessions reset on restart, but the platform stays usable.
    if (!bootSecret) {
      console.error(
        "[Auth] JWT_SECRET is not configured — using a random per-boot secret. " +
          "Sessions will not survive restarts. Set JWT_SECRET for durable sessions.",
      );
      bootSecret = new TextEncoder().encode(`${randomUUID()}${randomUUID()}`);
    }
    return bootSecret;
  }

  if (!warnedAboutSecret) {
    console.warn(
      "[Auth] JWT_SECRET not set — using a development-only secret. " +
        "Sessions are not durable across restarts and this must never run in production.",
    );
    warnedAboutSecret = true;
  }
  return new TextEncoder().encode(DEV_SECRET);
}

export type SessionPayload = {
  openId: string;
  name: string;
};

export async function signSession(user: {
  openId: string;
  name: string | null;
}): Promise<string> {
  return new SignJWT({ openId: user.openId, name: user.name ?? "" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + ONE_YEAR_MS) / 1000))
    .sign(getSecretKey());
}

export async function verifySessionToken(
  token: string | undefined | null,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ["HS256"],
    });
    const { openId, name } = payload as Record<string, unknown>;
    if (typeof openId !== "string" || openId.length === 0) return null;
    return { openId, name: typeof name === "string" ? name : "" };
  } catch {
    return null;
  }
}

function extractSessionToken(req: Request): string | undefined {
  const cookies = parseCookieHeader(req.headers.cookie ?? "");
  if (cookies[COOKIE_NAME]) return cookies[COOKIE_NAME];

  // Bearer fallback for clients where cookies are unavailable.
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return undefined;
}

/** Resolve the signed-in user for a request, or null. Never throws. */
export async function authenticateRequest(
  req: Request,
  repo: TriageRepository,
): Promise<User | null> {
  try {
    const session = await verifySessionToken(extractSessionToken(req));
    if (!session) return null;
    const user = await repo.getUserByOpenId(session.openId);
    return user ?? null;
  } catch {
    return null;
  }
}

export function emailToOpenId(email: string): string {
  return `email:${email.trim().toLowerCase()}`;
}

export type LoginResult = {
  user: User;
  token: string;
};

/**
 * Email sign-in. Creates the account on first use. There is no password:
 * this is a local/demo-friendly identity boundary, not a production auth
 * system — production deployments should put real authentication in front.
 */
export async function loginWithEmail(
  repo: TriageRepository,
  input: { email: string; name?: string },
): Promise<LoginResult> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw BadRequestError("Please enter a valid email address");
  }

  const fallbackName = email.split("@")[0] ?? email;
  const user = await repo.upsertUser({
    openId: emailToOpenId(email),
    email,
    name: input.name?.trim() || fallbackName,
    loginMethod: "email",
    lastSignedIn: new Date(),
  });

  const token = await signSession(user);
  return { user, token };
}
