import { Bolt } from '../client/Bolt';
import { BoltProvider } from '../client/BoltProvider';
import { useBolt } from '../client/useBolt';

describe('Root exports', () => {
  it('should export Bolt class', () => {
    expect(Bolt).toBeDefined();
    expect(typeof Bolt).toBe('function');
  });

  it('should export BoltProvider', () => {
    expect(BoltProvider).toBeDefined();
    expect(typeof BoltProvider).toBe('function');
  });

  it('should export useBolt hook', () => {
    expect(useBolt).toBeDefined();
    expect(typeof useBolt).toBe('function');
  });
});
