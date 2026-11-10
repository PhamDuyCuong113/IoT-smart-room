#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <esp_random.h>

const char* WIFI_SSID = "PhamDuyCuong";
const char* WIFI_PASSWORD = "kocomatkhau";
const char* MQTT_SERVER = "172.20.10.10";
const uint16_t MQTT_PORT = 1888;
const char* MQTT_USERNAME = "phamduycuong";
const char* MQTT_PASSWORD = "b23dccn113";

const char* TOPIC_DATA_SENSOR = "data/sensor";
const char* TOPIC_DEVICE_CONTROL = "device/control";
const char* TOPIC_DEVICE_RESPONSE = "device/response";

#define LED1_PIN 18
#define LED2_PIN 19
#define LED3_PIN 21
#define DHT_PIN 4
#define DHT_TYPE DHT11
#define LDR_PIN 34

DHT dht(DHT_PIN, DHT_TYPE);
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

unsigned long lastSensorTime = 0;
const unsigned long SENSOR_INTERVAL = 5000;

bool ledStates[3] = {false, false, false};
const int LED_PINS[3] = {LED1_PIN, LED2_PIN, LED3_PIN};
const char* SENSOR_KEYS[3] = {"temperature", "humidity", "light"};
double THRESHOLDS[3] = {30.0, 80.0, 3000.0};
double latestSensorValues[3] = {NAN, NAN, NAN};
const char* TOPIC_BLINK_CONFIG = "sensor/blink-config/ESP32-01";
String configVersion;
struct ThresholdConfig {
    double values[3];
    char version[65];
};
const unsigned long BLINK_ON_MS = 500;
const unsigned long BLINK_OFF_MS = 500;
const unsigned long BLINK_REPORT_MS = 5000;
const char* TOPIC_BLINK_COUNTS = "sensor/blink-counts";
Preferences preferences;
String counterEpoch;
bool alarmActive[3] = {false, false, false};
bool alarmLedOn[3] = {false, false, false};
unsigned long lastBlinkTime[3] = {0, 0, 0};
uint64_t blinkCounts[3] = {0, 0, 0};
uint32_t windowCounts[3] = {0, 0, 0};
uint32_t reportedWindowCounts[3] = {0, 0, 0};
unsigned long windowStartedAt = 0;
unsigned long reportedWindowMs = 1;
unsigned long lastWiFiAttempt = 0;
unsigned long lastMQTTAttempt = 0;
bool wifiAttempted = false;
bool mqttAttempted = false;
bool reportPending = true;

void publishBlinkCounts() {
    if (!mqttClient.connected()) return;
    JsonDocument doc;
    doc["esp32Id"] = "ESP32-01";
    doc["counterEpoch"] = counterEpoch;
    doc["configVersion"] = configVersion;
    doc["blinkIntervalMs"] = BLINK_ON_MS + BLINK_OFF_MS;
    doc["windowMs"] = reportedWindowMs;
    for (int i = 0; i < 3; i++) {
        doc["sensors"][SENSOR_KEYS[i]]["total"] = blinkCounts[i];
        doc["sensors"][SENSOR_KEYS[i]]["windowCount"] = reportedWindowCounts[i];
        doc["sensors"][SENSOR_KEYS[i]]["threshold"] = THRESHOLDS[i];
    }
    char buffer[768];
    size_t length = serializeJson(doc, buffer, sizeof(buffer));
    if (length < sizeof(buffer) && mqttClient.publish(TOPIC_BLINK_COUNTS, buffer)) reportPending = false;
}

void turnOnAlarmLed(int i, unsigned long now) {
    digitalWrite(LED_PINS[i], HIGH);
    alarmLedOn[i] = true;
    lastBlinkTime[i] = now;
    blinkCounts[i]++;
    windowCounts[i]++;
  
    if (preferences.putULong64(SENSOR_KEYS[i], blinkCounts[i]) != sizeof(uint64_t)) {
        Serial.println("ERROR: cannot persist blink count");
    }
}

void setAlarm(int i, bool active) {
    if (alarmActive[i] == active) return;
    alarmActive[i] = active;
    if (active) {
       
        digitalWrite(LED_PINS[i], LOW);
        turnOnAlarmLed(i, millis());
    } else {
        alarmLedOn[i] = false;
        digitalWrite(LED_PINS[i], ledStates[i] ? HIGH : LOW);
    }
}

void updateAlarmLeds(unsigned long now) {
    for (int i = 0; i < 3; i++) {
        if (!alarmActive[i]) continue;
        unsigned long duration = alarmLedOn[i] ? BLINK_ON_MS : BLINK_OFF_MS;
        if (now - lastBlinkTime[i] < duration) continue;
        if (alarmLedOn[i]) {
            digitalWrite(LED_PINS[i], LOW);
            alarmLedOn[i] = false;
            lastBlinkTime[i] = now;
        } else turnOnAlarmLed(i, now);
    }
}


void connectWiFi() {
    unsigned long now = millis();
    if (WiFi.status() == WL_CONNECTED) return;
    if (wifiAttempted && now - lastWiFiAttempt < 10000) return;
    wifiAttempted = true;
    lastWiFiAttempt = now;
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

void receiveThresholdConfig(byte* payload, unsigned int length) {
    JsonDocument doc;
    if (deserializeJson(doc, payload, length)) return;
    if (strcmp(doc["esp32Id"] | "", "ESP32-01") != 0) return;
    const char* version = doc["version"] | "";
    if (strlen(version) == 0 || strlen(version) > 64) return;
    ThresholdConfig next = {};
    for (int i = 0; i < 3; i++) {
        if (!doc["thresholds"][SENSOR_KEYS[i]].is<double>()) return;
        double value = doc["thresholds"][SENSOR_KEYS[i]].as<double>();
        double maximum = i == 0 ? 80 : i == 1 ? 100 : 4095;
        if (!isfinite(value) || value < 0 || value > maximum) return;
        if (i == 2 && floor(value) != value) return;
        if (i < 2 && fabs(value * 10 - round(value * 10)) > 0.00000001) return;
        next.values[i] = value;
    }
    snprintf(next.version, sizeof(next.version), "%s", version);
    bool changed = configVersion != version;
    for (int i = 0; i < 3; i++) changed = changed || THRESHOLDS[i] != next.values[i];
    if (changed) {
        
        if (preferences.putBytes("config", &next, sizeof(next)) != sizeof(next)) {
            Serial.println("ERROR: cannot persist threshold config");
            return;
        }
        configVersion = version;
        for (int i = 0; i < 3; i++) {
            THRESHOLDS[i] = next.values[i];
            setAlarm(i, !isnan(latestSensorValues[i]) && latestSensorValues[i] > THRESHOLDS[i]);
        }
    }
    reportPending = true;
}

int getLedPin(int deviceId) {
    switch (deviceId) {
        case 1: return LED1_PIN;
        case 2: return LED2_PIN;
        case 3: return LED3_PIN;
        default: return -1;
    }
}

void publishDeviceResponse(const char* requestId, int deviceId, bool requestedState,
                           bool actualState, bool success, const char* message) {
    JsonDocument doc;
    doc["esp32Id"] = "ESP32-01";
    doc["requestId"] = requestId;
    doc["deviceId"] = deviceId;
    doc["requestedState"] = requestedState;
    doc["actualState"] = actualState;
    doc["success"] = success;
    doc["message"] = message;

    char buffer[512];
    serializeJson(doc, buffer, sizeof(buffer));
    bool result = mqttClient.publish(TOPIC_DEVICE_RESPONSE, buffer);

    Serial.println();
    Serial.print("DEVICE RESPONSE: ");
    Serial.println(buffer);
    Serial.print("Publish response: ");
    Serial.println(result ? "OK" : "FAILED");
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
    if (strcmp(topic, TOPIC_BLINK_CONFIG) == 0) {
        receiveThresholdConfig(payload, length);
        return;
    }
    Serial.println();
    Serial.println("MQTT MESSAGE RECEIVED");
    Serial.print("Topic: ");
    Serial.println(topic);

    if (strcmp(topic, TOPIC_DEVICE_CONTROL) != 0) {
        return;
    }

    char message[256];
    if (length >= sizeof(message)) {
        Serial.println("Payload too large!");
        return;
    }

    memcpy(message, payload, length);
    message[length] = '\0';
    Serial.print("Payload: ");
    Serial.println(message);

    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, message);
    if (error) {
        Serial.print("JSON ERROR: ");
        Serial.println(error.c_str());
        return;
    }

    const char* requestId = doc["requestId"] | "";
    int deviceId = doc["deviceId"] | -1;

    if (!doc["state"].is<bool>()) {
        Serial.println("ERROR: state must be true/false");
        return;
    }

    bool requestedState = doc["state"].as<bool>();
    bool blocked = deviceId == 0
        ? (alarmActive[0] || alarmActive[1] || alarmActive[2])
        : (deviceId >= 1 && deviceId <= 3 && alarmActive[deviceId - 1]);
    if (blocked) {
        bool actual = deviceId >= 1 && deviceId <= 3 ? ledStates[deviceId - 1] : false;
        publishDeviceResponse(requestId, deviceId, requestedState, actual, false,
            "Đèn đang cảnh báo vượt ngưỡng, tạm thời không thể điều khiển thủ công.");
        return;
    }

    if (deviceId == 0) {
        digitalWrite(LED1_PIN, requestedState ? HIGH : LOW);
        digitalWrite(LED2_PIN, requestedState ? HIGH : LOW);
        digitalWrite(LED3_PIN, requestedState ? HIGH : LOW);

        ledStates[0] = requestedState;
        ledStates[1] = requestedState;
        ledStates[2] = requestedState;

        Serial.print("ALL LED: ");
        Serial.println(requestedState ? "ON" : "OFF");

        publishDeviceResponse(
            requestId,
            0,
            requestedState,
            requestedState,
            true,
            "ALL_DEVICES_STATE_CHANGED"
        );

        return;
    }

    int ledPin = getLedPin(deviceId);

    if (ledPin == -1) {
        Serial.println("ERROR: deviceId must be 0, 1, 2 or 3");
        publishDeviceResponse(requestId, deviceId, false, false, false, "INVALID_DEVICE_ID");
        return;
    }
    
    Serial.print("Device ID: ");
    Serial.println(deviceId);
    Serial.print("GPIO: ");
    Serial.println(ledPin);
    Serial.print("Requested state: ");
    Serial.println(requestedState ? "ON" : "OFF");

    digitalWrite(ledPin, requestedState ? HIGH : LOW);
    delay(10);

    int gpioValue = digitalRead(ledPin);
    bool actualState = gpioValue == HIGH;
    ledStates[deviceId - 1] = actualState;

    Serial.print("GPIO value = ");
    Serial.println(gpioValue);
    Serial.print("Actual state: ");
    Serial.println(actualState ? "ON" : "OFF");

    bool success = actualState == requestedState;
    publishDeviceResponse(
        requestId, deviceId, requestedState, actualState, success,
        success ? "DEVICE_STATE_CHANGED" : "DEVICE_STATE_CHANGE_FAILED"
    );
}

void connectMQTT() {
    if (WiFi.status() != WL_CONNECTED || mqttClient.connected()) return;
    unsigned long now = millis();
    if (mqttAttempted && now - lastMQTTAttempt < 3000) return;
    mqttAttempted = true;
    lastMQTTAttempt = now;
    String clientId = "ESP32-01-" + String((uint32_t)ESP.getEfuseMac(), HEX);
    if (mqttClient.connect(clientId.c_str(), MQTT_USERNAME, MQTT_PASSWORD)) {
        mqttClient.subscribe(TOPIC_DEVICE_CONTROL);
        mqttClient.subscribe(TOPIC_BLINK_CONFIG, 1);
        for (int i = 0; i < 3; i++) {
            publishDeviceResponse("INIT", i + 1, ledStates[i], ledStates[i], true, "INITIAL_STATE");
        }
        reportPending = true;
    }
}

void publishSensorData() {
    float temperature = dht.readTemperature();
    float humidity = dht.readHumidity();
    int light = analogRead(LDR_PIN);
    latestSensorValues[0] = temperature;
    latestSensorValues[1] = humidity;
    latestSensorValues[2] = light;

    setAlarm(0, !isnan(temperature) && temperature > THRESHOLDS[0]);
    setAlarm(1, !isnan(humidity) && humidity > THRESHOLDS[1]);
    setAlarm(2, light > THRESHOLDS[2]);

    JsonDocument doc;
    doc["deviceId"] = "ESP32-01";
    if (!isnan(temperature)) doc["temperature"] = temperature;
    if (!isnan(humidity)) doc["humidity"] = humidity;
    doc["light"] = light;

    char buffer[512];
    serializeJson(doc, buffer, sizeof(buffer));
    bool result = mqttClient.publish(TOPIC_DATA_SENSOR, buffer);

    Serial.print("DATA SENSOR: ");
    Serial.println(buffer);
    Serial.print("Publish sensor: ");
    Serial.println(result ? "OK" : "FAILED");
}

void setup() {
    Serial.begin(115200);
    delay(1000);

    pinMode(LED1_PIN, OUTPUT);
    pinMode(LED2_PIN, OUTPUT);
    pinMode(LED3_PIN, OUTPUT);
    digitalWrite(LED1_PIN, LOW);
    digitalWrite(LED2_PIN, LOW);
    digitalWrite(LED3_PIN, LOW);

    ledStates[0] = false;
    ledStates[1] = false;
    ledStates[2] = false;

    dht.begin();
    pinMode(LDR_PIN, INPUT);
    analogReadResolution(12);

    mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
    mqttClient.setCallback(mqttCallback);
    mqttClient.setBufferSize(1024);
    mqttClient.setSocketTimeout(1);
    if (!preferences.begin("blink-counts", false)) {
        Serial.println("FATAL: cannot open blink counter storage");
        while (true) delay(1000);
    }
    counterEpoch = preferences.getString("epoch", "");
    if (counterEpoch.isEmpty()) {
        char epoch[33];
        snprintf(epoch, sizeof(epoch), "%08lx%08lx%08lx%08lx",
            (unsigned long)esp_random(), (unsigned long)esp_random(),
            (unsigned long)esp_random(), (unsigned long)esp_random());
        counterEpoch = epoch;
        if (!preferences.putString("epoch", counterEpoch)) {
            Serial.println("FATAL: cannot persist counter epoch");
            while (true) delay(1000);
        }
    }
    for (int i = 0; i < 3; i++) blinkCounts[i] = preferences.getULong64(SENSOR_KEYS[i], 0);
    ThresholdConfig saved = {};
    if (preferences.getBytesLength("config") == sizeof(saved) &&
        preferences.getBytes("config", &saved, sizeof(saved)) == sizeof(saved) &&
        saved.version[0] != '\0' && saved.version[64] == '\0') {
        bool valid = true;
        for (int i = 0; i < 3; i++) {
            double maximum = i == 0 ? 80 : i == 1 ? 100 : 4095;
            valid = valid && isfinite(saved.values[i]) && saved.values[i] >= 0 && saved.values[i] <= maximum;
        }
        if (valid) {
            configVersion = saved.version;
            for (int i = 0; i < 3; i++) THRESHOLDS[i] = saved.values[i];
        }
    }
    windowStartedAt = millis();
    WiFi.mode(WIFI_STA);

    connectWiFi();
    connectMQTT();
}

void loop() {
    unsigned long now = millis();
    if (now - lastSensorTime >= SENSOR_INTERVAL) {
        lastSensorTime = now;
        publishSensorData();
    }
    updateAlarmLeds(millis());

    now = millis();
    if (now - windowStartedAt >= BLINK_REPORT_MS) {
        reportedWindowMs = now - windowStartedAt;
        for (int i = 0; i < 3; i++) {
            reportedWindowCounts[i] = windowCounts[i];
            windowCounts[i] = 0;
        }
        windowStartedAt = now;
        reportPending = true;
    }
    connectWiFi();
    connectMQTT();
    if (mqttClient.connected()) {
        mqttClient.loop();
        if (reportPending) publishBlinkCounts();
    }
}
