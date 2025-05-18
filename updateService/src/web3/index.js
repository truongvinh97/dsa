// src/web3/index.js
import Web3 from "web3";
import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";
dotenv.config();

// 1. Create web3 from RPC_URL (ws://… or http://…)
if (!process.env.RPC_URL) {
  throw new Error("Missing RPC_URL in .env");
}
const provider = process.env.RPC_URL.startsWith("ws")
  ? new Web3.providers.WebsocketProvider(process.env.RPC_URL)
  : new Web3.providers.HttpProvider(process.env.RPC_URL);
export const web3 = new Web3(provider);

// 2. Helpers to load ABI + find address
async function loadABI(name) {
  const filePath = new URL(`./abi/${name}.json`, import.meta.url);
  const json = await fs.readFile(filePath, "utf8");
  return JSON.parse(json);
}

async function getContract(name, envVar) {
  const artifact = await loadABI(name);
  // first try ENV override
  let address = process.env[envVar];
  // fallback to first network in artifact.networks
  if (!address && artifact.networks) {
    const nets = Object.keys(artifact.networks);
    if (nets.length > 0) {
      address = artifact.networks[nets[0]].address;
    }
  }
  if (!address) {
    throw new Error(`No address for ${name}, set ${envVar} or populate artifact.networks`);
  }
  return new web3.eth.Contract(artifact.abi, address);
}

// 3. Exported contract instances (populated in initWeb3)
export let Firmware;
export let Device;
export let KeyRegistry;
let _defaultAccount;

/**
 * Call once at startup to wire up web3 + contracts.
 */
export async function initWeb3() {
  // pick first account as default sender
  const accounts = await web3.eth.getAccounts();
  if (accounts.length === 0) throw new Error("No accounts available from RPC");
  _defaultAccount = accounts[0];

  // load all three registries
  Firmware    = await getContract("FirmwareRegistry",   "FIRMWARE_REGISTRY_ADDRESS");
  Device      = await getContract("DeviceRegistry",     "DEVICE_REGISTRY_ADDRESS");
  KeyRegistry = await getContract("KeyRegistry",        "KEY_REGISTRY_ADDRESS");

  console.log("[web3] using default account", _defaultAccount);
}

/**
 * sendTx – send a web3 contract method with sensible defaults
 *
 * @param {object} method  – web3.eth.Contract method (e.g. contract.methods.myFunc(...))
 * @param {object} opts    – optional overrides:
 *                            - from: string (sender address)
 *                            - gas:  number | BigInt
 *                            - value:number | BigInt
 * @returns {Promise<object>} – resolves to the receipt
 */
export async function sendTx(method, opts = {}) {
  // 1) determine from
  const from = opts.from
    ? opts.from
    : (await web3.eth.getAccounts())[0];
  // 2) estimate gas if missing
  const gas = opts.gas != null
    ? opts.gas
    : await method.estimateGas({ from, value: opts.value ?? 0 });
  // 3) value default
  const value = opts.value ?? 0;

  // 4) build tx options (hex-encoded)
  const txOpts = {
    from,
    gas:   web3.utils.toHex(gas),
    value: web3.utils.toHex(value)
  };

  // 5) send and await receipt
  return new Promise((resolve, reject) => {
    method
      .send(txOpts)
      .once("receipt", resolve)
      .once("error", reject);
  });
}