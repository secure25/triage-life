import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/_core/hooks/useAuth";
import NotFound from "@/pages/NotFound";
import SignIn from "@/pages/SignIn";
import { Loader2 } from "lucide-react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DocumentDetail from "./pages/DocumentDetail";
import Documents from "./pages/Documents";
import Inbox from "./pages/Inbox";
import Overview from "./pages/Overview";
import Queue from "./pages/Queue";
import Timeline from "./pages/Timeline";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f8f5] text-[#64706b]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading your quiet
        admin desk…
      </div>
    );
  }

  if (!user) {
    window.location.href = "/signin";
    return null;
  }

  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/signin" component={SignIn} />
      <Route path="/">
        <RequireAuth>
          <Overview />
        </RequireAuth>
      </Route>
      <Route path="/inbox">
        <RequireAuth>
          <Inbox />
        </RequireAuth>
      </Route>
      <Route path="/queue">
        <RequireAuth>
          <Queue />
        </RequireAuth>
      </Route>
      <Route path="/documents">
        <RequireAuth>
          <Documents />
        </RequireAuth>
      </Route>
      <Route path="/documents/:id">
        {params => (
          <RequireAuth>
            <DocumentDetail documentId={params.id!} />
          </RequireAuth>
        )}
      </Route>
      <Route path="/timeline">
        <RequireAuth>
          <Timeline />
        </RequireAuth>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
