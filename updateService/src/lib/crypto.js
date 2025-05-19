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
 * ECDSA verify (secp256k1) of a 32-byte hash
 * @param {Buffer} hashBuf      32-byte SHA-256 digest
 * @param {string} sigHex       0x-prefixed 65-byte signature (r|s|recovery)
 * @param {string} pubHex       0x04-prefixed uncompressed public key
 * @returns {Promise<boolean>}
 */
export async function verifySig(hashBuf, sigHex, pubHex) {
  console.log("🔐 [verifySig] called");

  // 1) Normalize signature
  console.log("🔐 [verifySig] raw sigHex      =", sigHex);
  const sigStr = sigHex.replace(/^0x/, "");
  const sigBuf = Buffer.from(sigStr, "hex");
  console.log("🔐 [verifySig] sigBuf.length    =", sigBuf.length);

  if (sigBuf.length !== 65) {
    console.error("🔐 [verifySig] ❌ invalid signature length");
    return false;
  }

  // 2) Split r|s and recovery (we only need r|s for verify)
  const rs    = sigBuf.slice(0, 64);
  const rsHex = secp.utils.bytesToHex(rs);
  console.log("🔐 [verifySig] r|s (hex)        =", rsHex);

  // 3) Prepare message hash
  const msgHex = hashBuf.toString("hex");
  console.log("🔐 [verifySig] msgHash (hex)    =", msgHex);

  // 4) Normalize public key
  const pubKey = pubHex.replace(/^0x/, "");
  console.log("🔐 [verifySig] pubKey           =", pubKey.slice(0, 20) + "...");

  // 5) Run the verify
  let ok;
  try {
    ok = await secp.verify(rsHex, msgHex, pubKey);
  } catch (err) {
    console.error("🔐 [verifySig] ❌ secp.verify threw:", err);
    return false;
  }

  console.log("🔐 [verifySig] result           =", ok);
  return ok;
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
  export function aesGcmDecrypt(packet, key) {
    // iv: bytes 0–11
    const iv = packet.slice(0, 12);
    // tag: bytes 12–27
    const tag = packet.slice(12, 12 + 16);
    // cipher: từ offset 28 tới hết
    const ct = packet.slice(12 + 16);

    console.log("🛠 [AES-GCM] iv      =", iv.toString("hex"));
    console.log("🛠 [AES-GCM] tag     =", tag.toString("hex"));
    console.log("🛠 [AES-GCM] ct.preview =", ct.toString("hex").slice(0,100), "...");

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);

    console.log("✅ [AES-GCM] pt.preview =", pt.toString("hex").slice(0,100), "...");
    return pt;
  }


/**
 * ECIES encrypt (for wrapping session-key)
 * @param {string} pubHex     0x-prefixed uncompressed EC public key
 * @param {Buffer} data       plaintext
 * @returns {Buffer}          ciphertext
 */
export function eciesEncrypt(pubHex, data) {
  const pub = Buffer.from(pubHex.replace(/^0x/, ""), "hex");
  console.log("📤 Encrypting with pubKey =", pubHex.slice(0, 20) + "...");
  console.log("📄 Plaintext preview:", data.toString("utf8").slice(0, 100));
  const encrypted = ecies.encrypt(pub, data);
  console.log("✅ Encrypted len =", encrypted.length);
  return encrypted;
}


/**
 * ECIES decrypt (for unwrapping session-key)
 * @param {string|Buffer} privHex    0x-prefixed EC private key
 * @param {Buffer} encrypted
 * @returns {Buffer}                 plaintext
 */
export async function eciesDecrypt(privHex, encrypted) {
  console.log("====== [eciesDecrypt] Start =======");
  // 1) Chuyển privHex về Buffer đúng
  let priv;
  if (Buffer.isBuffer(privHex)) {
    priv = privHex;
  } else if (typeof privHex === "string" && privHex.startsWith("0x")) {
    priv = Buffer.from(privHex.slice(2), "hex");
  } else {
    throw new Error("privHex không phải 0x-prefixed hex string hoặc Buffer");
  }
  console.log("✅ priv (hex) =", priv.toString("hex"));

  // 2) Log ciphertext
  console.log("🧩 encrypted.len =", encrypted.length);
  console.log("🧩 encrypted.preview =", encrypted.toString("hex").slice(0, 100));

  // 3) Thực sự await decrypt, và bắt lỗi MAC ở đây
  try {
    const decrypted = await ecies.decrypt(priv, encrypted);
    console.log("🛠 [ECIES] decrypted (utf8) preview =", decrypted.toString("utf8").slice(0,100));
    console.log("✅ ECIES decrypt thành công!");
    console.log("📝 decrypted.preview =", decrypted.toString("hex").slice(0, 100));
    return decrypted;  // Đây mới là Buffer
  } catch (err) {
    console.error("❌ ECIES decrypt thất bại:", err.message);
    throw err;
  }
}


