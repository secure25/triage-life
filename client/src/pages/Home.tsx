import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Loader2,
  LockKeyhole,
  MoreHorizontal,
  Paperclip,
  Plus,
  Search,
  Send,
  Settings2,
  Sparkles,
  TimerReset,
  UserRound,
  X,
  Zap,
} from "lucide-react";

const navItems = [
  { label: "Overview", icon: LayoutDashboard, active: true },
  { label: "Inbox", icon: Inbox, count: 3 },
  { label: "Decisions", icon: ListChecks, count: 2 },
  { label: "Timeline", icon: TimerReset },
];

const toneByUrgency: Record<string, string> = {
  high: "bg-[#fff0e8] text-[#c45322]",
  medium: "bg-[#fff8de] text-[#9b7311]",
  low: "bg-[#e8f6ef] text-[#34855b]",
};

export default function Home() {
  const { data, isLoading } = trpc.triage.snapshot.useQuery();
  const approveAction = trpc.triage.approveAction.useMutation();
  const requestProcessing = trpc.triage.requestProcessing.useMutation();
  const [selectedId, setSelectedId] = useState("doc-insurance");
  const [approved, setApproved] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const selectedDocument = useMemo(
    () => data?.documents.find(document => document.id === selectedId) ?? data?.documents[0],
    [data, selectedId],
  );

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3400);
  };

  const handleApprove = async () => {
    if (!selectedDocument) return;
    await approveAction.mutateAsync({ documentId: selectedDocument.id });
    setApproved(true);
    showToast("Draft approved · queued for sending");
  };

  const handleScan = async () => {
    setIsScanning(true);
    await requestProcessing.mutateAsync();
    window.setTimeout(() => {
      setIsScanning(false);
      showToast("Inbox scan complete · 3 obligations found");
    }, 900);
  };

  if (isLoading || !data || !selectedDocument) {
    return (
      <div className="min-h-screen bg-[#f7f8f5] flex items-center justify-center text-[#64706b]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading your quiet admin desk…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f8f5] text-[#192521]">
      <aside className="fixed inset-y-0 left-0 hidden w-[242px] flex-col border-r border-[#e3e8e2] bg-[#fbfcfa] px-5 py-6 lg:flex">
        <div className="flex items-center gap-3 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[#263f35] text-[#f7f8f5] shadow-[0_6px_14px_rgba(38,63,53,0.18)]">
            <Sparkles className="h-[18px] w-[18px]" />
          </div>
          <div>
            <div className="text-[15px] font-semibold tracking-[-0.02em]">triage</div>
            <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#8a9690]">life admin, reduced</div>
          </div>
        </div>

        <div className="mt-10 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a0aaa4]">Workspace</div>
        <nav className="mt-3 space-y-1">
          {navItems.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                className={`group flex w-full items-center justify-between rounded-[11px] px-3 py-2.5 text-left text-[13px] transition ${item.active ? "bg-[#e9f1eb] font-semibold text-[#2b5845]" : "text-[#69756f] hover:bg-[#f0f4ef] hover:text-[#263f35]"}`}
              >
                <span className="flex items-center gap-3"><Icon className="h-[17px] w-[17px]" />{item.label}</span>
                {item.count && <span className={`rounded-full px-2 py-0.5 text-[10px] ${item.active ? "bg-[#d1e5d7] text-[#2b5845]" : "bg-[#eef1ee] text-[#89948d]"}`}>{item.count}</span>}
              </button>
            );
          })}
        </nav>

        <div className="mt-8 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a0aaa4]">Your system</div>
        <nav className="mt-3 space-y-1">
          <button className="flex w-full items-center gap-3 rounded-[11px] px-3 py-2.5 text-left text-[13px] text-[#69756f] transition hover:bg-[#f0f4ef] hover:text-[#263f35]"><FileText className="h-[17px] w-[17px]" />Documents</button>
          <button className="flex w-full items-center gap-3 rounded-[11px] px-3 py-2.5 text-left text-[13px] text-[#69756f] transition hover:bg-[#f0f4ef] hover:text-[#263f35]"><Settings2 className="h-[17px] w-[17px]" />Preferences</button>
        </nav>

        <div className="mt-auto rounded-[16px] bg-[#eef5ef] p-4">
          <div className="flex items-start justify-between">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#d4e7d9] text-[#2b6849]"><Zap className="h-3.5 w-3.5" /></div>
            <span className="rounded-full bg-white/75 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#6b8973]">Quiet mode</span>
          </div>
          <p className="mt-4 text-[12px] font-medium leading-5 text-[#355744]">Triage works in the background and only interrupts when a human decision is needed.</p>
        </div>
      </aside>

      <main className="min-h-screen lg:pl-[242px]">
        <header className="flex h-[72px] items-center justify-between border-b border-[#e3e8e2] bg-[#fbfcfa]/80 px-5 backdrop-blur md:px-9">
          <div className="flex items-center gap-2 text-[13px] text-[#839089]"><span className="font-semibold text-[#34483e]">Overview</span><ChevronRight className="h-3.5 w-3.5" /><span>Monday, September 14</span></div>
          <div className="flex items-center gap-3">
            <button className="hidden items-center gap-2 rounded-[9px] border border-[#e3e8e2] bg-white px-3 py-2 text-[12px] text-[#748078] shadow-sm md:flex"><Search className="h-3.5 w-3.5" /> Search</button>
            <button onClick={handleScan} className="flex items-center gap-2 rounded-[9px] bg-[#263f35] px-3.5 py-2 text-[12px] font-semibold text-white shadow-[0_5px_12px_rgba(38,63,53,0.16)] transition hover:bg-[#1e332b] active:scale-[0.98]">
              {isScanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}{isScanning ? "Scanning…" : "Process inbox"}
            </button>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#d9e9dd] text-[#3c6750]"><UserRound className="h-4 w-4" /></div>
          </div>
        </header>

        <div className="mx-auto max-w-[1440px] px-5 py-7 md:px-9 md:py-9">
          <section className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#eaf3ec] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#4f7e5e]"><span className="h-1.5 w-1.5 rounded-full bg-[#65a274]" /> Agent is on</div>
              <h1 className="text-[32px] font-semibold tracking-[-0.045em] text-[#1c2a24] md:text-[38px]">Good morning, Alex<span className="text-[#b2c9b8]">.</span></h1>
              <p className="mt-2 max-w-[540px] text-[14px] leading-6 text-[#77847c]">Your admin is under control. I found a couple of things that need a human decision.</p>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-[#829087]"><LockKeyhole className="h-3.5 w-3.5" /> Nothing is sent without your approval</div>
          </section>

          <section className="mt-8 grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[
              ["Open items", data.metrics.open, "across 3 documents", "#eaf3ec", "#3d7353"],
              ["Due this week", data.metrics.dueSoon, "one needs your input", "#fff6dd", "#a47720"],
              ["Waiting on you", data.metrics.waiting, "a quick detail", "#f9eae5", "#b55f3f"],
              ["Time reclaimed", data.metrics.saved, "this month", "#edf0f6", "#52627e"],
            ].map(([label, value, detail, bg, color]) => (
              <div key={label} className="rounded-[16px] border border-[#e6ebe5] bg-white p-4 shadow-[0_5px_16px_rgba(35,55,43,0.035)] md:p-5">
                <div className="text-[11px] font-medium text-[#89958e]">{label}</div>
                <div className="mt-2 text-[26px] font-semibold tracking-[-0.04em]" style={{ color: String(color) }}>{value}</div>
                <div className="mt-1 text-[11px] text-[#9ba69f]">{detail}</div>
              </div>
            ))}
          </section>

          <div className="mt-7 grid gap-7 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.8fr)]">
            <section>
              <div className="mb-3 flex items-center justify-between"><div><h2 className="text-[16px] font-semibold tracking-[-0.02em] text-[#26352d]">Your decision queue</h2><p className="mt-1 text-[12px] text-[#96a19b]">The small number of things only you can decide.</p></div><button className="text-[11px] font-semibold text-[#5b8065] hover:text-[#2b5845]">View all <ArrowUpRight className="ml-1 inline h-3.5 w-3.5" /></button></div>
              <div className="overflow-hidden rounded-[16px] border border-[#e5eae4] bg-white shadow-[0_7px_20px_rgba(35,55,43,0.035)]">
                {data.documents.map((document, index) => (
                  <button key={document.id} onClick={() => { setSelectedId(document.id); setApproved(false); }} className={`flex w-full items-start gap-4 border-b border-[#edf0ec] p-4 text-left transition last:border-0 hover:bg-[#fbfcfa] md:p-5 ${selectedId === document.id ? "bg-[#fbfcfa]" : ""}`}>
                    <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${document.type === "Insurance" ? "bg-[#fff0e8] text-[#c45322]" : document.type === "Family" ? "bg-[#fff8de] text-[#a27a17]" : "bg-[#e8f6ef] text-[#43805c]"}`}><FileText className="h-4 w-4" /></div>
                    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-[13px] font-semibold text-[#33443b]">{document.title}</span><span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${toneByUrgency[document.urgency]}`}>{document.status}</span></div><div className="mt-1 text-[11px] text-[#919c95]">{document.sender} · {document.date}</div><p className="mt-2 max-w-[620px] text-[12px] leading-5 text-[#6e7b73]">{document.summary}</p></div>
                    <div className="hidden shrink-0 text-right md:block"><div className="text-[11px] font-semibold text-[#65736a]">{document.due}</div><div className="mt-1 text-[10px] text-[#a0aaa4]">due date</div></div>
                    <ChevronRight className={`mt-2 h-4 w-4 shrink-0 transition ${selectedId === document.id ? "text-[#598067]" : "text-[#c1cbc3]"}`} />
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-[16px] border border-[#e5eae4] bg-white shadow-[0_7px_20px_rgba(35,55,43,0.035)]">
              <div className="flex items-start justify-between border-b border-[#edf0ec] p-5"><div><div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#eaf3ec] text-[#4d855f]"><Sparkles className="h-3.5 w-3.5" /></span><h2 className="text-[14px] font-semibold text-[#33443b]">Agent brief</h2></div><p className="mt-2 text-[11px] text-[#9aa49e]">What Triage found in this item</p></div><button className="text-[#9ca9a1]"><MoreHorizontal className="h-4 w-4" /></button></div>
              <div className="p-5">
                <div className="flex items-start justify-between gap-4"><div><div className="text-[16px] font-semibold tracking-[-0.025em] text-[#26372e]">{selectedDocument.title}</div><div className="mt-1 text-[11px] text-[#8a968e]">{selectedDocument.sender} · {selectedDocument.due}</div></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${toneByUrgency[selectedDocument.urgency]}`}>{selectedDocument.urgency === "high" ? "Needs decision" : selectedDocument.status}</span></div>
                <div className="mt-5 space-y-3 rounded-[12px] bg-[#f8faf7] p-3.5">{selectedDocument.extracted.map(([key, value]) => <div key={key} className="flex gap-3 text-[11px]"><span className="w-[92px] shrink-0 font-medium text-[#99a39d]">{key}</span><span className="font-medium text-[#4f5f55]">{value}</span></div>)}</div>
                {selectedDocument.id === "doc-insurance" && !approved ? <>
                  <div className="mt-5 flex items-center gap-2 text-[11px] font-semibold text-[#c05d36]"><AlertCircle className="h-3.5 w-3.5" /> Your input is needed</div>
                  <p className="mt-2 text-[12px] leading-5 text-[#738078]">I drafted a clarification email so you can ask for alternatives before committing to the new premium.</p>
                  <div className="mt-4 rounded-[12px] border border-[#ecefea] bg-white p-3.5 text-[11px] leading-5 text-[#637169] shadow-inner"><div className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.12em] text-[#a1aba4]"><span>Draft reply</span><Paperclip className="h-3.5 w-3.5" /></div><div className="whitespace-pre-line">{selectedDocument.draft}</div></div>
                  <div className="mt-4 flex gap-2"><button onClick={handleApprove} disabled={approveAction.isPending} className="flex flex-1 items-center justify-center gap-2 rounded-[9px] bg-[#2f6d4d] px-3 py-2.5 text-[11px] font-semibold text-white transition hover:bg-[#275d41] active:scale-[0.98] disabled:opacity-60">{approveAction.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Approve & queue</button><button className="flex h-9 w-9 items-center justify-center rounded-[9px] border border-[#e4e9e3] text-[#94a099] transition hover:bg-[#f7f9f6]"><X className="h-3.5 w-3.5" /></button></div>
                </> : <div className="mt-5 rounded-[12px] bg-[#edf7ef] p-3.5"><div className="flex items-center gap-2 text-[11px] font-semibold text-[#3a8056]"><CheckCircle2 className="h-4 w-4" /> {approved ? "Approved and queued" : "No action needed from you"}</div><p className="mt-1.5 text-[11px] leading-5 text-[#75917d]">{approved ? "The draft is ready to send. Triage will never send without your explicit approval." : selectedDocument.draft}</p></div>}
                <div className="mt-5 flex items-center gap-2 border-t border-[#edf0ec] pt-4 text-[10px] text-[#98a39c]"><LockKeyhole className="h-3 w-3" /> Approval required before any external action</div>
              </div>
            </section>
          </div>

          <section className="mt-7 grid gap-7 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.8fr)]">
            <div className="rounded-[16px] border border-[#e5eae4] bg-white p-5 shadow-[0_7px_20px_rgba(35,55,43,0.035)]"><div className="flex items-center justify-between"><div><h2 className="text-[14px] font-semibold text-[#33443b]">Today’s timeline</h2><p className="mt-1 text-[11px] text-[#9aa49e]">A transparent record of work done on your behalf.</p></div><button className="text-[11px] font-semibold text-[#5b8065]">Open timeline</button></div><div className="mt-5 grid gap-4 sm:grid-cols-2">{data.activity.map((item, index) => <div key={item.time + item.label} className="flex gap-3"><div className="flex flex-col items-center"><div className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full ${index === 0 ? "bg-[#dceee0] text-[#43815a]" : "bg-[#f1f4f0] text-[#8e9c92]"}`}>{index === 1 ? <AlertCircle className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}</div>{index < data.activity.length - 2 && <div className="mt-1 h-full w-px bg-[#e9eee9]" />}</div><div><div className="text-[11px] font-semibold text-[#53635a]">{item.label}</div><div className="mt-1 text-[10px] text-[#99a39d]">{item.detail} · {item.time}</div></div></div>)}</div></div>
            <div className="rounded-[16px] bg-[#263f35] p-5 text-[#f5faf5] shadow-[0_9px_22px_rgba(38,63,53,0.13)]"><div className="flex items-center justify-between"><div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-white/10"><Clock3 className="h-4 w-4 text-[#b3d1b9]" /></div><span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#91b09a]">Your week</span></div><div className="mt-7 text-[27px] font-semibold tracking-[-0.04em]">2h 18m</div><p className="mt-1 text-[12px] leading-5 text-[#b9ccc0]">estimated time Triage has reclaimed this month</p><div className="mt-7 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full w-[68%] rounded-full bg-[#9fc6a5]" /></div><div className="mt-2 flex justify-between text-[10px] text-[#94b09c]"><span>8 completed tasks</span><span>68% of weekly goal</span></div></div>
          </section>

          <footer className="mt-8 flex flex-col justify-between gap-3 border-t border-[#e4e9e3] pt-5 text-[10px] text-[#9aa59e] md:flex-row"><span>triage v0.1 · built for the Agents for Humans hackathon</span><span className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-[#6aa477]" /> Synthetic demo data · no real messages sent</span></footer>
        </div>
      </main>
      {toast && <div className="fixed bottom-5 right-5 z-20 flex items-center gap-2 rounded-[11px] bg-[#263f35] px-4 py-3 text-[12px] font-medium text-white shadow-[0_12px_28px_rgba(38,63,53,0.23)]"><CheckCircle2 className="h-4 w-4 text-[#a9d2ae]" />{toast}</div>}
    </div>
  );
}
