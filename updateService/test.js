// test.js
import Web3 from "web3";
import dotenv from "dotenv";
import fs from "fs/promises";

// Load environment variables
dotenv.config();

// ==== Config (adjust to match your environment) ====
const RPC_URL = "ws://192.168.1.24:7545";
const CONTRACT_ADDRESS = "0xE9f1A121627Ff693f200BEFf32414fdd2E90624d";
const ABI_PATH = "./src/web3/abi/FirmwareRegistry.json";

// ==== WebSocket connection ====
const provider = new Web3.providers.WebsocketProvider(RPC_URL);
const web3 = new Web3(provider);

// ==== Load ABI from JSON file ====
async function loadABI(path) {
  const raw = await fs.readFile(path, "utf8");
  const parsed = JSON.parse(raw);
  return parsed.abi;
}

// ==== Main logic ====
async function main() {
  try {
    const abi = await loadABI(ABI_PATH);
    const contract = new web3.eth.Contract(abi, CONTRACT_ADDRESS);

    console.log("[Test] Subscribing to NewFirmware events...");

    // Lắng nghe sự kiện
    contract.events.NewFirmware()
      .on("connected", subId => {
        console.log(`[Test] Subscription ID: ${subId}`);
      })
      .on("data", event => {
        console.log("🔥 NewFirmware Event Received:");
        console.log(event.returnValues);
      })
      .on("error", err => {
        console.error("🛑 Error while listening:", err.message);
      });

  } catch (err) {
    console.error("❌ Failed to subscribe:", err.message);
    process.exit(1);
  }
}

// Start test
main();

// Optional: handle Ctrl+C clean exit
process.on("SIGINT", () => {
  console.log("\n⛔️ Terminating listener...");
  provider.disconnect();
  process.exit();
});
