// src/core/dispatcher.js
// ------------------------------------------------------------------
// Lắng nghe sự kiện NewFirmware(version) từ smart contract,
// xử lý phân phối OTA nếu firmware hợp lệ
// ------------------------------------------------------------------

import { Firmware, Device } from "../web3/index.js";
import { downloadFile } from "../lib/ipfs.js";
import { decryptForDevice } from "./decrypt.js";
import { publishUpdate } from "../mqtt/client.js";
import dotenv from "dotenv"; dotenv.config();

/**
 * Khởi động Dispatcher — đăng ký lắng nghe sự kiện NewFirmware
 */
export default async function startDispatcher() {
  try {
    console.log("[Dispatcher] Initializing subscription to NewFirmware events…");

    // Check nếu contract chưa load hoặc address sai
    if (!Firmware || !Firmware.options || !Firmware.options.address) {
      console.error("[Dispatcher] Firmware contract instance invalid!");
      return;
    }

    console.log("[Dispatcher] Firmware Contract Address:", Firmware.options.address);

    // Đăng ký event listener
    Firmware.events.NewFirmware(
      {},
      (error, event) => {
        if (error) {
          console.error("[Dispatcher] Event callback error:", error);
          return;
        }

        console.log("[Dispatcher] Callback triggered with event:", JSON.stringify(event, null, 2));

        if (!event || !event.returnValues) {
          console.warn("[Dispatcher] Event has no returnValues, skip processing.");
          return;
        }

        handleNewFirmwareEvent(event.returnValues);
      }
    )
    .on('connected', (subscriptionId) => {
      console.log(`[Dispatcher] Successfully subscribed, subscriptionId = ${subscriptionId}`);
    })
    .on('data', (event) => {
      console.log("[Dispatcher] Event 'data' received:", JSON.stringify(event, null, 2));
    })
    .on('error', (err) => {
      console.error("[Dispatcher] Event stream error:", err);
    });

  } catch (e) {
    console.error("[Dispatcher] Fatal error during subscription:", e);
  }
}

/**
 * Xử lý event NewFirmware nhận được
 */
async function handleNewFirmwareEvent(meta) {
  console.log(`[Dispatcher] Handling NewFirmware → version=${meta.version}, CID=${meta.CID}`);

  try {
    // 1. Gọi contract FirmwareRegistry để lấy metadata đầy đủ
    const fwMeta = await Firmware.methods.getFirmware(meta.version).call();
    const fullMeta = {
      ...fwMeta,
      version: meta.version,
    };
    console.log("[Dispatcher] Retrieved metadata:", fullMeta);

    // 2. Tải gói firmware mã hóa từ IPFS
    const cipherPkg = await downloadFile(fullMeta.CID);
    console.log(`[Dispatcher] Downloaded cipherPkg (${cipherPkg.length} bytes)`);

    // 3. Lấy danh sách các thiết bị cùng loại deviceType
    const allDevices = await Device.methods.getAllDevices().call();
    console.log(`[Dispatcher] Retrieved ${allDevices.length} devices`);

    const targets = allDevices
      .filter(d => d.deviceType === fullMeta.deviceType)
      .map(d => ({
        deviceId: d.deviceId,
        pubKey: d.pubKey,
        privPath: `${process.env.DEVICE_KEY_DIR}/${d.deviceId}.priv`,
      }));

    if (targets.length === 0) {
      console.warn(`[Dispatcher] No devices match deviceType ${fullMeta.deviceType}`);
      return;
    }
    console.log(`[Dispatcher] Found ${targets.length} target devices.`);

    // 4. Gửi firmware cho từng thiết bị sau khi xác thực thành công
    let success = 0;
    for (const dev of targets) {
      try {
        await decryptForDevice(fullMeta, cipherPkg, dev);

        publishUpdate(dev.deviceId, {
          command: "OTA_START",
          version: fullMeta.version,
          keyID:   fullMeta.keyID,
          CID:     fullMeta.CID,
        });

        console.log(`[Dispatcher] OTA_START sent to device ${dev.deviceId}`);
        success++;
      } catch (e) {
        console.warn(`[Dispatcher] Device ${dev.deviceId} decryption failed: ${e.message}`);
      }
    }

    console.log(`[Dispatcher] Finished dispatch: ${success}/${targets.length} devices updated.`);

  } catch (err) {
    console.error("[Dispatcher] Error during firmware dispatch process:", err);
  }
}
