import Web3 from "web3";
import dotenv from "dotenv";
import fs from "fs/promises";
dotenv.config();

const RPC_URL = "http://192.168.1.24:7545";  // HTTP chứ không phải WS
const FIRMWARE_ADDRESS = "0xE9f1A121627Ff693f200BEFf32414fdd2E90624d";

const web3 = new Web3(RPC_URL);

async function loadABI() {
  const abiRaw = await fs.readFile("./src/web3/abi/FirmwareRegistry.json", "utf8");
  const abiJson = JSON.parse(abiRaw);
  return abiJson.abi;
}

async function main() {
  const abi = await loadABI();
  const contract = new web3.eth.Contract(abi, FIRMWARE_ADDRESS);

  console.log("[Test] Polling NewFirmware events...");

  let lastBlock = await web3.eth.getBlockNumber();

  setInterval(async () => {
    const latestBlock = await web3.eth.getBlockNumber();
    if (latestBlock > lastBlock) {
      const events = await contract.getPastEvents("NewFirmware", {
        fromBlock: lastBlock + 1n,
        toBlock: "latest"
      });

      events.forEach(ev => {
        console.log("🔥 NewFirmware Event Received:");
        console.log(ev.returnValues);
      });

      lastBlock = latestBlock;
    }
  }, 5000);  // mỗi 5 giây
}

main().catch(console.error);
