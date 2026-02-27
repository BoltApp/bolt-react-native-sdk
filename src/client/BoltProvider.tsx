import type { ReactNode } from 'react';
import type { Bolt } from './Bolt';
import { BoltContext } from './BoltContext';

export interface BoltProviderProps {
  client: Bolt;
  children: ReactNode;
}

export const BoltProvider = ({ client, children }: BoltProviderProps) => (
  <BoltContext.Provider value={client}>{children}</BoltContext.Provider>
);
