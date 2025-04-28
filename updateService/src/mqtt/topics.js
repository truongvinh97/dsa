// src/mqtt/topics.js
// ------------------------------------------------------------------
// MQTT topic utilities for OTA update and device status reporting
// Example topics:
//   ota/DEV-001      → gateway → device
//   report/DEV-001   → device → gateway
// ------------------------------------------------------------------

/**
 * Generate MQTT topic for OTA update to a specific device.
 * @param {string} deviceId - Unique device identifier (e.g., "DEV-001")
 * @returns {string|null} Topic string ("ota/DEV-001") or null if invalid input
 */
export function otaTopic(deviceId) {
  if (typeof deviceId !== "string" || deviceId.length === 0) return null;
  return `ota/${deviceId}`;
}

/**
 * Generate MQTT topic for device report messages.
 * @param {string} deviceId - Unique device identifier
 * @returns {string|null} Topic string ("report/DEV-001") or null if invalid
 */
export function reportTopic(deviceId) {
  if (typeof deviceId !== "string" || deviceId.length === 0) return null;
  return `report/${deviceId}`;
}

/**
 * Extract deviceId from a topic.
 * Matches topics starting with "ota/" or "report/".
 * @param {string} topic - Full MQTT topic (e.g., "ota/DEV-001")
 * @returns {string|null} Extracted deviceId or null if not matched
 */
export function extractDeviceId(topic) {
  if (typeof topic !== "string") return null;
  const match = topic.match(/^(?:ota|report)\/(.+)$/);
  return match ? match[1] : null;
}

/**
 * Check if a topic is an OTA topic
 * @param {string} topic
 * @returns {boolean}
 */
export function isOtaTopic(topic) {
  return typeof topic === "string" && topic.startsWith("ota/");
}

/**
 * Check if a topic is a report topic
 * @param {string} topic
 * @returns {boolean}
 */
export function isReportTopic(topic) {
  return typeof topic === "string" && topic.startsWith("report/");
}
