import { createContext, useContext, useState, type ReactNode } from 'react';

// Push state shared across screens: the review screen writes it, the
// dashboard and calendar read it. The per-post state machine is
// queued → pushed → published → failed, mirroring Content360.

export type PostState = 'queued' | 'pushed' | 'published' | 'failed';

export type BatchPost = {
  localId: string;
  network: 'pinterest' | 'facebook' | 'instagram';
  state: PostState;
  error?: string;
};

export type Batch = {
  id: string;
  runId: string;
  pushedAt: string;
  counts: Record<PostState, number>;
  posts: BatchPost[];
};

type PushContextValue = {
  batch: Batch | null;
  setBatch: (b: Batch | null) => void;
  pushError: string;
  setPushError: (m: string) => void;
};

const PushContext = createContext<PushContextValue | null>(null);

export function PushProvider({ children }: { children: ReactNode }) {
  const [batch, setBatch] = useState<Batch | null>(null);
  const [pushError, setPushError] = useState('');
  return (
    <PushContext.Provider value={{ batch, setBatch, pushError, setPushError }}>
      {children}
    </PushContext.Provider>
  );
}

export function usePush() {
  const ctx = useContext(PushContext);
  if (!ctx) throw new Error('usePush outside PushProvider');
  return ctx;
}
