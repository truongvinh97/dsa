// src/web3/index.js
import Web3 from "web3";
import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";
dotenv.config();

const web3 = new Web3(process.env.RPC_URL);

/**
 * Load ABI artifact from ABI JSON file.
 * @param {string} name - Contract name (e.g., FirmwareRegistry)
 * @returns {Promise<object>} ABI artifact
 */
async function loadABI(name) {
  const filePath = new URL(`./abi/${name}.json`, import.meta.url);
  const json = await fs.readFile(filePath, "utf8");
  return JSON.parse(json);
}

/**
 * Create a web3 contract instance
 * @param {string} name - Contract name (e.g., FirmwareRegistry)
 * @param {string} envAddr - Env variable name holding contract address
 * @returns {Promise<Contract>} Web3 contract instance
 */
async function contract(name, envAddr) {
  const artifact = await loadABI(name);
  const addr = process.env[envAddr] || Object.values(artifact.networks)[0]?.address;
  if (!addr) throw new Error(`Missing contract address for ${name}`);
  return new web3.eth.Contract(artifact.abi, addr);
}

// Export contract instances
export const Firmware = await contract("FirmwareRegistry", "FIRMWARE_ADDRESS");
export const Device   = await contract("DeviceRegistry", "DEVICE_ADDRESS");

// Cached default account
let _default;

/**
 * Get the default account from the web3 provider (typically Ganache).
 * @returns {Promise<string>} Default Ethereum account address
 */
export const defaultAccount = async () => {
  return _default ??= (await web3.eth.getAccounts())[0];
};

/**
 * Send a transaction using the default account.
 * @param {object} method - A prepared contract method (e.g., Firmware.methods.register(...))
 * @param {object} opts - Optional tx overrides (gas, from, etc.)
 * @returns {Promise<object>} Transaction receipt
 */
export const sendTx = async (method, opts = {}) => {
  const from = opts.from || (await defaultAccount());
  const gas  = opts.gas  || (await method.estimateGas({ from })) + 25_000;
  return method.send({ from, gas, ...opts });
};
