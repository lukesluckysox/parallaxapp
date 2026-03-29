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
import HealthPage from "./pages/HealthPage";
import TrajectoryPage from "./pages/TrajectoryPage";
import HolisticPage from "./pages/HolisticPage";
import MirrorsPage from "./pages/MirrorsPage";
import AboutPage from "./pages/AboutPage";
import AuthPage from "./pages/AuthPage";
import NotFound from "./pages/not-found";
import BottomNav from "./components/BottomNav";

function AppContent() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return (
      <Router hook={useHashLocation}>
        <Switch>
          <Route path="/about" component={AboutPage} />
          <Route component={AuthPage} />
        </Switch>
      </Router>
    );
  }

  return (
    <Router hook={useHashLocation}>
      <Switch>
        <Route path="/" component={HolisticPage} />
        <Route path="/snapshot" component={CharacterApp} />
        <Route path="/mirrors" component={MirrorsPage} />
        <Route path="/mirrors/sonic" component={SpotifyPage} />
        <Route path="/mirrors/inner" component={WritingPage} />
        <Route path="/mirrors/body" component={HealthPage} />
        <Route path="/signals" component={DiscoverPage} />
        <Route path="/motion" component={TrajectoryPage} />
        <Route path="/decisions" component={DecisionsPage} />
        <Route path="/about" component={AboutPage} />
        <Route component={NotFound} />
      </Switch>
      <BottomNav />
    </Router>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
