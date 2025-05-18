// src/lib/key_service.js

import crypto from "crypto";
import dotenv from "dotenv";
import {
  keccak256,
  toUtf8Bytes,
  hexlify,
  HDNodeWallet
} from "ethers";

dotenv.config();

// ── 1. Đọc biến môi trường ───────────────────────────────────────────
const { MASTER_SECRET, LOCAL_XPUB, LOCAL_XPRV } = process.env;
if (!MASTER_SECRET) throw new Error("[KeyService] Missing MASTER_SECRET");
if (!LOCAL_XPUB)   throw new Error("[KeyService] Missing LOCAL_XPUB");
if (!LOCAL_XPRV)   throw new Error("[KeyService] Missing LOCAL_XPRV");

// MASTER_SECRET có thể bắt đầu bằng “0x” hoặc không
const masterSecretBuf = Buffer.from(
  MASTER_SECRET.replace(/^0x/, ""),
  "hex"
);

// ── 2. Hàm phụ tính index cho HD derivation ─────────────────────────
function computeDerivationIndex(version, deviceType) {
  // chúng ta hash chuỗi `${version}|${deviceType}` rồi lấy low-32 bits
  const id   = `${version}|${deviceType}`;
  const hash = keccak256(toUtf8Bytes(id));    // trả về "0x..."
  // slice(-8) lấy 8 hex cuối, parseInt base16, giữ 31 bit cao
  return parseInt(hash.slice(-8), 16) & 0x7fffffff;
}

// ── 3. deriveGroupKey ────────────────────────────────────────────────
/**
 * @param {string} version
 * @param {string} deviceType
 * @returns {{ keyID: string, aesGroupKey: Buffer, pubWrapKey: string }}
 *
 * aesGroupKey = HMAC-SHA256(masterSecret, `${version}|${deviceType}`)
 * keyID       = keccak256(hexlify(aesGroupKey))
 * pubWrapKey  = HDNode.fromExtendedKey(LOCAL_XPUB).derivePath(m/0/index).publicKey
 */
export function deriveGroupKey(version, deviceType) {
  // 1) sinh AES-group-key
  const id = `${version}|${deviceType}`;
  const aesGroupKey = crypto
    .createHmac("sha256", masterSecretBuf)
    .update(id)
    .digest();  // Buffer(32)

  // 2) tính keyID (bytes32 hex)
  const keyID = keccak256(hexlify(aesGroupKey));

  // 3) derive public-wrap-key
  const index   = computeDerivationIndex(version, deviceType);
  const hdnode  = HDNodeWallet.fromExtendedKey(LOCAL_XPUB)
                    .derivePath(`m/0/${index}`);
  const pubWrapKey = hdnode.publicKey;   // uncompressed hex “0x04...”

  return { keyID, aesGroupKey, pubWrapKey };
}

// ── 4. deriveWrapPrivKey ────────────────────────────────────────────
/**
 * @param {string} version
 * @param {string} deviceType
 * @returns {string} private key hex “0x...”
 *
 * Dùng LOCAL_XPRV để derive cùng path m/0/index, trả về privateKey
 */
export function deriveWrapPrivKey(version, deviceType) {
  const index  = computeDerivationIndex(version, deviceType);
  const hdnode = HDNodeWallet.fromExtendedKey(LOCAL_XPRV)
                    .derivePath(`m/0/${index}`);
  return hdnode.privateKey;  // “0x...” 32-byte
}
