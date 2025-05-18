// src/core/dispatcher.js

import dotenv from "dotenv";
dotenv.config();

import Web3 from "web3";
import { createRequire } from "module";
import { mqttClient } from "./mqtt/client.js";

import {
  web3,
  Firmware,
  Device,
  KeyRegistry,
  sendTx
} from "../web3/index.js";

import { downloadFile } from "../lib/ipfs.js";
import {
  deriveGroupKey,
  deriveWrapPrivKey
} from "../lib/key_service.js";
import {
  eciesDecrypt,
  aesGcmDecrypt,
  verifySig,
  sha256
} from "../lib/crypto.js";

// load DeviceConfiguration.json
const require = createRequire(import.meta.url);
const deviceConfigs = require("../config/DeviceConfiguration.json");

// gateway must hold GATEWAY_ROLE on DeviceRegistry
const GATEWAY_ADDR = process.env.GATEWAY_ADDRESS;
if (!GATEWAY_ADDR) throw new Error("Missing GATEWAY_ADDRESS in .env");

// initialize block cursor
let lastBlock = await web3.eth.getBlockNumber();
console.log(`[Dispatcher] starting from block #${lastBlock}`);

// ── A) Polling NewFirmware ────────────────────────────────────────
async function pollNewFirmware() {
  const current = await web3.eth.getBlockNumber();
  if (current <= lastBlock) return;

  const events = await Firmware.getPastEvents("NewFirmware", {
    fromBlock: lastBlock + 1n,
    toBlock:   current
  });

  for (const evt of events) {
    const { version, cid, keyID, hash, signature, deviceType } =
      evt.returnValues;

    console.log(`\n[Dispatcher] 🔔 NewFirmware v=${version} type=${deviceType} CID=${cid}`);

    try {
      // 1️⃣ derive group‐key & verify keyID
      const { aesGroupKey, keyID: derivedID } = deriveGroupKey(version, deviceType);
      if (derivedID !== keyID) throw new Error("keyID mismatch");

      // 2️⃣ ensure on‐chain & not revoked
      const info = await KeyRegistry.methods.keys(keyID).call();
      if (info.created === "0") {
        console.log("[Dispatcher] ➕ Adding group key on-chain");
        await sendTx(
          KeyRegistry.methods.addKey(keyID, sha256(aesGroupKey)),
          { from: GATEWAY_ADDR }
        );
        console.log("    ✅ key registered");
      }
      if (info.revoked) {
        console.warn(`[Dispatcher] ⚠ keyID ${keyID} revoked → skip v=${version}`);
        continue;
      }

      // 3️⃣ fetch manifest + cipher
      const mfBuf       = await downloadFile(`${cid}/manifest.json`);
      const { cidWrap, cidCipher } = JSON.parse(mfBuf.toString());
      const wrapBuf     = await downloadFile(cidWrap);
      const cipherBuf   = await downloadFile(cidCipher);

      // 4️⃣ unwrap session‐key
      const privWrapKey = deriveWrapPrivKey(version, deviceType);
      const sessKey     = eciesDecrypt(privWrapKey, wrapBuf);

      // 5️⃣ decrypt firmware
      const firmware = aesGcmDecrypt(cipherBuf, sessKey);

      // 6️⃣ verify hash & signature
      const localHashHex = "0x" + sha256(firmware).toString("hex");
      if (localHashHex !== hash) throw new Error("hash mismatch");
      if (!verifySig(Buffer.from(hash.slice(2), "hex"), signature, process.env.MFG_PUB_KEY)) {
        throw new Error("invalid signature");
      }

      // 7️⃣ filter on-chain devices by config.autoUpdate + type
      const allDevices = await Device.methods.getAllDevices().call();
      const targets = allDevices.filter(d => {
        const cfg = deviceConfigs[d.deviceId];
        return cfg && cfg.autoUpdate && cfg.deviceType === deviceType;
      });

      if (targets.length === 0) {
        console.warn(`[Dispatcher] ⚠ no auto-update targets for ${deviceType}`);
      } else {
        // 8️⃣ publish OTA_START via MQTT
        for (const d of targets) {
          const topic   = `ota/${d.deviceId}`;
          const payload = {
            command:   "OTA_START",
            version,
            cid,
            keyID,
            hash,
            signature
          };
          mqttClient.publish(topic, JSON.stringify(payload));
          console.log(`[Dispatcher] ➡ MQTT ${topic}`);
        }
      }

    } catch (err) {
      console.error(`[Dispatcher] ❌ failed v=${version}:`, err.message);
    }
  }

  lastBlock = current;
}

// start polling every 2s
setInterval(() => {
  pollNewFirmware().catch(e => console.error("[Dispatcher] poll error:", e.message));
}, 2000);

// ── B) Listen for OTA reports ────────────────────────────────────
mqttClient.subscribe("ota/report/#", err => {
  if (err) console.error("[Dispatcher] MQTT subscribe error:", err.message);
});

mqttClient.on("message", async (topic, msg) => {
  try {
    // topic = "ota/report/<deviceId>"
    const [, , deviceId] = topic.split("/");
    const { version, OK } = JSON.parse(msg.toString());
    if (!OK) return console.warn(`[Dispatcher] 🚨 OTA failed on ${deviceId}`);

    console.log(`[Dispatcher] 📣 OTA OK from ${deviceId}, v=${version}`);

    // send on-chain status update
    await sendTx(
      Device.methods.updateDeviceStatus(deviceId, version),
      { from: GATEWAY_ADDR }
    );
    console.log(`[Dispatcher] ✅ updateDeviceStatus(${deviceId},${version}) sent`);

  } catch (e) {
    console.error("[Dispatcher] report handler error:", e.message);
  }
});

