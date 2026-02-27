/**
 * Parse a Bolt message from an iframe.
 * Messages may be double-serialized (JSON string within JSON).
 */
export const parseBoltMessage = (
  data: unknown
): Record<string, unknown> | null => {
  let msg = data;

  if (typeof msg === 'string') {
    try {
      msg = JSON.parse(msg);
    } catch {
      return null;
    }
  }

  if (typeof msg === 'object' && msg !== null) {
    return msg as Record<string, unknown>;
  }
  return null;
};
