// src/lib/crypto.js

import crypto from "crypto";
import * as secp from "@noble/secp256k1";
import ecies from "ecies-geth";

secp.utils.hmacSha256Sync = (key, ...msgs) => {
  const h = crypto.createHmac("sha256", key);
  msgs.forEach(m => h.update(m));
  return h.digest();
};

/**
 * SHA-256
 * @param {Buffer} data
 * @returns {Buffer} 32-byte digest
 */
export function sha256(data) {
  return crypto.createHash("sha256").update(data).digest();
}

/**
 * ECDSA sign (secp256k1) of a 32-byte hash
 * @param {Buffer} hashBuf
 * @param {string} privHex  0x-prefixed hex private key (32 bytes)
 * @returns {string}        0x-prefixed 65-byte signature (r|s|recovery)
 */
export function signHash(hashBuf, privHex) {
  // noble-secp256k1 wants hex or Uint8Array
  const priv = privHex.replace(/^0x/, "");
  // recovered=true to get [signatureRS, recovery]
  const [sigBytes, recId] = secp.signSync(hashBuf, priv, {
    recovered: true,
    canonical: true
  });
  const sigHex = secp.utils.bytesToHex(sigBytes);
  const vHex   = recId.toString(16).padStart(2, "0");
  return "0x" + sigHex + vHex;
}

/**
 * ECDSA verify
 * @param {Buffer} hashBuf
 * @param {string} sigHex    0x-prefixed 65-byte signature
 * @param {string} pubHex    0x04-prefixed uncompressed public key
 * @returns {boolean}
 */
export function verifySig(hashBuf, sigHex, pubHex) {
  const sig = Buffer.from(sigHex.replace(/^0x/, ""), "hex");
  if (sig.length !== 65) return false;
  // slice off recovery byte
  const rs = sig.slice(0, 64);
  // noble verify accepts hex or Uint8Array
  return secp.verify(
    secp.utils.bytesToHex(rs),
    hashBuf,
    pubHex.replace(/^0x/, "")
  );
}

/**
 * AES-256-GCM encrypt
 * @param {Buffer} plaintext
 * @param {Buffer} key        32-byte key
 * @returns {Buffer}          iv(12) || ciphertext || authTag(16)
 */
export function aesGcmEncrypt(plaintext, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ct, tag]);
}

/**
 * AES-256-GCM decrypt
 * @param {Buffer} encrypted   iv(12) || ciphertext || tag(16)
 * @param {Buffer} key         32-byte key
 * @returns {Buffer}           plaintext
 */
export function aesGcmDecrypt(encrypted, key) {
  const iv = encrypted.slice(0, 12);
  const tag = encrypted.slice(encrypted.length - 16);
  const ct = encrypted.slice(12, encrypted.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

/**
 * ECIES encrypt (for wrapping session-key)
 * @param {string} pubHex     0x-prefixed uncompressed EC public key
 * @param {Buffer} data       plaintext
 * @returns {Buffer}          ciphertext
 */
export function eciesEncrypt(pubHex, data) {
  const pub = Buffer.from(pubHex.replace(/^0x/, ""), "hex");
  return ecies.encrypt(pub, data);
}

/**
 * ECIES decrypt (for unwrapping session-key)
 * @param {string|Buffer} privHex    0x-prefixed EC private key
 * @param {Buffer} encrypted
 * @returns {Buffer}                 plaintext
 */
export function eciesDecrypt(privHex, encrypted) {
  const privStr = Buffer.isBuffer(privHex)
    ? privHex.toString("hex")
    : String(privHex).replace(/^0x/, "");

  const priv = Buffer.from(privStr, "hex");
  // encrypted là Buffer? Có độ dài hợp lý? Có đúng là cipher từ ECIES?
  console.log("Encrypted len =", encrypted.length);
  console.log("Encrypted hex =", encrypted.toString("hex").slice(0, 100));
  return ecies.decrypt(priv, encrypted);

}

