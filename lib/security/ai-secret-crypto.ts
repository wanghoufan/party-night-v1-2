const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function generateSecretKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(secret: string, key: CryptoKey): Promise<{ ciphertext: ArrayBuffer; iv: Uint8Array<ArrayBuffer> }> {
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(secret));
  return { ciphertext, iv };
}

export async function decryptSecret(ciphertext: ArrayBuffer, iv: Uint8Array<ArrayBuffer>, key: CryptoKey): Promise<string> {
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return decoder.decode(plaintext);
}

export async function isKeyNonExtractable(key: CryptoKey): Promise<boolean> {
  if (key.extractable) return false;
  try { await crypto.subtle.exportKey("raw", key); return false; } catch { return true; }
}
