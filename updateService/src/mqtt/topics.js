// mqtt/topics.js
// --------------------------------------
// Topic utilities for OTA & report flows
// Example topics:
//   ota/DEV-001
//   report/DEV-001
// --------------------------------------

/**
 * Generate OTA update topic for a specific device.
 * @param {string} deviceId - Device identifier (e.g., "DEV-001")
 * @returns {string} Topic string (e.g., "ota/DEV-001")
 */
export function otaTopic(deviceId) {
  return `ota/${deviceId}`;
}

/**
 * Generate report topic for a specific device.
 * Used when devices send back status (e.g., "received", "flashed", "error").
 * @param {string} deviceId
 * @returns {string} Topic string (e.g., "report/DEV-001")
 */
export function reportTopic(deviceId) {
  return `report/${deviceId}`;
}

/**
 * Extract deviceId from OTA topic
 * @param {string} topic - Full MQTT topic (e.g., "ota/DEV-001")
 * @returns {string|null} Device ID or null if not matched
 */
export function extractDeviceId(topic) {
  const match = topic.match(/^(?:ota|report)\/(.+)$/);
  return match ? match[1] : null;
}
