import { useContext } from 'react';
import type { Bolt } from './Bolt';
import { BoltContext } from './BoltContext';

export const useBolt = (): Bolt => {
  const bolt = useContext(BoltContext);
  if (!bolt) {
    throw new Error('useBolt must be used within a <BoltProvider>');
  }
  return bolt;
};
