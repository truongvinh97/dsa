#!/usr/bin/env python3
import paho.mqtt.client as mqtt
import json
import subprocess
import time

# ------------ Cấu hình -------------
BROKER_IP = "192.168.1.12"        # MQTT broker IP (e.g., Raspberry Pi)
BROKER_PORT = 1883                # MQTT broker port
MQTT_TOPIC = "OTA/notice"         # MQTT topic thông báo OTA

FIRMWARE_FILE = "STM_ESP_SETUP.hex"    # Tệp firmware ở định dạng Intel HEX
NEW_FW_VERSION = "0x0101"         # Phiên bản firmware

# -----------------------------------

def add_file_to_ipfs(filename):
    """
    Upload file (dạng .hex) lên IPFS (chạy ipfs add) và trả về CID (string).
    Giả sử IPFS daemon đang chạy trên Pi, lệnh ipfs khả dụng.
    """
    try:
        # Chạy lệnh ipfs add
        result = subprocess.run(["ipfs", "add", filename],
                                capture_output=True, text=True, check=True)
        # Output ví dụ: "added QmXYZ123 firmware.hex"
        lines = result.stdout.strip().split()
        # Tìm chuỗi CID
        # Format: ['added', 'QmXYZ123', 'firmware.hex']
        cid = lines[1]  # CID nằm ở vị trí thứ 1
        return cid
    except subprocess.CalledProcessError as e:
        print("Error running ipfs add:", e)
        return None

def publish_ota_info(cid):
    """
    Publish thông tin OTA (CID + version) lên topic MQTT.
    """
    client = mqtt.Client("OTAUploader")
    
    try:
        client.connect(BROKER_IP, BROKER_PORT, 60)
    except Exception as e:
        print("MQTT connection error:", e)
        return

    # Tạo payload JSON: gửi CID + version
    payload = {
        "cid": cid,
        "version": NEW_FW_VERSION
    }
    payload_str = json.dumps(payload)

    # Publish lên topic (qos=0 để gửi nhanh)
    client.publish(MQTT_TOPIC, payload_str, qos=0)
    print(f"Published OTA info to {MQTT_TOPIC}: {payload_str}")

    client.disconnect()

def main():
    # 1) Upload file firmware .hex lên IPFS, lấy CID
    cid = 0;
    //cid = add_file_to_ipfs(FIRMWARE_FILE)
    if cid is None:
        print("Failed to upload file to IPFS.")
        return
    print(f"Successfully added file {FIRMWARE_FILE} to IPFS: CID={cid}")

    # 2) Publish thông tin OTA cho STM32 (hoặc thiết bị khác)
    publish_ota_info(cid)

if __name__ == "__main__":
    main()
