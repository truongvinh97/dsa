// src/mqtt/client.js
// ------------------------------------------------------------------
// MQTT client – publish firmware update payloads to target devices
// ------------------------------------------------------------------

import mqtt from "mqtt";
import dotenv from "dotenv";
dotenv.config();

const MQTT_URL = process.env.MQTT_URL || "mqtt://192.168.1.12:1883";

let client = null;

/**
 * Kết nối MQTT broker.
 * Gọi ở src/index.js trước khi dispatch
 */
export async function connectMQTT() {
  return new Promise((resolve, reject) => {
    client = mqtt.connect(MQTT_URL, {
      reconnectPeriod: 2000,
      keepalive:       60,
      clientId:        `ota-gateway-${Math.floor(Math.random()*10000)}`,
    });

    client.once("connect", () => {
      console.log(`[MQTT] Connected to broker at ${MQTT_URL}`);
      resolve();
    });

    client.on("error", (err) => {
      console.error("[MQTT] Connection error:", err.message);
      // sẽ tự reconnect, không reject
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
 * Gửi lệnh OTA_START tới thiết bị
 * @param {string} deviceId
 * @param {object} payload – { command, version, cid, keyID, hash, signature }
 */
export async function publishUpdate(deviceId, payload) {
  if (!client || !client.connected) {
    console.error("[MQTT] Cannot publish, client not connected");
    return;
  }
  const topic = `ota/${deviceId}`;
  const msg   = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    client.publish(topic, msg, { qos: 1 }, (err) => {
      if (err) {
        console.error(`[MQTT] Failed to publish to ${topic}:`, err.message);
        return reject(err);
      }
      console.log(`[MQTT] Published OTA to ${topic}`);
      resolve();
    });
  });
}

/**
 * Đăng ký subscribe cho message từ thiết bị (OTA report)
 * @param {string} topic
 * @param {Function} cb – callback (err) => void
 */
export function subscribe(topic, cb) {
  if (!client) throw new Error("[MQTT] subscribe() before connect");
  client.subscribe(topic, cb);
}

/**
 * Lắng nghe các event MQTT, ví dụ 'message'
 * @param {string} event
 * @param {Function} cb – callback (topic, message) => void
 */
export function on(event, cb) {
  if (!client) throw new Error("[MQTT] on() before connect");
  client.on(event, cb);
}

/**
 * Mặc định export một object để bạn xài:
 *
 * import mqttClient from "../mqtt/client.js";
 * await mqttClient.connectMQTT();
 * mqttClient.subscribe(...);
 * mqttClient.on("message", ...);
 * mqttClient.publishUpdate(...);
 */
export default {
  connectMQTT,
  publishUpdate,
  subscribe,
  on
};
