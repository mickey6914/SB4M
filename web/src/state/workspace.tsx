import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

// Workspace rules — set once in Connections, applied everywhere. Per the
// handoff these are workspace-level, not per-pin. Persisted locally so they
// survive a reload; a database takes over when accounts land.

export type WorkspaceRules = {
  requireAd: boolean;
  windowOnly: boolean;
  noRepeatPerDay: boolean;
  requireApproval: boolean;
  windowStart: number;
  windowEnd: number;
  maxPerNetworkPerDay: number;
  defaultOverlay: string;
  // Which Pinterest board every pin in this workspace lands on. Chosen in
  // Connections from the boards Content360 reports; Pinterest needs one to
  // publish. The name is kept alongside the id so the choice still reads
  // back when Content360 is unreachable.
  pinterestBoardId: string;
  pinterestBoardName: string;
};

export const DEFAULT_RULES: WorkspaceRules = {
  requireAd: true,
  windowOnly: true,
  noRepeatPerDay: true,
  requireApproval: false,
  windowStart: 9,
  windowEnd: 17,
  maxPerNetworkPerDay: 3,
  defaultOverlay: 'EXPRESS ART VIBE',
  pinterestBoardId: '',
  pinterestBoardName: '',
};

const STORAGE_KEY = 'eav.workspaceRules';

function load(): WorkspaceRules {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_RULES;
    return { ...DEFAULT_RULES, ...(JSON.parse(raw) as Partial<WorkspaceRules>) };
  } catch {
    return DEFAULT_RULES;
  }
}

type Ctx = {
  rules: WorkspaceRules;
  update: (patch: Partial<WorkspaceRules>) => void;
  reset: () => void;
};

const WorkspaceContext = createContext<Ctx | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [rules, setRules] = useState<WorkspaceRules>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
    } catch {
      // Private browsing or a full quota — rules still apply this session.
    }
  }, [rules]);

  const update = (patch: Partial<WorkspaceRules>) => setRules((r) => ({ ...r, ...patch }));
  const reset = () => setRules(DEFAULT_RULES);

  return (
    <WorkspaceContext.Provider value={{ rules, update, reset }}>{children}</WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace outside WorkspaceProvider');
  return ctx;
}
