// decrypt.js
// -----------------------------
// Download, unwrap AES key, decrypt firmware
// -----------------------------

import { sha256, aesGcmDecrypt, eciesDecrypt } from "../lib/crypto.js";
import { getWrappedKey }                       from "../lib/key_service.js";
import fs from "fs/promises";

/**
 * @typedef {Object} MetaData
 * @property {string} keyID         - Unique key identifier (0x-prefixed hex)
 * @property {string} hash          - Expected SHA-256 hash of firmware (0x...)
 * @property {string} version       - Firmware version
 * @property {string} deviceType    - Device type string
 */

/**
 * @typedef {Object} DeviceInfo
 * @property {string} deviceId      - Device identifier
 * @property {string} pubKey        - Public key (hex)
 * @property {string} privPath      - Path to private key file
 */

/**
 * Decrypts a firmware package for a given device.
 * @param {MetaData} meta        - Firmware metadata (from blockchain)
 * @param {Buffer} cipherPkg     - Full ciphertext from IPFS (iv | tag | cipher)
 * @param {DeviceInfo} device    - Device info with key path
 * @returns {Promise<Buffer>}    - Decrypted firmware buffer
 */
export async function decryptForDevice(meta, cipherPkg, device) {
  console.log(`[Decrypt] Processing device ${device.deviceId}`);

  // 1. Parse buffer: 12 bytes IV, 16 bytes AuthTag, rest = cipher
  const iv     = cipherPkg.subarray(0, 12);
  const tag    = cipherPkg.subarray(12, 28);
  const cipher = cipherPkg.subarray(28);

  // 2. Get encrypted AES key from Key-Service
  console.log(`[Decrypt] Pubkey ${device.pubKey}`);
  console.log(`[Decrypt] KeyID ${device.keyID}`);
  const wrappedKey = await getWrappedKey(meta.keyID, device.pubKey);  // Buffer

  // 3. Read private key from file
  const privHex = (await fs.readFile(device.privPath, "utf8")).trim();

  // 4. ECIES decrypt → AES key (32 bytes)
  const aesKey = eciesDecrypt(privHex, wrappedKey);

  // 5. AES-GCM decrypt
  const plain = aesGcmDecrypt(cipher, aesKey, iv, tag);

  // 6. Verify SHA-256
  const computedHash = sha256(plain).toString("hex").toUpperCase();
  const expectedHash = meta.hash.replace(/^0x/, "").toUpperCase();

  if (computedHash !== expectedHash) {
    throw new Error(`[Decrypt] SHA256 mismatch: got ${computedHash}, expected ${expectedHash}`);
  }

  console.log(`[Decrypt] OK: firmware version ${meta.version}, size=${plain.length} bytes`);
  return plain; // → Buffer
}
