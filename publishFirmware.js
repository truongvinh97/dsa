/************************************************************
 * publishFirmware.js
 *
 * This script automates:
 *  1) Convert an ELF to .hex (objcopy).
 *  2) Compute SHA-256 of the .hex file.
 *  3) Sign the .hex file with OpenSSL => signature.bin
 *  4) Upload .hex to IPFS => get CID
 *  5) Publish (version, hash, cid, signature) to the local Ganache contract
 ************************************************************/

const { execSync } = require("child_process");
const fs = require("fs");
const Web3 = require("web3");

// 1) Connect to Ganache
// Make sure Ganache is running: "ganache" or the Ganache GUI
const web3 = new Web3("http://192.168.1.3:7545");

// 2) Load the compiled contract artifacts from Truffle
const contractJSON = JSON.parse(
  fs.readFileSync("./build/contracts/FirmwareRegistry.json", "utf8")
);

// The contract's ABI
const abi = contractJSON.abi;

/**
 * If you prefer to read the deployed address from contractJSON.networks, do something like:
 *   const networkId = Object.keys(contractJSON.networks)[0];
 *   const contractAddress = contractJSON.networks[networkId].address;
 *
 * For simplicity, let's just hard-code the address or parse it manually
 */
const contractAddress = "0xbaC9243aaB9879a0B80395A68349111F90028Ce8";

// Create a contract instance
const firmwareRegistry = new web3.eth.Contract(abi, contractAddress);

async function publishFirmware() {
  try {
    // We'll use the first Ganache account as the "manufacturer"
    const accounts = await web3.eth.getAccounts();
    const manufacturerAccount = accounts[0];

    // 1) Convert ELF to HEX
    //    Suppose your compiled ELF is "firmware.elf" => produce "firmware.hex"
    //console.log("Converting ELF to HEX...");
    //execSync(`arm-none-eabi-objcopy -O ihex firmware.elf firmware.hex`);
    //console.log("firmware.hex created successfully.");

    // 2) Compute SHA-256 of firmware.hex
    console.log("Computing SHA-256 of firmware.hex...");
    const hashOutput = execSync(`sha256sum firmware.hex`).toString().split(" ")[0];
    console.log("Firmware Hash (hex):", hashOutput);

    // Convert to 0x + hex for bytes32
    const firmwareHash = "0x" + hashOutput;

    // 3) Sign the .hex file with OpenSSL
    //    This uses a private key file, e.g. manufacturer_private_key.pem
    console.log("Signing firmware.hex with OpenSSL...");
    execSync(`openssl dgst -sha256 -sign manufacturer_private_key.pem -out signature.bin firmware.hex`);
    console.log("signature.bin created.");

    // Convert signature.bin to a hex string
    const signatureBuffer = fs.readFileSync("signature.bin");
    const signatureHex = "0x" + signatureBuffer.toString("hex");
    console.log("Signature (hex):", signatureHex);

    // 4) Upload .hex to IPFS
    //    Ensure your IPFS daemon is running => "ipfs daemon"
    console.log("Uploading firmware.hex to IPFS...");
    const cid = execSync(`ipfs add firmware.hex -Q`).toString().trim();
    console.log("Firmware CID:", cid);

    // 5) Define a firmware version
    //    This can be anything like "0x0103" or a string "v1.0"
    const version = "0x0101";

    // Now call publishFirmware on the contract
    console.log("Publishing metadata to Ganache contract...");
    const tx = await firmwareRegistry.methods
      .publishFirmware(version, firmwareHash, cid, signatureHex)
      .send({
        from: manufacturerAccount,
        gas: 2000000
      });

    console.log("Transaction successful!");
    console.log("TX Hash:", tx.transactionHash);

    // Optionally exit
    process.exit(0);

  } catch (err) {
    console.error("Error in publishFirmware script:", err);
    process.exit(1);
  }
}

publishFirmware();

