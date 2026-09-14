import { describe, expect, it, vi } from "vitest";
import { COOKIE_NAME } from "@shared/const";
import { appRouter } from "../routers";
import { makeContext } from "./helpers";

function createCaller(ctx: ReturnType<typeof makeContext>) {
  return appRouter.createCaller(ctx);
}

describe("auth (router)", () => {
  it("me returns null when not signed in", async () => {
    const caller = createCaller(makeContext(null));
    expect(await caller.auth.me()).toBeNull();
  });

  it("login creates the user, sets a session cookie, and audits the sign-in", async () => {
    const ctx = makeContext(null);
    const cookie = vi.fn();
    ctx.res.cookie = cookie;
    const caller = createCaller(ctx);

    const user = await caller.auth.login({
      email: "Auth@Test.example",
      name: "Auth Tester",
    });

    expect(user.email).toBe("auth@test.example");
    expect(user.name).toBe("Auth Tester");
    expect(user.openId).toBe("email:auth@test.example");
    expect(cookie).toHaveBeenCalledTimes(1);
    expect(cookie.mock.calls[0]![0]).toBe(COOKIE_NAME);

    const signedIn = createCaller(makeContext(user));
    expect((await signedIn.auth.me())?.id).toBe(user.id);

    const events = await ctx.repo.listAuditEvents(user.id, { limit: 10 });
    expect(events.some(event => event.eventType === "user_signed_in")).toBe(
      true,
    );
  });

  it("rejects invalid emails", async () => {
    const caller = createCaller(makeContext(null));
    await expect(
      caller.auth.login({ email: "not-an-email" }),
    ).rejects.toThrow(/valid email/i);
  });

  it("logout clears the session cookie", async () => {
    const ctx = makeContext(null);
    const clearCookie = vi.fn();
    ctx.res.clearCookie = clearCookie;
    const caller = createCaller(ctx);

    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(clearCookie).toHaveBeenCalledWith(
      COOKIE_NAME,
      expect.objectContaining({ httpOnly: true, path: "/" }),
    );
    // maxAge must NOT be passed: express deprecates it on clearCookie
    // (cleared cookies are expired automatically).
    const options = clearCookie.mock.calls[0]![1] as Record<string, unknown>;
    expect("maxAge" in options).toBe(false);
  });

  it("protected procedures reject anonymous callers", async () => {
    const caller = createCaller(makeContext(null));
    await expect(caller.documents.list({})).rejects.toThrow();
    await expect(caller.queue.list()).rejects.toThrow();
    await expect(caller.audit.list({})).rejects.toThrow();
  });
});
