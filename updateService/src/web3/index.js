import Web3 from "web3";
import fs from "fs/promises";
import dotenv from "dotenv"; dotenv.config();

const RPC_URL = "http://192.168.1.24:7545";

const web3 = new Web3(RPC_URL);

let Firmware, Device;

async function loadABI(name) {
  const filePath = new URL(`./abi/${name}.json`, import.meta.url);
  const json = await fs.readFile(filePath, "utf8");
  return JSON.parse(json);
}

async function contract(name, envAddr) {
  const artifact = await loadABI(name);
  const addr = process.env[envAddr] || Object.values(artifact.networks)[0]?.address;
  console.log("[WEB3] Address:", addr);
  if (!addr) throw new Error(`Missing contract address for ${name}`);
  return new web3.eth.Contract(artifact.abi, addr);
}

let _default;

export async function initWeb3() {
  Firmware = await contract("FirmwareRegistry", "FIRMWARE_ADDRESS");
  Device   = await contract("DeviceRegistry", "DEVICE_ADDRESS");
  _default = (await web3.eth.getAccounts())[0];
}

export { Firmware, Device };

export const defaultAccount = async () => _default;

export const sendTx = async (method, opts = {}) => {
  const from = opts.from || (await defaultAccount());
  const gas  = opts.gas  || (await method.estimateGas({ from })) + 25_000;
  return method.send({ from, gas, ...opts });
};
