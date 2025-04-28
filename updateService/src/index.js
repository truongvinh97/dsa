// Load biến môi trường từ .env
import dotenv from "dotenv";
dotenv.config();

// Gọi hàm chính để xử lý sự kiện firmware mới
import startProcessor from "./core/dispatcher.js";
import { initWeb3 } from './web3/index.js';

// Khởi động dịch vụ
await initWeb3();
startProcessor().catch((err) => {
  console.error("[update-service] Fatal error:", err);
  process.exit(1);
});
