import { createContext, useContext, type ReactNode } from 'react';
import type { Bolt } from './Bolt';

const BoltContext = createContext<Bolt | null>(null);

export interface BoltProviderProps {
  client: Bolt;
  children: ReactNode;
}

export function BoltProvider({ client, children }: BoltProviderProps) {
  return <BoltContext.Provider value={client}>{children}</BoltContext.Provider>;
}

export function useBolt(): Bolt {
  const bolt = useContext(BoltContext);
  if (!bolt) {
    throw new Error('useBolt must be used within a <BoltProvider>');
  }
  return bolt;
}
