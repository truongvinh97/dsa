/**
 *  server/src/services/ipfs.service.js
 *  -----------------------------------
 *  Upload via local IPFS daemon
 *  Download via local gateway → fallback public gateway → fallback wget
 */

import { create } from "ipfs-http-client";
import axios from "axios";
import dotenv from "dotenv";
import fs from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
dotenv.config();

const execAsync = promisify(exec);

// 1. Create IPFS client (upload through daemon)
const ipfs = create({
  host:     process.env.IPFS_HOST || "localhost",
  port:     process.env.IPFS_PORT || 5001,
  protocol: process.env.IPFS_PROTO || "http"
});

// 2. Upload buffer → returns CID
export async function uploadFile(buffer) {
  console.debug("[IPFS] Uploading", buffer.length, "bytes …");
  const { cid } = await ipfs.add(buffer);
  const cidStr = cid.toString();
  console.debug("[IPFS] ✅ Uploaded → CID =", cidStr);
  return cidStr;
}

// 3. Download from IPFS (try localhost first, then public, then wget)
export async function downloadFile(cidPath) {
  const gateways = [
    process.env.IPFS_GATEWAY_LOCAL || "http://127.0.0.1:8080/ipfs",
    process.env.IPFS_GATEWAY       || "https://ipfs.io/ipfs"
  ];

  for (const gateway of gateways) {
    const url = `${gateway}/${cidPath}`;
    console.debug("[IPFS] Trying:", url);

    try {
      const res = await axios.get(url, {
        responseType: "arraybuffer",
        headers: { "User-Agent": "Mozilla/5.0" },
        timeout: 5000
      });
      const buf = Buffer.from(res.data);
      console.debug(`[IPFS] ✅ Downloaded ${buf.length} bytes from ${gateway}`);
      return buf;
    } catch (err) {
      console.warn(`[IPFS] ❌ Failed via ${gateway}:`, err.message);
    }
  }

  // Fallback: wget to /tmp
  const finalUrl = `${gateways[1]}/${cidPath}`;
  const tmpPath = `/tmp/ipfs_${Date.now()}`;
  console.warn("[IPFS] ⏳ Fallback to wget:", finalUrl);

  try {
    await execAsync(`wget -q -O ${tmpPath} ${finalUrl}`);
    const buf = await fs.readFile(tmpPath);
    console.debug("[IPFS] ✅ Downloaded", buf.length, "bytes (wget)");
    return buf;
  } catch (wgetErr) {
    console.error("[IPFS] ❌ Wget failed:", wgetErr.message);
    throw new Error(`All IPFS downloads failed for ${cidPath}`);
  }
}
