#!/usr/bin/env python3
import paho.mqtt.client as mqtt
import json
import time
import hashlib
import binascii
import os

# Configuration
BROKER_IP = "192.168.1.12"      # MQTT broker IP (e.g., Raspberry Pi)
BROKER_PORT = 1883              # MQTT broker port
TOPIC = "test"                  # MQTT topic that the board subscribes to
FIRMWARE_FILE = "STM_ESP_SETUP.hex"  # Path to the firmware file (Intel HEX format)
CHUNK_SIZE = 512                # Number of bytes per OTA chunk
NEW_FW_VERSION = "0x0101"       # New firmware version to be sent

###############################################################################
#                  Firmware Loading & HEX Parsing Functions                   #
###############################################################################
def load_firmware_hex(filename):
    """
    Parses an Intel HEX file and returns its binary content.
    This simple parser handles:
      - Data records (record type 00)
      - Extended Linear Address records (record type 04)
    It fills any missing bytes with 0xFF.
    """
    memory = {}
    base_address = 0
    highest_address = 0

    with open(filename, "r") as f:
        for line in f:
            line = line.strip()
            if not line or line[0] != ':':
                continue
            record = line[1:]
            byte_count = int(record[0:2], 16)
            address = int(record[2:6], 16)
            record_type = int(record[6:8], 16)
            data_field = record[8:8+byte_count*2]

            if record_type == 0:  # Data record
                absolute_address = base_address + address
                for i in range(byte_count):
                    byte_val = int(data_field[i*2:i*2+2], 16)
                    memory[absolute_address + i] = byte_val
                highest_address = max(highest_address, absolute_address + byte_count)
            elif record_type == 4:  # Extended Linear Address Record
                base_address = int(data_field, 16) << 16
            elif record_type == 1:  # End Of File
                break

    firmware_data = bytearray()
    for addr in range(highest_address):
        firmware_data.append(memory.get(addr, 0xFF))
    return bytes(firmware_data)

def load_firmware(filename):
    """
    Reads the firmware file and returns its content as bytes.
    If the file extension is '.hex', it parses it as an Intel HEX file;
    otherwise, it reads it as a binary file.
    """
    _, ext = os.path.splitext(filename)
    if ext.lower() == ".hex":
        return load_firmware_hex(filename)
    else:
        with open(filename, "rb") as f:
            return f.read()

def compute_sha256(data):
    """
    Computes and returns the SHA-256 hash of the given data as an uppercase hex string.
    """
    hash_obj = hashlib.sha256()
    hash_obj.update(data)
    return hash_obj.hexdigest().upper()

###############################################################################
#                    MQTTv5 Callbacks (New paho-mqtt 2.0+ API)                #
###############################################################################
def on_connect(client, userdata, flags, reason_code, properties):
    print(f"[on_connect] reason_code={reason_code}, properties={properties}")
    # Not subscribing here because we only publish. If needed, you can:
    # client.subscribe(TOPIC)

def on_publish(client, userdata, mid, properties=None):
    print(f"[on_publish] mid={mid}, properties={properties}")

def on_disconnect(client, userdata, reason_code, properties=None):
    print(f"[on_disconnect] reason_code={reason_code}, properties={properties}")

# Optional if you want to handle incoming messages in MQTTv5 style
def on_message(client, userdata, msg):
    print(f"[on_message] Topic={msg.topic}, Payload={msg.payload.decode()}")

###############################################################################
#                     Publishing the OTA Update (MQTTv5)                      #
###############################################################################
def publish_ota_update(client, firmware_data):
    """
    Publishes OTA update messages (start and chunks) to the MQTT topic.
    First, an OTA_START message is sent with firmware size, new version, and hash.
    Then, the firmware binary data is split into CHUNK_SIZE pieces and sent as OTA_CHUNK messages.
    """
    fw_size = len(firmware_data)
    fw_hash = compute_sha256(firmware_data)
    
    # Construct OTA_START JSON message
    ota_start_msg = json.dumps({
        "command": "OTA_START",
        "fwSize": fw_size,
        "fwVersion": NEW_FW_VERSION,
        "hash": fw_hash
    })
    
    print("[OTA] Publishing OTA_START message:")
    print(ota_start_msg)
    client.publish(TOPIC, ota_start_msg)
    time.sleep(1)  # Wait for the board to process the start command
    
    # Break the firmware into chunks and send OTA_CHUNK messages
    num_chunks = (fw_size + CHUNK_SIZE - 1) // CHUNK_SIZE
    print(f"[OTA] Publishing firmware in {num_chunks} chunks...")
    for i in range(num_chunks):
        chunk = firmware_data[i * CHUNK_SIZE : (i + 1) * CHUNK_SIZE]
        # Convert binary chunk to an uppercase hex string
        hex_chunk = binascii.hexlify(chunk).decode('utf-8').upper()
        last_flag = (i == num_chunks - 1)
        ota_chunk_msg = json.dumps({
            "command": "OTA_CHUNK",
            "data": hex_chunk,
            "last": last_flag
        })
        print(f"[OTA] Publishing OTA_CHUNK {i+1}/{num_chunks}, last={last_flag}")
        client.publish(TOPIC, ota_chunk_msg)
        time.sleep(0.1)  # Short delay between chunks

###############################################################################
#                                   Main                                       #
###############################################################################
def main():
    # Load firmware data (from a .hex or .bin file)
    try:
        firmware_data = load_firmware(FIRMWARE_FILE)
    except Exception as e:
        print(f"Error loading firmware file: {e}")
        return

    print(f"Firmware loaded: {len(firmware_data)} bytes")
    
    # Create an MQTT client using MQTT v5 and the new callback API
    client = mqtt.Client(
        client_id="OTA_Sender",
        protocol=mqtt.MQTTv5,
        callback_api_version=5
    )

    # Assign MQTTv5 callbacks
    client.on_connect = on_connect
    client.on_publish = on_publish
    client.on_disconnect = on_disconnect
    # client.on_message = on_message  # If you want to handle incoming messages

    try:
        print(f"Connecting to broker at {BROKER_IP}:{BROKER_PORT} with MQTTv5...")
        client.connect(BROKER_IP, BROKER_PORT, 60)
    except Exception as e:
        print(f"MQTT connection error: {e}")
        return

    # Optionally run a network loop in the background
    # client.loop_start()

    # Publish OTA update
    publish_ota_update(client, firmware_data)
    
    print("[OTA] Firmware OTA update messages sent.")
    
    # Disconnect gracefully
    client.disconnect()

    # If loop_start() was used, also stop it:
    # client.loop_stop()

if __name__ == "__main__":
    main()
