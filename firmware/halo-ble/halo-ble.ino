// Optional connectivity-only example for an ESP32-S3 / TinyS3[D].
// Uploading replaces the board's current firmware. Keep any teammate firmware first.
// Uses Espressif's Arduino ESP32 core BLE library; no tap sensor pins are assumed.
#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>

static const char *SERVICE_UUID = "7d2ea28a-f7bd-485a-bd9d-92ad6ecfe93e";
static const char *STATUS_UUID = "7d2ea28b-f7bd-485a-bd9d-92ad6ecfe93e";
static volatile bool restartAdvertising = false;

class ConnectionCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *server) override {
    Serial.println("Halo phone connected");
  }
  void onDisconnect(BLEServer *server) override {
    restartAdvertising = true;
    Serial.println("Phone disconnected; advertising will restart");
  }
};

void setup() {
  Serial.begin(115200);
  BLEDevice::init("Halo-TinyS3");
  BLEServer *server = BLEDevice::createServer();
  server->setCallbacks(new ConnectionCallbacks());
  BLEService *service = server->createService(SERVICE_UUID);
  BLECharacteristic *status = service->createCharacteristic(STATUS_UUID, BLECharacteristic::PROPERTY_READ);
  status->setValue("Halo ready");
  service->start();
  BLEAdvertising *advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->setScanResponse(true);
  BLEDevice::startAdvertising();
  Serial.println("Advertising Halo-TinyS3");
}

void loop() {
  if (restartAdvertising) {
    restartAdvertising = false;
    delay(500);
    BLEDevice::startAdvertising();
  }
  delay(20);
}
