// mqtt/client.js
// ----------------------------------
// MQTT client to publish firmware update payloads to target devices

import mqtt from "mqtt";
import dotenv from "dotenv"; dotenv.config();

// Connect to MQTT broker (LAN broker preferred)
const client = mqtt.connect(process.env.MQTT_URL, {
  reconnectPeriod: 2000,    // reconnect every 2 seconds if disconnected
  keepalive: 60,            // keep connection alive
  clientId: `ota-gateway-${Math.floor(Math.random() * 10000)}`,
});

client.on("connect", () => {
  console.log("[MQTT] Connected to broker at", process.env.MQTT_URL);
});

client.on("error", err => {
  console.error("[MQTT] Connection error:", err.message);
});

client.on("reconnect", () => {
  console.warn("[MQTT] Attempting to reconnect...");
});

/**
 * Publish firmware metadata to device via `ota/<deviceId>`
 * @param {string} deviceId - The target device ID
 * @param {Object} payload - Object with version, CID, hash, etc.
 */
export function publishUpdate(deviceId, payload) {
  const topic = `ota/${deviceId}`;
  const message = JSON.stringify(payload);

  client.publish(topic, message, { qos: 1, retain: false }, (err) => {
    if (err) {
      console.error(`[MQTT] Failed to publish to ${topic}:`, err.message);
    } else {
      console.log(`[MQTT] Published OTA update to ${topic}`);
    }
  });
}

export default client;
