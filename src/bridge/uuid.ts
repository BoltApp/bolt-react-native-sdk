/* eslint-disable no-bitwise */
/**
 * Simple UUID v4 generator that doesn't require external dependencies.
 * Uses Math.random() which is sufficient for checkout page IDs.
 */
export const v4 = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
