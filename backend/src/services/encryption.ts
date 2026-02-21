/**
 * Encryption Service — AES encrypt/decrypt API keys at rest
 */

import CryptoJS from "crypto-js";

const SECRET = process.env.ENCRYPTION_KEY || "dev-encryption-key-change-in-prod";

export function encrypt(plainText: string): string {
  return CryptoJS.AES.encrypt(plainText, SECRET).toString();
}

export function decrypt(cipherText: string): string {
  const bytes = CryptoJS.AES.decrypt(cipherText, SECRET);
  return bytes.toString(CryptoJS.enc.Utf8);
}
