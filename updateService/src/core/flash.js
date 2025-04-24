// flash.js
// -----------------------------------------------------------
// Tùy chọn: ghi firmware vào thiết bị thông qua MQTT hoặc
// SCP/serial nếu cần flash từ Pi trực tiếp.
// -----------------------------------------------------------

import fs from "fs/promises";
import { exec } from "child_process";
import { publishUpdate } from "../mqtt/client.js";

/**
 * Tùy chọn: Ghi file firmware vào thư mục tạm
 * @param {Buffer} firmwareBuf - Dữ liệu firmware đã giải mã
 * @param {string} filename - Tên file cần lưu
 * @returns {Promise<string>} - Đường dẫn tạm đã ghi
 */
export async function saveFirmwareToFile(firmwareBuf, filename = "firmware.bin") {
  const path = `/tmp/${filename}`;
  await fs.writeFile(path, firmwareBuf);
  console.log(`[Flash] Saved firmware to ${path}`);
  return path;
}

/**
 * Gửi firmware qua SCP đến thiết bị có IP nhất định
 * @param {string} ip - Địa chỉ IP của thiết bị
 * @param {string} localPath - Đường dẫn file firmware
 * @param {string} remotePath - Nơi lưu trên thiết bị
 */
export function flashViaSCP(ip, localPath, remotePath = "/tmp/firmware.bin") {
  const cmd = `scp ${localPath} pi@${ip}:${remotePath}`;
  exec(cmd, (err, stdout, stderr) => {
    if (err) {
      console.error(`[Flash:SCP] Failed to flash ${ip}:`, stderr);
    } else {
      console.log(`[Flash:SCP] Firmware sent to ${ip}`);
    }
  });
}

/**
 * Gửi firmware qua MQTT đến thiết bị để ghi xuống flash
 * (thiết bị nhận và tự xử lý flash)
 * @param {string} deviceId - ID của thiết bị
 * @param {Buffer} firmwareBuf - Dữ liệu firmware
 */
export function flashViaMQTT(deviceId, firmwareBuf) {
  // Chia nhỏ theo chunk nếu cần (tuỳ device xử lý)
  const hex = firmwareBuf.toString("hex").toUpperCase();
  publishUpdate(deviceId, {
    command: "OTA_FLASH",
    data: hex,
    last: true
  });
  console.log(`[Flash:MQTT] Published OTA_FLASH → ${deviceId}`);
}
