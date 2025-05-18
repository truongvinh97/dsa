#!/usr/bin/env node
// src/index.js
// Entry‐point for Update Service on Raspberry Pi

import dotenv from "dotenv";
dotenv.config(); // load .env first

import { connectMQTT, mqttClient } from "./mqtt/client.js";
import startDispatcher from "./core/dispatcher.js";
import { initWeb3, web3 } from "./web3/index.js";

async function main() {
  try {
    console.log("🚀 [UpdateService] Starting update‐service...");

    // 1️⃣ Connect to MQTT broker
    console.log("[UpdateService] Connecting to MQTT broker...");
    await connectMQTT();
    console.log("[UpdateService] MQTT connected.");

    // 2️⃣ Initialize Web3 & load contracts
    console.log("[UpdateService] Initializing Web3...");
    await initWeb3();
    console.log("[UpdateService] Web3 initialized.");

    // 3️⃣ Start dispatcher loop & MQTT listeners
    console.log("[UpdateService] Starting dispatcher...");
    startDispatcher();

    console.log("✅ [UpdateService] Service is up and running.");
  } catch (err) {
    console.error("🔥 [UpdateService] Startup error:", err);
    process.exit(1);
  }
}

// catch unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("🛑 Unhandled Rejection at:", promise, "reason:", reason);
});

// catch uncaught exceptions
process.on("uncaughtException", (err) => {
  console.error("🛑 Uncaught Exception:", err);
  process.exit(1);
});

// graceful shutdown on SIGINT/SIGTERM
process.on("SIGINT", () => {
  console.log("🛑 [UpdateService] Received SIGINT, shutting down...");
  mqttClient.end(true, () => {
    console.log("[UpdateService] MQTT client disconnected.");
    if (web3.currentProvider?.disconnect) {
      web3.currentProvider.disconnect();
      console.log("[UpdateService] Web3 provider disconnected.");
    }
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  console.log("🛑 [UpdateService] Received SIGTERM, shutting down...");
  mqttClient.end(true, () => {
    console.log("[UpdateService] MQTT client disconnected.");
    if (web3.currentProvider?.disconnect) {
      web3.currentProvider.disconnect();
      console.log("[UpdateService] Web3 provider disconnected.");
    }
    process.exit(0);
  });
});

// start the service
main();
