// src/lib/key_service.js

import crypto from "crypto";
import dotenv from "dotenv";
// ECIES để unwrap session‐key
import * as ecies from "ecies-geth";
// keccak256 để sinh keyID giống trên chain
import { keccak256 } from "ethers";

dotenv.config();

// ── 1) Đọc env ─────────────────────────────────────────────────────
const MASTER_SECRET_HEX = process.env.MASTER_SECRET;
const WRAP_PUB_HEX      = process.env.LOCAL_XPUB;   // “0x04…” uncompressed
const WRAP_PRIV_HEX     = process.env.LOCAL_XPRV;   // “0x…” 32 byte

if (
  !MASTER_SECRET_HEX ||
  !WRAP_PUB_HEX    ||
  !WRAP_PRIV_HEX
) {
  throw new Error("Missing MASTER_SECRET or LOCAL_XPUB/LOCAL_XPRV in .env");
}

// MASTER_SECRET buffer (256-bit)
const MASTER_SECRET = Buffer.from(
  MASTER_SECRET_HEX.replace(/^0x/, ""),
  "hex"
);


/**
 * deriveGroupKey(version, deviceType)
 *
 *  • aesGroupKey = HMAC-SHA256(MASTER_SECRET, `${version}|${deviceType}`)
 *  • keyID       = keccak256(aesGroupKey)        // bytes32
 *  • pubWrapKey  = WRAP_PUB_HEX                  // cố định
 *
 * Trả về { keyID, aesGroupKey, pubWrapKey }
 */
export function deriveGroupKey(version, deviceType) {
  const id = `${version}|${deviceType}`;

  // 1) AES-group key
  const aesGroupKey = crypto
    .createHmac("sha256", MASTER_SECRET)
    .update(id)
    .digest();  // Buffer(32)

  // 2) keyID = keccak256(aesGroupKey)
  const keyID = keccak256(aesGroupKey);

  // 3) pubWrapKey cố định
  const pubWrapKey = WRAP_PUB_HEX;

  return { keyID, aesGroupKey, pubWrapKey };
}

/**
 * deriveWrapPrivKey()
 *
 *  • Trả về private-wrap key (ECIES) cố định từ env
 *    để dispatcher dùng unwrap session key.
 */
export function deriveWrapPrivKey() {
  return Buffer.from(WRAP_PRIV_HEX.replace(/^0x/, ""), "hex");
}