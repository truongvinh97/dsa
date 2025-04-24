/*  server/src/services/crypto.service.js
 *  -------------------------------------
 *  – SHA‑256
 *  – ECDSA secp256k1  (noble‑secp256k1  v2.x, pure JS)
 *  – AES‑256‑GCM
 *  – ECIES  (geth compatible)
 */

import crypto         from "crypto";
import * as secp      from "@noble/secp256k1";
import { etc, sign, verify, getPublicKey } from '@noble/secp256k1';
import * as eciesGeth from "ecies-geth";          // tiny wrapper ─ same algo geth uses

/* small helpers ---------------------------------------------------- */
const hex  = secp.utils.bytesToHex;
const bhex = (h) => Buffer.from(h.replace(/^0x/, ""), "hex");

/* ------------------------------------------------------------------ */
/* 1. SHA‑256                                                         */
/* ------------------------------------------------------------------ */
etc.hmacSha256Sync = (key, ...messages) => {
  const hmac = crypto.createHmac('sha256', key);
  messages.forEach(msg => hmac.update(msg));
  return hmac.digest();
};

export const sha256 = (buf) =>
  crypto.createHash("sha256").update(buf).digest();      // → Buffer(32)

/* ------------------------------------------------------------------ */
/* 2. ECDSA  sign / verify                                            */
/* ------------------------------------------------------------------ */

/* ...... Sign SHA256 Hash ...... */
export async function signHash(hashBuf, privHex) {
  const privKey = privHex.replace(/^0x/, '');
  const signature = await sign(
    hashBuf.toString('hex'),
    privKey,
    { 
      lowS: true,       // Ngăn chặn malleability
      extraEntropy: true // Tăng cường bảo mật
    }
  );

  const sigBytes = signature.toCompactRawBytes();
  const recovery = signature.recovery;
  const sigFull = Buffer.concat([
    Buffer.from(sigBytes),
    Buffer.from([recovery])
  ]);

  return '0x' + sigFull.toString('hex');
}
/* ...... Verify Signature ...... */
/**
 * @param {Buffer} hashBuf - 32-byte digest
 * @param {string} sigHex - Signature (0x-prefixed 65-byte r|s|v)
 * @param {string} pubKeyHex - Uncompressed public key (0x04 + 64 bytes)
 * @returns {Promise<boolean>}
 */
export async function verifySig(hashBuf, sigHex, pubKeyHex) {
  const sigBuf = Buffer.from(sigHex.slice(2), 'hex');
  if (sigBuf.length !== 65) return false;
  
  const signature = sigBuf.subarray(0, 64);
  const msgHash = hashBuf.toString('hex');
  const publicKey = pubKeyHex.slice(2);
  
  try {
    return await verify(
      signature.toString('hex'),
      msgHash,
      publicKey
    );
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* 3. AES‑256‑GCM                                                     */
/* ------------------------------------------------------------------ */
export function aesGcmEncrypt(plainBuf, keyBuf) {
  const iv   = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyBuf, iv);
  const enc  = Buffer.concat([cipher.update(plainBuf), cipher.final()]);
  const tag  = cipher.getAuthTag();
  return { cipher: enc, iv, tag };
}

export function aesGcmDecrypt(cipherBuf, keyBuf, iv, tag) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyBuf, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(cipherBuf), decipher.final()]);
}

/* ------------------------------------------------------------------ */
/* 4. ECIES helper (using ecies-geth)                                 */
/* ------------------------------------------------------------------ */
export function eciesEncrypt(pubKeyHex, plainBuf) {
  return ecies.encrypt(Buffer.from(pubKeyHex.slice(2), "hex"), plainBuf);
}

export function eciesDecrypt(privKeyHex, cipherBuf) {
  return ecies.decrypt(Buffer.from(privKeyHex.slice(2), "hex"), cipherBuf);
}

