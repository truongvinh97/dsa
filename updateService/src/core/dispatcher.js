// src/core/dispatcher.js
// -----------------------------------------------------------------------------
// Dispatcher (Polling Version) - For HTTP-only RPC (e.g., Ganache GUI)
// Periodically queries the blockchain for new firmware release events.
// -----------------------------------------------------------------------------

import { Firmware, Device } from "../web3/index.js";
import { downloadFile } from "../lib/ipfs.js";
import { decryptForDevice } from "./decrypt.js";
import { publishUpdate } from "../mqtt/client.js";
import dotenv from "dotenv";
import Web3 from "web3";
dotenv.config();

// Create a Web3 instance for RPC connection
const RPC_URL = "ws://192.168.1.24:7545";
const web3 = new Web3(RPC_URL);

// Initialize block tracking
let lastBlock = await web3.eth.getBlockNumber();

/**
 * Start the dispatcher service:
 * Periodically polls for NewFirmware events every 2 seconds,
 * validates the firmware, and dispatches updates to target devices.
 */
export default async function startDispatcher() {
  console.log("[Dispatcher] Polling NewFirmware events...");

  setInterval(async () => {
    try {
      // (1) Get the latest block number
      const currentBlock = await web3.eth.getBlockNumber();

      // (2) Query all NewFirmware events from lastBlock + 1 to currentBlock
      const events = await Firmware.getPastEvents("NewFirmware", {
        fromBlock: lastBlock + 1n,
        toBlock: currentBlock
      });

      // (3) Process each new firmware event
      for (const event of events) {
        const meta = event.returnValues;
        console.log(`[Dispatcher] 📦 NewFirmware detected: version=${meta.version}, CID=${meta.cid}`);

        try {
          // (4) Query full metadata (keyID, signature, hash, deviceType) from the smart contract
          const fwMeta = await Firmware.methods.getFirmware(meta.version).call();
          const fullMeta = { ...fwMeta, version: meta.version };

          // (5) Download the encrypted firmware package from IPFS
          const cipherPkg = await downloadFile(fullMeta.cid);

          // (6) Get all registered devices
          const devices = await Device.methods.getAllDevices().call();

          // (7) Filter devices matching the required deviceType
          const targets = devices
            .filter(d => d.deviceType === fullMeta.deviceType)
            .map(d => ({
              deviceId: d.deviceId,
              pubKey: d.pubKey,
              privPath: `${process.env.DEVICE_KEY_DIR}/${d.deviceId}.priv`,
            }));

          if (targets.length === 0) {
            console.warn(`[Dispatcher] ⚠️ No devices found for deviceType=${fullMeta.deviceType}`);
            continue;
          }

          // (8) Attempt to decrypt and publish the update to each device
          let success = 0;
          for (const dev of targets) {
            try {
              await decryptForDevice(fullMeta, cipherPkg, dev);

              // Publish an OTA_START command via MQTT
              publishUpdate(dev.deviceId, {
                command: "OTA_START",
                version: fullMeta.version,
                keyID: fullMeta.keyID,
                CID: fullMeta.cid,
              });

              success++;
            } catch (err) {
              console.warn(`[Dispatcher] ❌ Failed to decrypt or dispatch for ${dev.deviceId}:`, err.message);
            }
          }

          // (9) Log the dispatch result
          console.log(`[Dispatcher] ✅ Firmware ${meta.version} dispatched to ${success}/${targets.length} devices.`);

        } catch (err) {
          console.error("[Dispatcher] ❌ Error processing firmware event:", err.message);
        }
      }

      // (10) Update last processed block number
      lastBlock = currentBlock;

    } catch (err) {
      console.error("[Dispatcher] 🔥 Polling error:", err.message);
    }
  }, 2000); // Poll every 2 seconds
}
