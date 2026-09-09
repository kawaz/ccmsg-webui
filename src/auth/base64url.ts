/** base64url without padding, which is how every byte string on this wire is
 * spelled (contract `Base64Url`).
 *
 * The browser hands over `ArrayBuffer`s and expects them back, and the contract
 * carries text, so this pair is the whole of the boundary between the two. */

export function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function fromBase64Url(text: string): Uint8Array {
  const padded = text.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), "="));
  const bytes = new Uint8Array(binary.length);
  for (let at = 0; at < binary.length; at += 1) bytes[at] = binary.charCodeAt(at);
  return bytes;
}

/** The same text as bytes the browser will take: `credentials.create()` and
 * `credentials.get()` want `BufferSource` for the challenge and the user
 * handle, and refuse a string. */
export function bufferOf(text: string): ArrayBuffer {
  const bytes = fromBase64Url(text);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
