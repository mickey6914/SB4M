import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import Placeholder from './routes/Placeholder';
import Product from './routes/wizard/Product';
import Hero from './routes/wizard/Hero';
import Volume from './routes/wizard/Volume';
import Scenes from './routes/wizard/Scenes';
import Progress from './routes/wizard/Progress';
import Review from './routes/Review';
import Calendar from './routes/Calendar';
import Dashboard from './routes/Dashboard';
import { RunProvider } from './state/run';
import { PushProvider } from './state/push';

export default function App() {
  return (
    <BrowserRouter>
      <RunProvider>
        <PushProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/run/product" element={<Product />} />
            <Route path="/run/hero" element={<Hero />} />
            <Route path="/run/volume" element={<Volume />} />
            <Route path="/run/scenes" element={<Scenes />} />
            <Route path="/run/:id/progress" element={<Progress />} />
            <Route path="/review/:runId" element={<Review />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route
              path="/library"
              element={
                <Placeholder
                  kicker="Library"
                  title="Library"
                  lead="Past runs. Duplicating a run reuses its scenes and style direction."
                  increment={6}
                />
              }
            />
            <Route
              path="/connections"
              element={
                <Placeholder
                  kicker="Connections"
                  title="Connections"
                  lead="Pin-Post Studio never posts directly — Content360 owns the accounts and the publishing. Workspace rules are set once here."
                  increment={7}
                />
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
        </PushProvider>
      </RunProvider>
    </BrowserRouter>
  );
}
