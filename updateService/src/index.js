// Load biến môi trường từ .env
import dotenv from "dotenv";
dotenv.config();

// Gọi hàm chính để xử lý sự kiện firmware mới
import startProcessor from "./core/dispatcher.js";

// Khởi động dịch vụ
startProcessor().catch((err) => {
  console.error("[update-service] Fatal error:", err);
  process.exit(1);
});
