/**
 *  server/src/services/ipfs.service.js
 *  -----------------------------------
 *  Upload via local IPFS daemon
 *  Download via public gateway (axios + fallback wget)
 */

import { create } from "ipfs-http-client";
import axios from "axios";
import dotenv from "dotenv";
import fs from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
dotenv.config();

const execAsync = promisify(exec);

// 1. Create IPFS client for upload (local daemon)
const ipfs = create({
  host:     process.env.IPFS_HOST || "localhost",
  port:     process.env.IPFS_PORT || 5001,
  protocol: process.env.IPFS_PROTO || "http"
});

// 2. Upload file buffer → returns CID string
export async function uploadFile(buffer) {
  console.debug("[IPFS] Uploading", buffer.length, "bytes …");
  const { cid } = await ipfs.add(buffer);
  const cidStr = cid.toString();
  console.debug("[IPFS] Added → CID =", cidStr);
  return cidStr;
}

// 3. Download file buffer from IPFS (via axios + fallback wget)
export async function downloadFile(cid) {
  const gateway = process.env.IPFS_GATEWAY || "https://ipfs.io/ipfs";
  const url = `${gateway}/${cid}`;

  console.debug("[IPFS] Downloading from:", url);

  try {
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent": "Mozilla/5.0"
      },
      timeout: 8000
    });

    const buf = Buffer.from(res.data);
    console.debug("[IPFS] ✅ Downloaded", buf.length, "bytes (axios)");
    return buf;
  } catch (err) {
    console.warn("[IPFS] ⚠️ Axios failed:", err.message);
    console.warn("[IPFS] ⏳ Fallback to wget…");

    const tmpPath = `/tmp/${cid}`;
    try {
      await execAsync(`wget -q -O ${tmpPath} ${url}`);
      const buf = await fs.readFile(tmpPath);
      console.debug("[IPFS] ✅ Downloaded", buf.length, "bytes (wget)");
      return buf;
    } catch (wgetErr) {
      console.error("[IPFS] ❌ Wget failed:", wgetErr.message);
      throw new Error(`Failed to download from IPFS gateway: ${url}`);
    }
  }
}
