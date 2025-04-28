// src/index.js
// ------------------------------------------------------------------
// Entry-point cho hệ thống update-service trên Raspberry Pi
// ------------------------------------------------------------------

import dotenv from "dotenv";
dotenv.config(); // Load .env trước tiên

import { connectMQTT } from "./mqtt/client.js";
import startDispatcher from "./core/dispatcher.js";

/**
 * Hàm khởi động hệ thống chính
 */
async function main() {
  try {
    console.log("🚀 [UpdateService] Starting update-service...");

    // 1. Kết nối đến MQTT broker
    console.log("[UpdateService] Connecting to MQTT broker...");
    await connectMQTT();
    console.log("[UpdateService] MQTT connected successfully.");

    // 2. Khởi động Dispatcher để lắng nghe sự kiện NewFirmware
    await startDispatcher();

    console.log("✅ [UpdateService] Service is up and running.");
  } catch (err) {
    console.error("🔥 [UpdateService] Startup error:", err);
    process.exit(1); // Thoát nếu lỗi khởi động
  }
}

// ------------------------------------------------------------------
// Catch toàn bộ lỗi chưa bắt được để không crash bất ngờ
// ------------------------------------------------------------------
process.on("unhandledRejection", (reason, promise) => {
  console.error("🛑 Unhandled Rejection at:", promise, "reason:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("🛑 Uncaught Exception:", err);
  process.exit(1);
});

// ------------------------------------------------------------------
// Start
// ------------------------------------------------------------------
main();
