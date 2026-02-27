import { createContext } from 'react';
import type { Bolt } from './Bolt';

export const BoltContext = createContext<Bolt | null>(null);
