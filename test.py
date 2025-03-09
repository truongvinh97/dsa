import paho.mqtt.client as mqtt
import time

BROKER_IP = "192.168.1.12"
BROKER_PORT = 1883
TOPIC = "test"

def on_connect(client, userdata, flags, rc):
    print("Connected to broker with result code {}".format(rc))

def on_publish(client, userdata, mid):
    print("Message Published...")

if __name__ == "__main__":
    client = mqtt.Client()
    client.on_connect = on_connect
    client.on_publish = on_publish

    # Kết nối broker
    client.connect(BROKER_IP, BROKER_PORT, 60)
    client.loop_start()

    try:
        while True:
            message = "Hello from Raspberry Pi"
            client.publish(TOPIC, message)
            time.sleep(2)
    except KeyboardInterrupt:
        pass

    client.loop_stop()
    client.disconnect()
