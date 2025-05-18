// src/core/dispatcher.js

import dotenv from "dotenv";
dotenv.config();

import { createRequire } from "module";
import mqttClient         from "../mqtt/client.js";

import { web3, Firmware, Device, KeyRegistry, sendTx }
  from "../web3/index.js";

import { downloadFile }      from "../lib/ipfs.js";
import { deriveGroupKey, deriveWrapPrivKey }
  from "../lib/key_service.js";
import { eciesDecrypt, aesGcmDecrypt, verifySig, sha256 }
  from "../lib/crypto.js";

// load DeviceConfiguration.json
const requireConfig = createRequire(import.meta.url);
const deviceConfigs = requireConfig("../config/DeviceConfiguration.json");

// gateway must hold GATEWAY_ROLE on DeviceRegistry
const GATEWAY_ADDR = process.env.GATEWAY_ADDRESS;
if (!GATEWAY_ADDR) throw new Error("Missing GATEWAY_ADDRESS in .env");

/**
 * Start polling for NewFirmware events and subscribing to OTA reports.
 */
export default async function startDispatcher() {
  console.log("[Dispatcher] 🚀 Initializing…");

  // 1) Connect MQTT first
  await mqttClient.connectMQTT();
  console.log("[Dispatcher] ✅ MQTT connected");

  // 2) Subscribe to OTA report topic
  mqttClient.subscribe("ota/report/#", err => {
    if (err) console.error("[Dispatcher] MQTT subscribe error:", err.message);
  });
  mqttClient.on("message", handleOtaReport);

  // 3) Grab the current block as our cursor
  let lastBlock = await web3.eth.getBlockNumber();
  console.log(`[Dispatcher] starting from block #${lastBlock}`);

  // 4) Every 2s, poll for NewFirmware events
  setInterval(async () => {
    try {
      const current = await web3.eth.getBlockNumber();
      if (current <= lastBlock) return;

      const events = await Firmware.getPastEvents("NewFirmware", {
        fromBlock: lastBlock + 1n,
        toBlock:   current
      });

      for (const evt of events) {
        await processNewFirmware(evt.returnValues);
      }

      lastBlock = current;
    } catch (err) {
      console.error("[Dispatcher] polling error:", err.message);
    }
  }, 2000);
}

/**
 * Handle a NewFirmware event payload:
 * - derive/unwind keys
 * - decrypt + verify
 * - publish MQTT OTA_START
 */
async function processNewFirmware({
  version, cid, keyID, hash, signature, deviceType
}) {
  console.log(`\n[Dispatcher] 🔔 NewFirmware v=${version} type=${deviceType} CID=${cid}`);

  try {

    const mfBuf       = await downloadFile(`${cid}/manifest.json`);
    const {version: manifestVersion, cidWrap, cidCipher } = JSON.parse(mfBuf.toString());
    
    // 1️⃣ derive group‐key & verify keyID
    const { aesGroupKey, keyID: derivedID } = deriveGroupKey(manifestVersion, deviceType);
    if (derivedID !== keyID) throw new Error("keyID mismatch");

    // 2️⃣ ensure on‐chain & not revoked
    const info = await KeyRegistry.methods.keys(keyID).call();
    if (info.created === "0") {
      console.log("[Dispatcher] ➕ registering group key");
      await sendTx(
        KeyRegistry.methods.addKey(keyID, sha256(aesGroupKey)),
        { from: GATEWAY_ADDR }
      );
      console.log("    ✅ key registered");
    }
    if (info.revoked) {
      console.warn(`[Dispatcher] ⚠ key ${keyID} revoked, skipping`);
      return;
    }

    // 3️⃣ fetch manifest + cipher blobs
    const wrapBuf     = await downloadFile(cidWrap);
    const cipherBuf   = await downloadFile(cidCipher);

    // 4️⃣ unwrap session‐key
    const privWrapKey = deriveWrapPrivKey(manifestVersion, deviceType);
    const sessKey     = eciesDecrypt(privWrapKey, wrapBuf);

    // 5️⃣ decrypt firmware
    const firmware = aesGcmDecrypt(cipherBuf, sessKey);

    // 6️⃣ verify hash & signature
    const localHashHex = "0x" + sha256(firmware).toString("hex");
    if (localHashHex !== hash) throw new Error("hash mismatch");
    if (!verifySig(Buffer.from(hash.slice(2), "hex"), signature, process.env.MFG_PUB_KEY)) {
      throw new Error("invalid signature");
    }

    // 7️⃣ select auto‐update targets
    const allDevices = await Device.methods.getAllDevices().call();
    const targets = allDevices.filter(d => {
      const cfg = deviceConfigs[d.deviceId];
      return cfg && cfg.autoUpdate && cfg.deviceType === deviceType;
    });

    if (!targets.length) {
      console.warn(`[Dispatcher] ⚠ no auto-update targets for ${deviceType}`);
      return;
    }

    // 8️⃣ publish OTA_START to each
    for (const d of targets) {
      const topic   = `ota/${d.deviceId}`;
      const payload = { command:"OTA_START", manifestVersion, cid, keyID, hash, signature };
      await mqttClient.publishUpdate(d.deviceId, payload);
      console.log(`[Dispatcher] ➡ OTA_START → ${d.deviceId}`);
    }

  } catch (err) {
    console.error(`[Dispatcher] ✖ v=${version} error:`, err.message);
  }
}

/**
 * Handle incoming OTA report messages and update on-chain status.
 */
async function handleOtaReport(topic, msgBuf) {
  try {
    // topic form: "ota/report/<deviceId>"
    const [, , deviceId] = topic.split("/");
    const { version, OK } = JSON.parse(msgBuf.toString());
    if (!OK) {
      console.warn(`[Dispatcher] 🚨 OTA failed on ${deviceId}`);
      return;
    }

    console.log(`[Dispatcher] 📣 OTA OK from ${deviceId}, v=${version}`);
    await sendTx(
      Device.methods.updateDeviceStatus(deviceId, version),
      { from: GATEWAY_ADDR }
    );
    console.log(`[Dispatcher] ✅ status updated on-chain for ${deviceId}`);
  } catch (err) {
    console.error("[Dispatcher] report handler error:", err.message);
  }
}
