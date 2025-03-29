/**
 * updateService.js
 *
 * This script performs the following steps:
 * 1. Query the FirmwareRegistry smart contract for a new firmware version.
 * 2. Download the firmware metadata: (version, hash, cid, signature).
 * 3. Authenticate the metadata using the manufacturer’s public key.
 *    If signature verification fails, abort.
 * 4. If OK, download the firmware file from IPFS using an HTTP gateway.
 * 5. Re-compute the SHA-256 hash of the downloaded firmware and compare it with the metadata hash.
 *    If they don't match, abort.
 * 6. If the firmware is valid, publish an MQTT message to the device with the firmware version, hash, and CID.
 * 7. Log or update a "device contract" with the device’s update attempt.
 */

const Web3 = require("web3");
const fs = require("fs");
const { execSync } = require("child_process");
const crypto = require("crypto");
const mqtt = require("mqtt");

// ----------- Configuration Section -----------

// Ethereum configuration (local Ganache or testnet)
const web3 = new Web3("http://192.168.1.3:7545");

// Load FirmwareRegistry contract artifact
const contractJSON = JSON.parse(fs.readFileSync("./build/contracts/FirmwareRegistry.json", "utf8"));
const abi = contractJSON.abi;
const contractAddress = "0x7AC662Ed5264245B8df79156226435aBfD45729E";  // Replace with your deployed address
const firmwareRegistry = new web3.eth.Contract(abi, contractAddress);

// Manufacturer's public key file (for signature verification)
const manufacturerPubKeyPath = "manufacturer_public_key.pem";

// MQTT configuration
const mqttBroker = "mqtt://192.168.1.12";  // Update if your MQTT broker is elsewhere
const mqttTopic = "test";         // Topic to notify devices

// IPFS gateway URL
const ipfsGateway = "http://192.168.1.3:8080/ipfs/";

// The target firmware version to check (e.g., "0x0103")
const targetVersion = "0x0100";

// Local temporary file name for the downloaded firmware
const downloadedFirmwareFile = "downloaded_firmware.hex";

// ----------- End Configuration Section -----------


/**
 * Reads firmware metadata for a given version from the FirmwareRegistry contract.
 */
async function readFirmwareMetadata(version) {
  console.log(`Querying contract for firmware version ${version}...`);
  const info = await firmwareRegistry.methods.firmwareByVersion(version).call();
  if (!info || info.version === "") {
    console.log("No firmware metadata found for version:", version);
    return null;
  }
  console.log("Metadata retrieved:", info);
  return info;
}

/**
 * Verifies the digital signature using the manufacturer's public key.
 * This example uses Node's crypto module with RSA/ECDSA verification.
 * (Adjust the algorithm as needed to match your signing method.)
 */
function verifySignature(messageHex, signatureHex, pubKeyPath) {
  console.log("Verifying firmware metadata signature...");
  const pubKeyPem = fs.readFileSync(pubKeyPath, "utf8");
  const verifier = crypto.createVerify("sha256");
  // In this simplified example, we treat the firmware hash as the message.
  const messageBuffer = Buffer.from(messageHex.replace(/^0x/, ""), "hex");
  verifier.update(messageBuffer);
  verifier.end();
  const signatureBuffer = Buffer.from(signatureHex.replace(/^0x/, ""), "hex");
  const isValid = verifier.verify(pubKeyPem, signatureBuffer);
  console.log("Signature valid?", isValid);
  return isValid;
}

/**
 * Downloads the firmware file from IPFS using an HTTP gateway.
 */
function downloadFirmwareFromIPFS(cid, outputFile) {
  console.log(`Downloading firmware from IPFS using CID: ${cid} ...`);
  // Using curl to download from IPFS gateway
  try {
    execSync(`curl ${ipfsGateway}${cid} -o ${outputFile}`);
    console.log("Firmware downloaded to", outputFile);
    return true;
  } catch (error) {
    console.error("Error downloading firmware from IPFS:", error);
    return false;
  }
}

/**
 * Re-computes the SHA-256 hash of a file and compares it to the expected hash.
 */
function verifyFirmwareHash(filePath, expectedHashHex) {
  console.log("Verifying downloaded firmware hash...");
  const hashOutput = execSync(`sha256sum ${filePath}`).toString();
  const computedHash = "0x" + hashOutput.split(" ")[0];
  console.log("Computed hash:", computedHash);
  return computedHash.toLowerCase() === expectedHashHex.toLowerCase();
}

/**
 * Publishes an MQTT message to notify the device that the new firmware is ready.
 * The message includes the firmware version, IPFS CID, and firmware hash.
 */
function notifyDevice(version, cid, firmwareHash) {
  console.log("Connecting to MQTT broker to notify device...");
  const client = mqtt.connect(mqttBroker);

  client.on("connect", () => {
    console.log("Connected to MQTT broker.");
    const message = JSON.stringify({
      command: "FIRMWARE_UPDATE",
      version: version,
      cid: cid,
      hash: firmwareHash
    });
    client.publish(mqttTopic, message, { qos: 1 }, (err) => {
      if (err) {
        console.error("Error publishing MQTT message:", err);
      } else {
        console.log("MQTT message published:", message);
      }
      client.end();
    });
  });
}

/**
 * (Optional) Updates a "device contract" with the device's update attempt.
 * This example simulates updating a device contract; in a real implementation,
 * you would interact with another smart contract.
 */
async function updateDeviceContract(deviceId, firmwareVersion) {
  // For demonstration, we simply log the update attempt.
  // In practice, you might call another smart contract function here.
  console.log(`Recording update attempt: device=${deviceId}, version=${firmwareVersion}`);
  // Example: call contract.methods.recordUpdateAttempt(deviceId, firmwareVersion, timestamp).send({...});
}

/**
 * Main function: Orchestrates the update service process.
 */
async function main() {
  try {
    // Step 1: Query the smart contract for the target firmware metadata
    const metadata = await readFirmwareMetadata(targetVersion);
    if (!metadata) {
      console.log("No new firmware available. Exiting update service.");
      return;
    }
    
    const { version, hash: firmwareHash, cid, signature } = metadata;
    
    // Step 2: Verify the metadata signature
    const isSignatureValid = verifySignature(firmwareHash, signature, manufacturerPubKeyPath);
    if (!isSignatureValid) {
      console.log("Firmware metadata signature verification failed. Aborting update.");
      return;
    }
    
    // Step 3: Download the actual firmware from IPFS using the provided CID
    const downloadSuccess = downloadFirmwareFromIPFS(cid, downloadedFirmwareFile);
    if (!downloadSuccess) {
      console.log("Failed to download firmware from IPFS. Aborting update.");
      return;
    }
    
    // Step 4: Re-calculate the firmware hash of the downloaded file and compare
    const isHashValid = verifyFirmwareHash(downloadedFirmwareFile, firmwareHash);
    if (!isHashValid) {
      console.log("Firmware hash mismatch after download. Aborting update.");
      return;
    }
    
    console.log("Firmware metadata and file verification succeeded.");
    
    // Step 5: Notify the device (via MQTT) that the firmware is ready.
    // The message includes the firmware version, IPFS CID, and firmware hash.
    notifyDevice(version, cid, firmwareHash);
    
    // Step 6: Optionally, update the device contract with the device's update attempt.
    // For example, suppose we have a deviceId "device123".
    await updateDeviceContract("device123", version);
    
    console.log("Update Service completed successfully.");

  } catch (err) {
    console.error("Error in update service process:", err);
  }
}

main();
