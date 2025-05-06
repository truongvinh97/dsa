/*  src/lib/key-service.js
 *  -----------------------
 *  REST client wrapper for Key Distribution Service (backend)
 *  Used by Raspberry Pi Gateway to fetch per-device wrapped AES keys
 */

import axios from "axios";

const baseURL = process.env.KEY_SERVICE || "http://192.168.1.24:4000/api/v1/keys";

if (!baseURL) {
  throw new Error("[KeyService] Missing KEY_SERVICE env variable");
}

/**
 * Request a wrapped (encrypted) AES key from KeyService
 * @param {string} keyID      – 32-byte key identifier (hex string)
 * @param {string} pubHex     – 65-byte EC public key (0x04 + X + Y)
 * @returns {Promise<Buffer>} – Encrypted AES key (wrapped using ECIES)
 */
export async function getWrappedKey(keyID, pubHex) {
  try {
    const response = await axios.get(`${baseURL}/${keyID}`, {
      params: { pub: pubHex }
    });

    if (!response.data?.cipherHex) {
      throw new Error("Invalid response from KeyService");
    }

    return Buffer.from(response.data.cipherHex.replace(/^0x/, ""), "hex");

  } catch (err) {
    console.error("[KeyService] Failed to fetch key:", err.message);
    throw new Error("Failed to retrieve wrapped key from KeyService");
  }
}