/*  server/src/services/ipfs.service.js
 *  -----------------------------------
 *  Upload via local IPFS daemon
 *  Download via public gateway (ipfs.io)
 */

import { create } from "ipfs-http-client";
import axios from "axios";

const ipfs = create({
  host:     process.env.IPFS_HOST || "localhost",
  port:     process.env.IPFS_PORT || 5001,
  protocol: process.env.IPFS_PROTO || "http"
});

/* Upload file buffer -> CID */
export async function uploadFile(buffer) {
  console.debug("[IPFS] Uploading", buffer.length, "bytes …");
  const { cid } = await ipfs.add(buffer);
  console.debug("[IPFS] Added, CID =", cid.toString());
  return cid.toString(); // just the base58 string
}

/* Download file via public gateway */
export async function downloadFile(cid) {
  console.debug("[IPFS] Download via gateway:", cid);
  const url = `https://ipfs.io/ipfs/${cid}`;
  const res = await axios.get(url, { responseType: "arraybuffer" });
  const buf = Buffer.from(res.data);
  console.debug("[IPFS] Downloaded", buf.length, "bytes");
  return buf;
}
