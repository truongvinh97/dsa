Sau khi clone dự án, người dùng cần thực hiện cài đặt một lần duy nhất:
npm install --production

Để chạy ở chế độ giám sát tự động reload (trong môi trường phát triển):
npm run dev

sudo apt install -y mosquitto mosquitto-clients
sudo systemctl enable --now mosquitto
npm install --production
# hoặc nếu đang ở trong thư mục dự án:
cd update-service
npm install --production
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
sudo apt update
sudo apt install -y git curl build-essential

/etc/systemd/system/ota-update.service