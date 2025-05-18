import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

const MASTER_SECRET = Buffer.from(process.env.MASTER_SECRET, "hex");
const PUB_WRAP      = process.env.LOCAL_XPUB;
const PRIV_WRAP     = process.env.LOCAL_XPRV;

export function deriveGroupKey(version, deviceType) {
  const id = `${version}|${deviceType}`;
  const aesGroupKey = crypto
    .createHmac("sha256", MASTER_SECRET)
    .update(id)
    .digest();
  const keyID = /* keccak256 hex từ aesGroupKey */;
  return { keyID, aesGroupKey, pubWrapKey: PUB_WRAP };
}

export function deriveWrapPrivKey(/*…*/) {
  return PRIV_WRAP;
}
