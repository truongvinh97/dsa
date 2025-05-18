// src/lib/key_service.js

import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

// ECIES lib (nếu dùng ecies-geth)
import * as ecies from "ecies-geth";

/** 1) Đọc env */
const MASTER_SECRET   = Buffer.from(process.env.MASTER_SECRET.replace(/^0x/, ""), "hex");
const WRAP_PUB_HEX    = process.env.LOCAL_XPUB;   // "0x04..."
const WRAP_PRIV_HEX   = process.env.LOCAL_XPRV;  // "0x..." 32-byte
if (!MASTER_SECRET || !WRAP_PUB_HEX || !WRAP_PRIV_HEX) {
  throw new Error("Missing MASTER_SECRET or WRAP key in .env");
}

/**
 * deriveGroupKey(version, deviceType)
 *  - aesGroupKey = HMAC-SHA256(MASTER_SECRET, `${version}|${deviceType}`)
 *  - keyID       = SHA256(aesGroupKey)   (bytes32)
 *  - pubWrapKey  = WRAP_PUB_HEX
 */
export function deriveGroupKey(version, deviceType) {
  const id = `${version}|${deviceType}`;
  const aesGroupKey = crypto
    .createHmac("sha256", MASTER_SECRET)
    .update(id)
    .digest();                // Buffer(32)
  const keyID = "0x" + crypto
    .createHash("sha256")
    .update(aesGroupKey)
    .digest("hex");
  return { keyID, aesGroupKey, pubWrapKey: WRAP_PUB_HEX };
}

/**
 * deriveWrapPrivKey()
 *  - Trả về private-wrap key để ECIES-decrypt session key
 */
export function deriveWrapPrivKey() {
  return WRAP_PRIV_HEX;
}
