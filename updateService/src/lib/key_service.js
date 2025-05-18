// src/lib/key_service.js

import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

// ethers v6 – import từ submodules thay vì từ "ethers"
import { HDNodeWallet } from "ethers/wallet";
import { keccak256, toUtf8Bytes } from "ethers";

// ── 1. Đọc biến môi trường ───────────────────────────────────────────
const { MASTER_SECRET, LOCAL_XPUB, LOCAL_XPRV } = process.env;
if (!MASTER_SECRET) throw new Error("[KeyService] Missing MASTER_SECRET");
if (!LOCAL_XPUB)   throw new Error("[KeyService] Missing LOCAL_XPUB");
if (!LOCAL_XPRV)   throw new Error("[KeyService] Missing LOCAL_XPRV");

const masterSecretBuf = Buffer.from(MASTER_SECRET.replace(/^0x/, ""), "hex");

/**
 * Tạo index từ `${version}|${deviceType}` bằng low 32-bit của keccak256
 */
function computeDerivationIndex(version, deviceType) {
  const id = `${version}|${deviceType}`;
  const hash = keccak256(toUtf8Bytes(id));
  return parseInt(hash.slice(-8), 16) & 0x7fffffff;
}

/**
 * deriveGroupKey(version, deviceType)
 * → { keyID, aesGroupKey, pubWrapKey }
 */
export function deriveGroupKey(version, deviceType) {
  const id = `${version}|${deviceType}`;

  const aesGroupKey = crypto
    .createHmac("sha256", masterSecretBuf)
    .update(id)
    .digest();

  const keyID = keccak256(aesGroupKey);

  const index = computeDerivationIndex(version, deviceType);
  const node = HDNodeWallet.fromExtendedKey(LOCAL_XPUB).derivePath(`m/0/${index}`);
  const pubWrapKey = node.publicKey; // 0x04 + 64 bytes

  return { keyID, aesGroupKey, pubWrapKey };
}

/**
 * deriveWrapPrivKey(version, deviceType)
 * → private EC key hex (0x...) for ECIES decryption
 */
export function deriveWrapPrivKey(version, deviceType) {
  const index = computeDerivationIndex(version, deviceType);
  const node = HDNodeWallet.fromExtendedKey(LOCAL_XPRV).derivePath(`m/0/${index}`);
  return node.privateKey; // "0x…" 32-byte
}
