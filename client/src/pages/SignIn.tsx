import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { Loader2, LockKeyhole, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Toaster, toast } from "sonner";

export default function SignIn() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const login = trpc.auth.login.useMutation();
  const createDemo = trpc.demo.create.useMutation();

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    if (user) {
      window.location.href = "/app";
    }
  }, [user]);

  const submit = async (signInEmail: string, signInName?: string) => {
    try {
      await login.mutateAsync({ email: signInEmail, name: signInName });
      await utils.invalidate();
      window.location.href = "/app";
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Sign in failed — try again.",
      );
    }
  };

  /**
   * One click → a fresh demo workspace: unique account, three synthetic
   * documents seeded and processing immediately. Every visitor gets their own
   * clean queue (no shared state between judges).
   */
  const openDemoWorkspace = async () => {
    const suffix = Math.random().toString(36).slice(2, 10);
    try {
      await login.mutateAsync({
        email: `demo-${suffix}@triage.example`,
        name: "Alex Rivera",
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not open the demo workspace.",
      );
      return;
    }

    try {
      await createDemo.mutateAsync();
      toast.success("Demo workspace ready — three documents are processing");
    } catch {
      // Seeding is best-effort; the workspace works regardless.
    }

    await utils.invalidate();
    window.location.href = "/app";
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f8f5] px-4 text-[#192521]">
      <Toaster richColors position="top-center" />
      <div className="w-full max-w-[420px]">
        <div className="flex items-center gap-3 px-2 pb-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[#263f35] text-[#f7f8f5] shadow-[0_6px_14px_rgba(38,63,53,0.18)]">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[17px] font-semibold tracking-[-0.02em]">triage</div>
            <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#8a9690]">
              life admin, reduced
            </div>
          </div>
        </div>

        <div className="rounded-[16px] border border-[#e6ebe5] bg-white p-6 shadow-[0_7px_20px_rgba(35,55,43,0.035)]">
          <h1 className="text-[22px] font-semibold tracking-[-0.03em] text-[#1c2a24]">
            Sign in
          </h1>
          <p className="mt-1.5 text-[13px] leading-5 text-[#77847c]">
            Your documents, decisions, and drafts stay scoped to this account.
          </p>

          <form
            className="mt-6 space-y-3"
            onSubmit={event => {
              event.preventDefault();
              void submit(email, name || undefined);
            }}
          >
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#89958e]">
                Email
              </label>
              <Input
                type="email"
                required
                value={email}
                onChange={event => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="h-10 rounded-[10px] border-[#e3e8e2] bg-[#fbfcfa] text-[13px]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#89958e]">
                Name <span className="font-normal normal-case tracking-normal text-[#a9b3ac]">(optional)</span>
              </label>
              <Input
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="How should Triage greet you?"
                className="h-10 rounded-[10px] border-[#e3e8e2] bg-[#fbfcfa] text-[13px]"
              />
            </div>
            <Button
              type="submit"
              disabled={login.isPending || email.length === 0}
              className="h-10 w-full rounded-[10px] bg-[#263f35] text-[13px] font-semibold hover:bg-[#1e332b]"
            >
              {login.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Continue
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-[0.14em] text-[#b3bdb6]">
            <div className="h-px flex-1 bg-[#eef1ee]" />
            or
            <div className="h-px flex-1 bg-[#eef1ee]" />
          </div>

          <Button
            variant="outline"
            onClick={() => void openDemoWorkspace()}
            disabled={login.isPending || createDemo.isPending}
            className="h-10 w-full rounded-[10px] border-[#dce5dd] bg-[#f4f9f5] text-[13px] font-semibold text-[#2b5845] hover:bg-[#eaf3ec]"
          >
            {(login.isPending || createDemo.isPending) && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Open a demo workspace
          </Button>
          <p className="mt-2 text-center text-[10.5px] text-[#a9b3ac]">
            Fresh workspace with three sample documents, processing in about a
            minute.
          </p>

          <div className="mt-6 flex items-start gap-2 rounded-[10px] bg-[#f8faf7] p-3 text-[11px] leading-5 text-[#8a968e]">
            <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#7ca289]" />
            <span>
              Email sign-in is a lightweight identity boundary for this MVP.
              Nothing is sent to anyone, ever, without your explicit approval.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
