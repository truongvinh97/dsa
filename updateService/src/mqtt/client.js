// src/mqtt/client.js
// ------------------------------------------------------------------
// MQTT client - publish firmware update payloads to target devices
// ------------------------------------------------------------------

import mqtt from "mqtt";
import dotenv from "dotenv";
dotenv.config();

let client; // sẽ gán sau khi connect

/**
 * Kết nối MQTT broker.
 * Gọi ở src/index.js → connect trước khi dispatch
 */
export async function connectMQTT() {
  return new Promise((resolve, reject) => {
    client = mqtt.connect(process.env.MQTT_URL, {
      reconnectPeriod: 2000,          // Thử reconnect mỗi 2s
      keepalive: 60,                  // Ping broker mỗi 60s
      clientId: `ota-gateway-${Math.floor(Math.random() * 10000)}`,
    });

    client.on("connect", () => {
      console.log(`[MQTT] Connected to broker at ${process.env.MQTT_URL}`);
      resolve(); // báo main() đã kết nối xong
    });

    client.on("error", (err) => {
      console.error("[MQTT] Connection error:", err.message);
      // không reject ngay vì sẽ tự reconnect
    });

    client.on("reconnect", () => {
      console.warn("[MQTT] Attempting to reconnect...");
    });

    client.on("close", () => {
      console.warn("[MQTT] Connection closed");
    });
  });
}

/**
 * Publish firmware metadata to a device
 * @param {string} deviceId - Target device ID
 * @param {object} payload - Update information {version, keyID, CID}
 * @returns {Promise<void>}
 */
export async function publishUpdate(deviceId, payload) {
  if (!client || !client.connected) {
    console.error("[MQTT] Cannot publish, client not connected");
    return;
  }

  const topic = `ota/${deviceId}`;
  const message = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    client.publish(topic, message, { qos: 1, retain: false }, (err) => {
      if (err) {
        console.error(`[MQTT] Failed to publish to ${topic}:`, err.message);
        reject(err);
      } else {
        console.log(`[MQTT] Published OTA update to ${topic}`);
        resolve();
      }
    });
  });
}
