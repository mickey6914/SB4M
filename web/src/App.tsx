import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import Product from './routes/wizard/Product';
import Hero from './routes/wizard/Hero';
import Volume from './routes/wizard/Volume';
import Scenes from './routes/wizard/Scenes';
import Progress from './routes/wizard/Progress';
import Review from './routes/Review';
import Calendar from './routes/Calendar';
import Dashboard from './routes/Dashboard';
import Library from './routes/Library';
import Connections from './routes/Connections';
import { RunProvider } from './state/run';
import { PushProvider } from './state/push';
import { WorkspaceProvider } from './state/workspace';

export default function App() {
  return (
    <BrowserRouter>
      <WorkspaceProvider>
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
            <Route path="/library" element={<Library />} />
            <Route path="/connections" element={<Connections />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
        </PushProvider>
      </RunProvider>
      </WorkspaceProvider>
    </BrowserRouter>
  );
}
