import Web3 from "web3";
import dotenv from "dotenv";
import fs from "fs/promises";
dotenv.config();
const RPC_URL = "ws://192.168.1.24:7545";
const FIRMWARE_ADDRESS = "0xE9f1A121627Ff693f200BEFf32414fdd2E90624d";

// Force WebSocket connection
const web3 = new Web3(new Web3.providers.WebsocketProvider(RPC_URL));

async function loadABI() {
  const abiRaw = await fs.readFile("./src/web3/abi/FirmwareRegistry.json", "utf8");
  const abiJson = JSON.parse(abiRaw);
  return abiJson.abi;
}

async function main() {
  const abi = await loadABI();
  const address = FIRMWARE_ADDRESS;
  const Firmware = new web3.eth.Contract(abi, address);

  console.log("[Test] Subscribing to NewFirmware events...");

  Firmware.events.NewFirmware()
    .on("connected", (subId) => {
      console.log("[Test] Subscription ID:", subId);
    })
    .on("data", (event) => {
      console.log("🔥 NewFirmware Event Received:");
      console.log(event.returnValues);
    })
    .on("error", (err) => {
      console.error("🛑 Error while listening:", err.message);
    });
}

main().catch(console.error);
