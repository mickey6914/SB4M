import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import Placeholder from './routes/Placeholder';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route
            path="/"
            element={
              <Placeholder
                kicker="Step one of one"
                title="Paste a product link."
                lead="Etsy, Shopify or Amazon. Pin-Post Studio pulls the listing images, then asks you four short questions — nothing else on this screen needs you today."
                increment={2}
              />
            }
          />
          <Route
            path="/run/product"
            element={
              <Placeholder
                kicker="Run wizard · 1 of 4"
                title="Where's the product?"
                lead="Paste the listing link and every image on it comes across. One link per run — that keeps the pins about one product."
                increment={2}
              />
            }
          />
          <Route
            path="/run/hero"
            element={
              <Placeholder
                kicker="Run wizard · 2 of 4"
                title="Pick the hero image."
                lead="Choose the one image every mockup builds from — the sharpest, cleanest shot of the product itself."
                increment={2}
              />
            }
          />
          <Route
            path="/run/volume"
            element={
              <Placeholder
                kicker="Run wizard · 3 of 4"
                title="How many pins?"
                lead="Thirty covers a month at one pin a day. Three is the cheap way to sanity-check a new product before committing."
                increment={2}
              />
            }
          />
          <Route
            path="/run/scenes"
            element={
              <Placeholder
                kicker="Run wizard · 4 of 4"
                title="Choose three scenes."
                lead="These are the aesthetics the AI copies — not the product. Three is the sweet spot: enough variety for thirty pins, tight enough to look like one brand."
                increment={2}
              />
            }
          />
          <Route
            path="/run/:id/progress"
            element={
              <Placeholder
                kicker="Run 15 · ceramic mug gift set"
                title="Building 30 pins."
                lead="You can leave this screen — the run keeps going and lands in your review queue when it's done."
                increment={2}
              />
            }
          />
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
    </BrowserRouter>
  );
}
