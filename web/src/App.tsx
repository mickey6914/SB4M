import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import Placeholder from './routes/Placeholder';
import Product from './routes/wizard/Product';
import Hero from './routes/wizard/Hero';
import Volume from './routes/wizard/Volume';
import Scenes from './routes/wizard/Scenes';
import Progress from './routes/wizard/Progress';
import { RunProvider } from './state/run';

export default function App() {
  return (
    <BrowserRouter>
      <RunProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route
              path="/"
              element={
                <Placeholder
                  kicker="Step one of one"
                  title="Paste a product link."
                  lead="Etsy, Shopify or Amazon. Pin-Post Studio pulls the listing images, then asks you four short questions — nothing else on this screen needs you today."
                  increment={6}
                />
              }
            />
            <Route path="/run/product" element={<Product />} />
            <Route path="/run/hero" element={<Hero />} />
            <Route path="/run/volume" element={<Volume />} />
            <Route path="/run/scenes" element={<Scenes />} />
            <Route path="/run/:id/progress" element={<Progress />} />
            <Route
              path="/review/:runId"
              element={
                <Placeholder
                  kicker="Review"
                  title="Review the run."
                  lead="Approve, reject or edit pins; the four-up crop preview, pin grid and inspector arrive with the review screen."
                  increment={4}
                />
              }
            />
            <Route
              path="/calendar"
              element={
                <Placeholder
                  kicker="Calendar"
                  title="August 2026"
                  lead="The cross-network month: Pinterest, Facebook and Instagram posts for the same product on one grid, with gap detection and sync state."
                  increment={6}
                />
              }
            />
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
      </RunProvider>
    </BrowserRouter>
  );
}
