// src/core/dispatcher.js
// ------------------------------------------------------------------
// Lắng nghe sự kiện NewFirmware(version) từ smart contract,
// xử lý phân phối OTA nếu firmware hợp lệ
// ------------------------------------------------------------------

import { Firmware, Device } from "../web3/index.js";
import { downloadFile } from "../lib/ipfs.js";
import { decryptForDevice } from "./decrypt.js";
import { publishUpdate } from "../mqtt/client.js";
import dotenv from "dotenv";
dotenv.config();

/**
 * Khởi động dispatcher — đăng ký lắng nghe sự kiện NewFirmware
 */
export default async function startDispatcher() {
  console.log("[Dispatcher] Initializing subscription to NewFirmware events...");

  try {
    // (B0) Kiểm tra contract instance
    const subscription = Firmware.events.NewFirmware();
    if (!subscription || typeof subscription.subscribe !== "function") {
      throw new Error("Firmware contract instance is invalid or not using WebSocket provider!");
    }

    // (B1) Đăng ký lắng nghe event NewFirmware
    subscription.subscribe({
      // (B2) Khi có sự kiện mới phát hành firmware
      next: async (event) => {
        const meta = event.returnValues;
        console.log(`[Dispatcher] 📦 NewFirmware: version=${meta.version}, CID=${meta.CID}`);

        try {
          // (B3) Truy vấn metadata đầy đủ từ smart contract
          const fwMeta = await Firmware.methods.getFirmware(meta.version).call();
          const fullMeta = { ...fwMeta, version: meta.version };

          // (B4) Tải firmware mã hóa từ IPFS
          const cipherPkg = await downloadFile(fullMeta.CID);

          // (B5) Truy vấn danh sách thiết bị thuộc deviceType tương ứng
          const allDevices = await Device.methods.getAllDevices().call();
          const targets = allDevices
            .filter(d => d.deviceType === fullMeta.deviceType)
            .map(d => ({
              deviceId: d.deviceId,
              pubKey: d.pubKey,
              privPath: `${process.env.DEVICE_KEY_DIR}/${d.deviceId}.priv`,
            }));

          if (targets.length === 0) {
            console.warn(`[Dispatcher] ⚠️ No devices found for type ${fullMeta.deviceType}`);
            return;
          }

          // (B6) Lặp qua từng thiết bị để gửi lệnh OTA nếu giải mã thành công
          let success = 0;
          for (const dev of targets) {
            try {
              await decryptForDevice(fullMeta, cipherPkg, dev);

              publishUpdate(dev.deviceId, {
                command: "OTA_START",
                version: fullMeta.version,
                keyID: fullMeta.keyID,
                CID: fullMeta.CID,
              });

              success++;
            } catch (err) {
              console.warn(`[Dispatcher] ❌ Decryption failed for ${dev.deviceId}:`, err.message);
            }
          }

          // (B7) Log tổng kết
          console.log(`[Dispatcher] ✅ Firmware ${fullMeta.version} dispatched to ${success}/${targets.length} devices.`);
        } catch (err) {
          console.error("[Dispatcher] ❌ Firmware processing failed:", err.message);
        }
      },

      // (B8) Nếu có lỗi khi lắng nghe sự kiện
      error: (err) => {
        console.error("[Dispatcher] 🔥 Subscription error:", err.message);
      }
    });
  } catch (err) {
    console.error("[Dispatcher] ❌ Dispatcher setup failed:", err.message);
  }
}
