// src/lib/key_service.js

import crypto from "crypto";
import dotenv from "dotenv";
import { HDNode, keccak256, toUtf8Bytes } from "ethers";

dotenv.config();

// ── 1. Đọc biến môi trường ───────────────────────────────────────────
const { MASTER_SECRET, LOCAL_XPUB, LOCAL_XPRV } = process.env;
if (!MASTER_SECRET) throw new Error("[KeyService] Missing MASTER_SECRET");
if (!LOCAL_XPUB)   throw new Error("[KeyService] Missing LOCAL_XPUB");
if (!LOCAL_XPRV)   throw new Error("[KeyService] Missing LOCAL_XPRV");

// MASTER_SECRET là hex string, có thể có/không có "0x"
const masterSecretBuf = Buffer.from(MASTER_SECRET.replace(/^0x/, ""), "hex");

/**
 * Tạo index từ `${version}|${deviceType}` bằng low 32-bit của keccak256
 */
function computeDerivationIndex(version, deviceType) {
  const id   = `${version}|${deviceType}`;
  const hash = keccak256(toUtf8Bytes(id));    // returns "0x..."
  // lấy 8 hex cuối, parse thành số, giữ 31 bit
  return parseInt(hash.slice(-8), 16) & 0x7fffffff;
}

/**
 * deriveGroupKey(version, deviceType)
 * → { keyID, aesGroupKey, pubWrapKey }
 */
export function deriveGroupKey(version, deviceType) {
  const id = `${version}|${deviceType}`;

  // 1) aesGroupKey = HMAC-SHA256(MASTER_SECRET, id)
  const aesGroupKey = crypto
    .createHmac("sha256", masterSecretBuf)
    .update(id)
    .digest();  // Buffer(32)

  // 2) keyID = keccak256(aesGroupKey)
  const keyID = keccak256(aesGroupKey);      // "0x..." 32-byte

  // 3) pubWrapKey từ LOCAL_XPUB via BIP32
  const index     = computeDerivationIndex(version, deviceType);
  const rootPub   = HDNode.fromExtendedKey(LOCAL_XPUB);
  const childPub  = rootPub.derivePath(`m/0/${index}`);
  const pubWrapKey = childPub.publicKey;     // uncompressed "0x04..."

  return { keyID, aesGroupKey, pubWrapKey };
}

/**
 * deriveWrapPrivKey(version, deviceType)
 * → private EC key hex (0x...) cho ECIES decryption
 */
export function deriveWrapPrivKey(version, deviceType) {
  const index    = computeDerivationIndex(version, deviceType);
  const rootPriv = HDNode.fromExtendedKey(LOCAL_XPRV);
  const child    = rootPriv.derivePath(`m/0/${index}`);
  return child.privateKey;                    // "0x..." 32-byte
}
