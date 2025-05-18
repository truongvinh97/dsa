// src/lib/key_service.js

import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

import { HDNodeWallet } from "ethers/wallet";
import { keccak256, toUtf8Bytes } from "ethers/utils";

// ── 1. Đọc biến môi trường ───────────────────────────────────────────
const { MASTER_SECRET, LOCAL_XPUB, LOCAL_XPRV } = process.env;

if (!MASTER_SECRET) throw new Error("[KeyService] Missing MASTER_SECRET");
if (!LOCAL_XPUB)   throw new Error("[KeyService] Missing LOCAL_XPUB");
if (!LOCAL_XPRV)   throw new Error("[KeyService] Missing LOCAL_XPRV");

const masterSecretBuf = Buffer.from(MASTER_SECRET.replace(/^0x/, ""), "hex");

/**
 * Tính index từ `${version}|${deviceType}`
 */
function computeDerivationIndex(version, deviceType) {
  const id = `${version}|${deviceType}`;
  const hash = keccak256(toUtf8Bytes(id));  // returns "0x…"
  return parseInt(hash.slice(-8), 16) & 0x7fffffff;
}

/**
 * deriveGroupKey(version, deviceType)
 * → { keyID, aesGroupKey, pubWrapKey }
 */
export function deriveGroupKey(version, deviceType) {
  const id = `${version}|${deviceType}`;

  // 1) Tạo AES-group-key
  const aesGroupKey = crypto
    .createHmac("sha256", masterSecretBuf)
    .update(id)
    .digest();  // Buffer

  // 2) Tạo keyID = keccak256(aesGroupKey)
  const keyID = keccak256(aesGroupKey);  // → "0x…" hex

  // 3) Lấy pubWrapKey từ XPUB
  const index = computeDerivationIndex(version, deviceType);
  const root  = HDNodeWallet.fromExtendedKey(LOCAL_XPUB);
  const node  = root.derivePath(`m/0/${index}`);
  const pubWrapKey = node.publicKey;  // 0x04 + 64 bytes

  return { keyID, aesGroupKey, pubWrapKey };
}

/**
 * deriveWrapPrivKey(version, deviceType)
 * → private EC key for ECIES decryption
 */
export function deriveWrapPrivKey(version, deviceType) {
  const index = computeDerivationIndex(version, deviceType);
  const root  = HDNodeWallet.fromExtendedKey(LOCAL_XPRV);
  const node  = root.derivePath(`m/0/${index}`);
  return node.privateKey; // "0x…" hex
}
