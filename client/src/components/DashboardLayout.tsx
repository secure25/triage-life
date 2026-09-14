import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { trpc } from "@/lib/trpc";
import {
  Clock3,
  FileText,
  Inbox,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Sparkles,
  UserRound,
  Zap,
} from "lucide-react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";

const navItems = [
  { label: "Overview", icon: LayoutDashboard, path: "/" },
  { label: "Inbox", icon: Inbox, path: "/inbox" },
  { label: "Decisions", icon: ListChecks, path: "/queue" },
  { label: "Documents", icon: FileText, path: "/documents" },
  { label: "Timeline", icon: Clock3, path: "/timeline" },
];

function BrandMark() {
  return (
    <div className="flex items-center gap-3 px-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[#263f35] text-[#f7f8f5] shadow-[0_6px_14px_rgba(38,63,53,0.18)]">
        <Sparkles className="h-[18px] w-[18px]" />
      </div>
      <div>
        <div className="text-[15px] font-semibold tracking-[-0.02em]">triage</div>
        <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#8a9690]">
          life admin, reduced
        </div>
      </div>
    </div>
  );
}

function QuietModeCard() {
  return (
    <div className="mt-auto rounded-[16px] bg-[#eef5ef] p-4">
      <div className="flex items-start justify-between">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#d4e7d9] text-[#2b6849]">
          <Zap className="h-3.5 w-3.5" />
        </div>
        <span className="rounded-full bg-white/75 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#6b8973]">
          Quiet mode
        </span>
      </div>
      <p className="mt-4 text-[12px] font-medium leading-5 text-[#355744]">
        Triage works in the background and only interrupts when a human decision
        is needed.
      </p>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [location] = useLocation();
  const { loading, user, logout } = useAuth();
  const queueQuery = trpc.queue.list.useQuery(undefined, {
    refetchInterval: 15_000,
  });

  const waitingCount =
    queueQuery.data?.filter(
      item =>
        item.obligation.status === "needs_decision" ||
        item.obligation.status === "waiting_for_info",
    ).length ?? 0;

  if (loading) {
    return <DashboardLayoutSkeleton />;
  }

  if (!user) {
    return null;
  }

  const nav = (
    <nav className="mt-3 space-y-1">
      {navItems.map(item => {
        const Icon = item.icon;
        const active =
          item.path === "/"
            ? location === "/"
            : location.startsWith(item.path);
        return (
          <a
            key={item.label}
            href={item.path}
            className={`group flex w-full items-center justify-between rounded-[11px] px-3 py-2.5 text-left text-[13px] transition ${
              active
                ? "bg-[#e9f1eb] font-semibold text-[#2b5845]"
                : "text-[#69756f] hover:bg-[#f0f4ef] hover:text-[#263f35]"
            }`}
          >
            <span className="flex items-center gap-3">
              <Icon className="h-[17px] w-[17px]" />
              {item.label}
            </span>
            {item.label === "Decisions" && waitingCount > 0 && (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] ${
                  active
                    ? "bg-[#d1e5d7] text-[#2b5845]"
                    : "bg-[#eef1ee] text-[#89948d]"
                }`}
              >
                {waitingCount}
              </span>
            )}
          </a>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-[#f7f8f5] text-[#192521]">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-10 hidden w-[242px] flex-col border-r border-[#e3e8e2] bg-[#fbfcfa] px-5 py-6 lg:flex">
        <BrandMark />
        <div className="mt-10 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a0aaa4]">
          Workspace
        </div>
        {nav}
        <div className="mt-8 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a0aaa4]">
          Signed in
        </div>
        <div className="mt-3 flex items-center gap-3 rounded-[11px] bg-white px-3 py-2.5 shadow-sm">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#d9e9dd] text-[#3c6750]">
            <UserRound className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] font-semibold text-[#33443b]">
              {user.name ?? user.email}
            </div>
            <div className="truncate text-[10px] text-[#98a39c]">{user.email}</div>
          </div>
          <button
            onClick={() => logout()}
            title="Sign out"
            className="text-[#9ca9a1] transition hover:text-[#b55f3f]"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
        <QuietModeCard />
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-[#e3e8e2] bg-[#fbfcfa]/95 px-4 py-3 backdrop-blur lg:hidden">
        <BrandMark />
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[260px] bg-[#fbfcfa] p-5">
            <SheetHeader className="p-0 text-left">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <BrandMark />
            </SheetHeader>
            <div className="mt-6 flex h-[calc(100%-120px)] flex-col">
              {nav}
              <QuietModeCard />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <main className="min-h-screen lg:pl-[242px]">{children}</main>
    </div>
  );
}
