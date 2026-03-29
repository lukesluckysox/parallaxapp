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
        <Route path="/" component={CharacterApp} />
        <Route path="/holistic" component={HolisticPage} />
        <Route path="/writing" component={WritingPage} />
        <Route path="/spotify" component={SpotifyPage} />
        <Route path="/decisions" component={DecisionsPage} />
        <Route path="/discover" component={DiscoverPage} />
        <Route path="/health" component={HealthPage} />
        <Route path="/trajectory" component={TrajectoryPage} />
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
