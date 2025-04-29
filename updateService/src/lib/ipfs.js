/*  server/src/services/ipfs.service.js
 *  -----------------------------------
 *  Upload via local IPFS daemon
 *  Download via public gateway (ipfs.io or configured)
 */

import { create } from "ipfs-http-client";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

// 1. Create IPFS client for upload (local daemon)
const ipfs = create({
  host:     process.env.IPFS_HOST || "localhost",
  port:     process.env.IPFS_PORT || 5001,
  protocol: process.env.IPFS_PROTO || "http"
});

// 2. Upload → returns CID string
export async function uploadFile(buffer) {
  console.debug("[IPFS] Uploading", buffer.length, "bytes …");
  const { cid } = await ipfs.add(buffer);
  const cidStr = cid.toString();
  console.debug("[IPFS] Added → CID =", cidStr);
  return cidStr;
}

//3. Download from public gateway (with proper headers)
export async function downloadFile(cid) {
  const gateway = process.env.IPFS_GATEWAY || "https://ipfs.io/ipfs";
  const url = `${gateway}/${cid}`;

  console.debug("[IPFS] Downloading from:", url);

  try {
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent": "Mozilla/5.0" // <== thêm dòng này
      }
    });

    const buf = Buffer.from(res.data);
    console.debug("[IPFS] Downloaded", buf.length, "bytes");
    return buf;
  } catch (err) {
    console.error("[IPFS] Download failed:", err.message);
    throw new Error(`Failed to download from IPFS gateway: ${url}`);
  }
}

