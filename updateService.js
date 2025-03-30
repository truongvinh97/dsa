/**
 * updateService.js
 *
 * This script performs the following steps:
 * 1. Query the FirmwareRegistry smart contract for a new firmware version.
 * 2. Download the firmware metadata: (version, hash, cid, signature).
 * 3. Authenticate the metadata using the manufacturer's public key.
 *    If signature verification fails, abort.
 * 4. If valid, download the firmware file from IPFS via an HTTP gateway.
 * 5. Recompute the SHA-256 hash of the downloaded firmware and compare it with the metadata hash.
 *    If they do not match, abort.
 * 6. If valid, publish an MQTT message to the device with firmware version, IPFS CID, and firmware hash.
 * 7. Optionally, log or update a "device contract" with the device's update attempt.
 */

const Web3 = require("web3");
const fs = require("fs");
const { execSync } = require("child_process");
const crypto = require("crypto");
const mqtt = require("mqtt");

// ----------- Configuration Section -----------

// Ethereum configuration: connect to your Ethereum node (e.g., Ganache)
const web3 = new Web3("http://192.168.1.3:7545");

// Load the compiled FirmwareRegistry contract artifact (from Truffle)
const contractJSON = JSON.parse(fs.readFileSync("./build/contracts/FirmwareRegistry.json", "utf8"));
const abi = contractJSON.abi;
const contractAddress = "0xbaC9243aaB9879a0B80395A68349111F90028Ce8"; // Replace with your deployed contract address
const firmwareRegistry = new web3.eth.Contract(abi, contractAddress);

// Manufacturer's public key file (ensure this PEM file is identical to the one used on the host)
const manufacturerPubKeyPath = "manufacturer_public_key.pem";

// MQTT configuration: set the broker IP (use the LAN IP of your MQTT broker)
const mqttBroker = "mqtt://192.168.1.12";  // Update as needed
const mqttTopic = "ota/update";            // Topic for OTA update notifications

// IPFS gateway URL (ensure it’s accessible by the Pi; use LAN IP if needed)
const ipfsGateway = "https://ipfs.io/ipfs/";

// The target firmware version to check in the contract
const targetVersion = "0x0100";

// Temporary file name to store the downloaded firmware
const downloadedFirmwareFile = "downloaded_firmware.hex";

// ----------- End Configuration Section -----------

/**
 * readFirmwareMetadata:
 * Queries the FirmwareRegistry smart contract for metadata corresponding to the given version.
 */
async function readFirmwareMetadata(version) {
  console.log(`Querying contract for firmware version ${version}...`);
  const info = await firmwareRegistry.methods.firmwareByVersion(version).call();
  if (!info || info.version === "") {
    console.log("No firmware metadata found for version:", version);
    return null;
  }
  console.log("Firmware metadata retrieved:", info);
  return info;
}

/**
 * verifySignature:
 * Verifies the digital signature using the manufacturer's public key.
 * It uses Node's crypto module to verify the signature on the firmware hash.
 *
 * @param {string} messageHex - The firmware hash (e.g., "0xabc123...")
 * @param {string} signatureHex - The signature in hex (DER encoded, prefixed with 0x)
 * @param {string} pubKeyPath - Path to the manufacturer's public key PEM file.
 * @returns {boolean} - True if the signature is valid, false otherwise.
 */
function verifySignature(messageHex, signatureHex, pubKeyPath) {
  console.log("Verifying firmware metadata signature...");
  
  try {
    // Read and log the public key content (showing first 100 characters)
    const pubKeyPem = fs.readFileSync(pubKeyPath, "utf8");
    console.log("Public Key PEM (first 100 chars):", pubKeyPem.slice(0, 100));

    // Create the verifier object using SHA-256 as the digest algorithm
    const verifier = crypto.createVerify("sha256");

    // Prepare the message buffer from the provided messageHex (firmware hash)
    const cleanedMessageHex = messageHex.replace(/^0x/, "");
    const messageBuffer = Buffer.from(cleanedMessageHex, "hex");
    console.log("Message Buffer (hex):", messageBuffer.toString("hex"), "Length:", messageBuffer.length);

    // Update the verifier with the message data
    verifier.update(messageBuffer);
    verifier.end();

    // Prepare the signature buffer from the provided signatureHex
    const cleanedSignatureHex = signatureHex.replace(/^0x/, "");
    const signatureBuffer = Buffer.from(cleanedSignatureHex, "hex");
    console.log("Signature Buffer (hex):", signatureBuffer.toString("hex"), "Length:", signatureBuffer.length);

    // Perform the signature verification
    const isValid = verifier.verify(pubKeyPem, signatureBuffer);
    console.log("Signature valid?", isValid ? "YES" : "NO");
    
    return isValid;
  } catch (err) {
    console.error("Error during signature verification:", err);
    return false;
  }
}


/**
 * downloadFirmwareFromIPFS:
 * Downloads the firmware file from IPFS using an HTTP gateway.
 *
 * @param {string} cid - The IPFS CID of the firmware.
 * @param {string} outputFile - The local file name to save the firmware.
 * @returns {boolean} - True if download succeeds, false otherwise.
 */
function downloadFirmwareFromIPFS(cid, outputFile) {
  console.log(`Downloading firmware from IPFS using CID: ${cid} ...`);
  try {
    // Use curl to fetch the firmware from the IPFS gateway.
    execSync(`curl ${ipfsGateway}${cid} -o ${outputFile}`);
    console.log("Firmware downloaded to", outputFile);
    return true;
  } catch (error) {
    console.error("Error downloading firmware from IPFS:", error);
    return false;
  }
}

/**
 * verifyFirmwareHash:
 * Recomputes the SHA-256 hash of the downloaded firmware file and compares it to the expected hash.
 *
 * @param {string} filePath - Path to the downloaded firmware file.
 * @param {string} expectedHashHex - Expected firmware hash (from metadata).
 * @returns {boolean} - True if the computed hash matches the expected hash.
 */
function verifyFirmwareHash(filePath, expectedHashHex) {
  console.log("Verifying downloaded firmware hash...");
  const hashOutput = execSync(`sha256sum ${filePath}`).toString();
  const computedHash = "0x" + hashOutput.split(" ")[0];
  console.log("Computed hash:", computedHash);
  return computedHash.toLowerCase() === expectedHashHex.toLowerCase();
}

/**
 * notifyDevice:
 * Publishes an MQTT message to notify the device that new firmware is ready.
 * The message includes the firmware version, IPFS CID, and firmware hash.
 *
 * @param {string} version - Firmware version.
 * @param {string} cid - IPFS CID of the firmware.
 * @param {string} firmwareHash - Firmware hash (bytes32 as hex).
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
 * updateDeviceContract:
 * (Optional) Updates a device contract with the device's update attempt.
 * In a real implementation, this function would interact with another smart contract.
 *
 * @param {string} deviceId - Identifier for the device.
 * @param {string} firmwareVersion - The firmware version attempted.
 */
async function updateDeviceContract(deviceId, firmwareVersion) {
  // For demonstration, simply log the update attempt.
  console.log(`Recording update attempt: device=${deviceId}, firmwareVersion=${firmwareVersion}`);
  // In production, you might invoke a function on a device contract:
  // e.g., await deviceContract.methods.recordUpdateAttempt(deviceId, firmwareVersion, Date.now()).send({ ... });
}

/**
 * main:
 * Orchestrates the update service process.
 */
async function main() {
  try {
    // Step 1: Query the smart contract for the target firmware metadata.
    const metadata = await readFirmwareMetadata(targetVersion);
    if (!metadata) {
      console.log("No new firmware available. Exiting update service.");
      return;
    }
    // Destructure metadata (version, hash, cid, signature).
    const { version, hash: firmwareHash, cid, signature } = metadata;

    // Step 2: Verify the metadata signature using the manufacturer's public key.
    const isSignatureValid = verifySignature(firmwareHash, signature, manufacturerPubKeyPath);
    if (!isSignatureValid) {
      console.log("Firmware metadata signature verification failed. Aborting update.");
      return;
    }

    // Step 3: Download the firmware file from IPFS using the provided CID.
    const downloadSuccess = downloadFirmwareFromIPFS(cid, downloadedFirmwareFile);
    if (!downloadSuccess) {
      console.log("Failed to download firmware from IPFS. Aborting update.");
      return;
    }

    // Step 4: Recompute the SHA-256 hash of the downloaded firmware and compare.
    const isHashValid = verifyFirmwareHash(downloadedFirmwareFile, firmwareHash);
    if (!isHashValid) {
      console.log("Firmware hash mismatch after download. Aborting update.");
      return;
    }

    console.log("Firmware metadata and file verification succeeded.");

    // Step 5: Notify the device via MQTT that the new firmware is ready.
    notifyDevice(version, cid, firmwareHash);

    // Step 6: Optionally, update the device contract with the device's update attempt.
    // For example, using a deviceId "device123":
    await updateDeviceContract("device123", version);

    console.log("Update Service completed successfully.");
  } catch (err) {
    console.error("Error in update service process:", err);
  }
}

main();
