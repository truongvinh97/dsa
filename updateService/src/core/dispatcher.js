// dispatcher.js
// ------------------------------------------------------------------
// Lắng nghe sự kiện NewFirmware(version) từ smart contract,
// xử lý phân phối OTA nếu firmware hợp lệ
// ------------------------------------------------------------------

import { Firmware, Device }    from "../web3/index.js";
import { downloadFile }        from "../lib/ipfs.js";
import { decryptForDevice }    from "./decrypt.js";
import { publishUpdate }       from "../mqtt/client.js";
import { getDeviceList }       from "../web3/devices.js"; // optional if custom device fetch
import dotenv from "dotenv"; dotenv.config();

/**
 * Khởi động dispatcher — đăng ký lắng nghe sự kiện NewFirmware
 */
export default async function startDispatcher() {
  console.log("[Dispatcher] Start listening for NewFirmware events…");

  Firmware.events.NewFirmware({}, async (error, event) => {
    if (error) {
      console.error("[Dispatcher] Event error:", error);
      return;
    }

    const meta = event.returnValues;
    console.log(`[Dispatcher] Event NewFirmware → version=${meta.version}, CID=${meta.CID}`);

    try {
      // 1. Gọi contract để lấy metadata đầy đủ
      const fwMeta = await Firmware.methods.getFirmware(meta.version).call();
      const fullMeta = {
        ...fwMeta,
        version: meta.version,
      };

      // 2. Tải gói firmware mã hóa từ IPFS
      const cipherPkg = await downloadFile(fullMeta.CID); // Buffer

      // 3. Lấy danh sách thiết bị tương ứng với deviceType
      const allDevices = await Device.methods.getAllDevices().call();
      const targets = allDevices
        .filter(d => d.deviceType === fullMeta.deviceType)
        .map(d => ({
          deviceId:  d.deviceId,
          pubKey:    d.pubKey,
          privPath:  `${process.env.DEVICE_KEY_DIR}/${d.deviceId}.priv`,
        }));

      if (targets.length === 0) {
        console.warn(`[Dispatcher] No device matched for type ${fullMeta.deviceType}`);
        return;
      }

      // 4. Gửi firmware cho từng thiết bị (sau khi xác thực thành công)
      let success = 0;
      for (const dev of targets) {
        try {
          await decryptForDevice(fullMeta, cipherPkg, dev);
          publishUpdate(dev.deviceId, {
            command: "OTA_START",
            version: fullMeta.version,
            keyID:   fullMeta.keyID,
            CID:     fullMeta.CID
          });
          success++;
        } catch (e) {
          console.warn(`[Dispatcher] ${dev.deviceId}: ${e.message}`);
        }
      }

      console.log(`[Dispatcher] Dispatched version ${fullMeta.version} → ${success}/${targets.length} device(s)`);
    } catch (err) {
      console.error("[Dispatcher] Failed to dispatch firmware:", err);
    }
  });
}
