/** Generates a random lowercase hex string of the given length. Not cryptographically secure — trace ids don't need to be. */
function randomHex(length: number): string {
  let out = "";
  while (out.length < length) {
    out += Math.floor(Math.random() * 16).toString(16);
  }
  return out;
}

/** 128-bit trace id: 32 hex chars. */
export function generateTraceId(): string {
  return randomHex(32);
}

/** 64-bit span id: 16 hex chars. */
export function generateSpanId(): string {
  return randomHex(16);
}
