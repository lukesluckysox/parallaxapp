import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { AuthProvider, useAuth } from "./lib/auth-context";
import CharacterApp from "./pages/CharacterApp";
import WritingPage from "./pages/WritingPage";
import SpotifyPage from "./pages/SpotifyPage";
import DecisionsPage from "./pages/DecisionsPage";
import DiscoverPage from "./pages/DiscoverPage";
import SignalsInsightsPage from "./pages/SignalsInsightsPage";
import SignalsPatternsPage from "./pages/SignalsPatternsPage";
import HealthPage from "./pages/HealthPage";
import TrajectoryPage from "./pages/TrajectoryPage";
import HelixPage from "./pages/HelixPage";
import HolisticPage from "./pages/HolisticPage";
import MirrorsPage from "./pages/MirrorsPage";
import AboutPage from "./pages/AboutPage";
import OraclePage from "./pages/OraclePage";
import AuthPage from "./pages/AuthPage";
import CalibrationPage from "./pages/CalibrationPage";
import WrappedPage from "./pages/WrappedPage";
import ProfilePage from "./pages/ProfilePage";
import LandingPage from "./pages/LandingPage";
import NotFound from "./pages/not-found";
import BottomNav from "./components/BottomNav";
import Onboarding from "./components/Onboarding";
import TopBar from "./components/TopBar";
import ErrorBoundary from "./components/ErrorBoundary";

function AppContent() {
  const { isAuthenticated, isLoading, justRegistered, clearOnboarding, user } = useAuth();
  const [showAuth, setShowAuth] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground/40 font-display">Parallax</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (!showAuth) {
      return (
        <Router hook={useHashLocation}>
          <Switch>
            <Route path="/about" component={AboutPage} />
            <Route>{() => <LandingPage onShowAuth={() => setShowAuth(true)} />}</Route>
          </Switch>
        </Router>
      );
    }
    return (
      <Router hook={useHashLocation}>
        <Switch>
          <Route path="/about" component={AboutPage} />
          <Route component={AuthPage} />
        </Switch>
      </Router>
    );
  }

  // New registrations only: calibration first, then onboarding tips
  if (justRegistered && user && !user.calibrated) {
    return <CalibrationPage />;
  }

  if (justRegistered) {
    return <Onboarding onComplete={clearOnboarding} />;
  }

  return (
    <Router hook={useHashLocation}>
      <TopBar />
      <Switch>
        <Route path="/" component={HolisticPage} />
        <Route path="/snapshot" component={CharacterApp} />
        <Route path="/mirrors" component={MirrorsPage} />
        <Route path="/mirrors/sonic" component={SpotifyPage} />
        <Route path="/mirrors/inner" component={WritingPage} />
        <Route path="/mirrors/body" component={HealthPage} />
        <Route path="/signals" component={DiscoverPage} />
        <Route path="/signals/insights" component={SignalsInsightsPage} />
        <Route path="/signals/patterns" component={SignalsPatternsPage} />
        <Route path="/motion" component={TrajectoryPage} />
        <Route path="/motion/helix" component={HelixPage} />
        <Route path="/decisions" component={DecisionsPage} />
        <Route path="/about" component={AboutPage} />
        <Route path="/oracle" component={OraclePage} />
        <Route path="/wrapped" component={WrappedPage} />
        <Route path="/profile" component={ProfilePage} />
        <Route component={NotFound} />
      </Switch>
      <BottomNav />
    </Router>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
        <Toaster />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
