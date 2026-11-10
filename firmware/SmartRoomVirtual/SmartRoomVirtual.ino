#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <esp_system.h>
#include <time.h>

// Wi-Fi and MQTT settings copied from the supplied sketch.
const char* WIFI_SSID = "ESP32_MQTT";
const char* WIFI_PASSWORD = "12345678";
const char* MQTT_SERVER = "192.168.137.1";
const uint16_t MQTT_PORT = 1888;
const char* MQTT_USERNAME = "phamduycuong";
const char* MQTT_PASSWORD = "b23dccn113";

// Existing topics used by the current Backend.
const char* TOPIC_DATA_SENSOR = "data/sensor";
const char* TOPIC_DEVICE_CONTROL = "device/control";
const char* TOPIC_DEVICE_RESPONSE = "device/response";

// New topic for the software alert indicators and daily alert counts.
// The Backend must subscribe to this topic for the new screen to receive updates.
const char* TOPIC_VIRTUAL_ALERTS = "sensor/virtual-alerts";

// The three existing, manually controlled LEDs remain on these pins.
const int OLD_LED_PINS[3] = {18, 19, 21};

// Existing real sensors are kept alongside the three new virtual sensors.
const int DHT_PIN = 4;
const int DHT_TYPE = DHT11;
const int LDR_PIN = 34;
DHT dht(DHT_PIN, DHT_TYPE);

// New physical warning LEDs, wired with one 220-330 ohm resistor each.
const int WARNING_LED_PINS[3] = {25, 26, 27};

// Each virtual sensor generates random values from 0 up to (but not including) Y.
const char* VIRTUAL_SENSOR_IDS[3] = {"sensor1", "sensor2", "sensor3"};
const char* VIRTUAL_SENSOR_NAMES[3] = {
    "Cảm biến ảo 1", "Cảm biến ảo 2", "Cảm biến ảo 3"
};
const int SENSOR_Y[3] = {100, 100, 100};
const unsigned long SENSOR_INTERVAL_MS = 5000;
const unsigned long LED_ON_MS = 500;
const unsigned long LED_OFF_MS = 500;
const unsigned long ALERT_SNAPSHOT_MS = 5000;
const long GMT_OFFSET_SECONDS = 7 * 60 * 60;

WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);
Preferences preferences;

bool oldLedStates[3] = {false, false, false};
int virtualValues[3] = {0, 0, 0};
bool alertActive[3] = {false, false, false};
bool warningLedOn[3] = {false, false, false};
unsigned long lastWarningToggle[3] = {0, 0, 0};
uint32_t alertsToday[3] = {0, 0, 0};
char currentDay[9] = ""; // YYYYMMDD, local time (GMT+7)

unsigned long lastSensorRead = 0;
unsigned long lastAlertSnapshot = 0;
unsigned long lastWiFiAttempt = 0;
unsigned long lastMqttAttempt = 0;
bool wifiStarted = false;
bool mqttAttempted = false;

bool readLocalClock(struct tm* value) {
    return getLocalTime(value, 10);
}

bool refreshDailyCounters() {
    struct tm localTime;
    if (!readLocalClock(&localTime)) return false;

    char today[9];
    strftime(today, sizeof(today), "%Y%m%d", &localTime);
    if (strcmp(currentDay, today) == 0) return true;

    snprintf(currentDay, sizeof(currentDay), "%s", today);
    preferences.putString("day", currentDay);
    for (int i = 0; i < 3; i++) {
        alertsToday[i] = 0;
        preferences.putUInt(VIRTUAL_SENSOR_IDS[i], 0);
    }
    return true;
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

    char payload[384];
    serializeJson(doc, payload, sizeof(payload));
    mqttClient.publish(TOPIC_DEVICE_RESPONSE, payload); // PubSubClient publishes at QoS 0.
}

void publishVirtualSensorData() {
    const float temperature = dht.readTemperature();
    const float humidity = dht.readHumidity();
    const int light = analogRead(LDR_PIN);

    JsonDocument doc;
    doc["deviceId"] = "ESP32-01";

    // Keep sending real sensor readings too, so the existing dashboard/data page still works.
    if (!isnan(temperature)) doc["temperature"] = temperature;
    if (!isnan(humidity)) doc["humidity"] = humidity;
    doc["light"] = light;
    if (isnan(temperature) || isnan(humidity)) Serial.println("DHT11 read error; virtual readings continue");

    JsonObject virtualSensors = doc["virtualSensors"].to<JsonObject>();
    for (int i = 0; i < 3; i++) {
        // random(max) returns 0..max-1. For Y=100, the alarm threshold is 50
        // and the alert starts only when the generated value is strictly greater than 50.
        virtualValues[i] = random(SENSOR_Y[i]);
        JsonObject sensor = virtualSensors[VIRTUAL_SENSOR_IDS[i]].to<JsonObject>();
        sensor["name"] = VIRTUAL_SENSOR_NAMES[i];
        sensor["value"] = virtualValues[i];
        sensor["y"] = SENSOR_Y[i];
        sensor["threshold"] = SENSOR_Y[i] * 0.5;
    }

    char payload[768];
    serializeJson(doc, payload, sizeof(payload));
    const bool published = mqttClient.publish(TOPIC_DATA_SENSOR, payload);
    Serial.print("VIRTUAL SENSOR DATA: ");
    Serial.println(payload);
    Serial.println(published ? "Sensor publish OK" : "Sensor publish failed");
}

void publishVirtualAlertState() {
    if (!mqttClient.connected()) return;
    const bool timeSynced = refreshDailyCounters();

    JsonDocument doc;
    doc["esp32Id"] = "ESP32-01";
    doc["date"] = timeSynced ? currentDay : "";
    doc["timeSynced"] = timeSynced;
    JsonArray leds = doc["leds"].to<JsonArray>();
    for (int i = 0; i < 3; i++) {
        JsonObject led = leds.add<JsonObject>();
        led["sensorId"] = VIRTUAL_SENSOR_IDS[i];
        led["name"] = VIRTUAL_SENSOR_NAMES[i];
        led["pin"] = WARNING_LED_PINS[i];
        led["sensorValue"] = virtualValues[i];
        led["y"] = SENSOR_Y[i];
        led["threshold"] = SENSOR_Y[i] * 0.5;
        led["alertActive"] = alertActive[i];
        led["hardwareLedOn"] = warningLedOn[i];
        led["alertsToday"] = alertsToday[i];
    }

    char payload[1024];
    size_t length = serializeJson(doc, payload, sizeof(payload));
    if (length >= sizeof(payload)) {
        Serial.println("Alert snapshot too large; not published");
        return;
    }
    const bool published = mqttClient.publish(TOPIC_VIRTUAL_ALERTS, payload);
    Serial.print("VIRTUAL ALERT STATE: ");
    Serial.println(payload);
    Serial.println(published ? "Alert publish OK" : "Alert publish failed");
}

void startAlert(int index, unsigned long now) {
    alertActive[index] = true;
    warningLedOn[index] = true;
    lastWarningToggle[index] = now;
    digitalWrite(WARNING_LED_PINS[index], HIGH);

    // Count one alert episode (off -> on), not every individual LED blink.
    if (refreshDailyCounters()) {
        alertsToday[index]++;
        preferences.putUInt(VIRTUAL_SENSOR_IDS[index], alertsToday[index]);
    }
}

void stopAlert(int index) {
    alertActive[index] = false;
    warningLedOn[index] = false;
    digitalWrite(WARNING_LED_PINS[index], LOW);
}

bool evaluateAlerts(unsigned long now) {
    bool stateChanged = false;
    refreshDailyCounters();

    for (int i = 0; i < 3; i++) {
        const bool shouldAlert = virtualValues[i] > SENSOR_Y[i] * 0.5;
        if (shouldAlert && !alertActive[i]) {
            startAlert(i, now);
            stateChanged = true;
        } else if (!shouldAlert && alertActive[i]) {
            stopAlert(i);
            stateChanged = true;
        }
    }
    return stateChanged;
}

void updateWarningLeds(unsigned long now) {
    for (int i = 0; i < 3; i++) {
        if (!alertActive[i]) continue;
        const unsigned long duration = warningLedOn[i] ? LED_ON_MS : LED_OFF_MS;
        if (now - lastWarningToggle[i] < duration) continue;

        warningLedOn[i] = !warningLedOn[i];
        digitalWrite(WARNING_LED_PINS[i], warningLedOn[i] ? HIGH : LOW);
        lastWarningToggle[i] = now;
    }
}

int oldLedPinForDevice(int deviceId) {
    if (deviceId < 1 || deviceId > 3) return -1;
    return OLD_LED_PINS[deviceId - 1];
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
    if (strcmp(topic, TOPIC_DEVICE_CONTROL) != 0) return;
    if (length >= 256) {
        Serial.println("Control payload too large");
        return;
    }

    char message[256];
    memcpy(message, payload, length);
    message[length] = '\0';

    JsonDocument doc;
    if (deserializeJson(doc, message)) {
        Serial.println("Invalid control JSON");
        return;
    }

    const char* requestId = doc["requestId"] | "";
    const int deviceId = doc["deviceId"] | -1;
    if (!doc["state"].is<bool>()) {
        publishDeviceResponse(requestId, deviceId, false, false, false, "STATE_MUST_BE_BOOLEAN");
        return;
    }
    const bool requestedState = doc["state"].as<bool>();

    if (deviceId == 0) {
        for (int i = 0; i < 3; i++) {
            oldLedStates[i] = requestedState;
            digitalWrite(OLD_LED_PINS[i], requestedState ? HIGH : LOW);
        }
        publishDeviceResponse(requestId, 0, requestedState, requestedState, true, "ALL_OLD_DEVICES_STATE_CHANGED");
        return;
    }

    const int pin = oldLedPinForDevice(deviceId);
    if (pin < 0) {
        publishDeviceResponse(requestId, deviceId, false, false, false, "INVALID_DEVICE_ID");
        return;
    }
    oldLedStates[deviceId - 1] = requestedState;
    digitalWrite(pin, requestedState ? HIGH : LOW);
    const bool actualState = digitalRead(pin) == HIGH;
    publishDeviceResponse(requestId, deviceId, requestedState, actualState,
                          actualState == requestedState,
                          actualState == requestedState ? "DEVICE_STATE_CHANGED" : "DEVICE_STATE_CHANGE_FAILED");
}

void connectWiFi() {
    if (WiFi.status() == WL_CONNECTED) return;
    const unsigned long now = millis();
    if (wifiStarted && now - lastWiFiAttempt < 10000) return;

    wifiStarted = true;
    lastWiFiAttempt = now;
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    Serial.println("Connecting to Wi-Fi...");
}

void connectMQTT() {
    if (WiFi.status() != WL_CONNECTED || mqttClient.connected()) return;
    const unsigned long now = millis();
    if (mqttAttempted && now - lastMqttAttempt < 3000) return;

    mqttAttempted = true;
    lastMqttAttempt = now;
    String clientId = "ESP32-VIRTUAL-" + String((uint32_t)ESP.getEfuseMac(), HEX);
    if (mqttClient.connect(clientId.c_str(), MQTT_USERNAME, MQTT_PASSWORD)) {
        mqttClient.subscribe(TOPIC_DEVICE_CONTROL);
        Serial.println("MQTT connected; subscribed to device/control");
        publishVirtualAlertState();
    } else {
        Serial.print("MQTT connection failed, state=");
        Serial.println(mqttClient.state());
    }
}

void setup() {
    Serial.begin(115200);
    delay(300);
    randomSeed(esp_random());

    for (int i = 0; i < 3; i++) {
        pinMode(OLD_LED_PINS[i], OUTPUT);
        digitalWrite(OLD_LED_PINS[i], LOW);
        pinMode(WARNING_LED_PINS[i], OUTPUT);
        digitalWrite(WARNING_LED_PINS[i], LOW);
    }
    dht.begin();
    pinMode(LDR_PIN, INPUT);
    analogReadResolution(12);

    if (!preferences.begin("virtual-alert", false)) {
        Serial.println("Cannot open NVS storage for daily alert counts");
    } else {
        String savedDay = preferences.getString("day", "");
        snprintf(currentDay, sizeof(currentDay), "%s", savedDay.c_str());
        for (int i = 0; i < 3; i++) {
            alertsToday[i] = preferences.getUInt(VIRTUAL_SENSOR_IDS[i], 0);
        }
    }

    mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
    mqttClient.setCallback(mqttCallback);
    mqttClient.setBufferSize(1200);
    mqttClient.setSocketTimeout(1);

    WiFi.mode(WIFI_STA);
    connectWiFi();
    lastSensorRead = millis() - SENSOR_INTERVAL_MS;
}

void loop() {
    const unsigned long now = millis();
    connectWiFi();

    if (WiFi.status() == WL_CONNECTED && !mqttClient.connected()) {
        static bool ntpStarted = false;
        if (!ntpStarted) {
            configTime(GMT_OFFSET_SECONDS, 0, "pool.ntp.org", "time.nist.gov");
            ntpStarted = true;
        }
        connectMQTT();
    }

    if (mqttClient.connected()) mqttClient.loop();

    if (now - lastSensorRead >= SENSOR_INTERVAL_MS) {
        lastSensorRead = now;
        publishVirtualSensorData();
        evaluateAlerts(millis());
        publishVirtualAlertState();
        lastAlertSnapshot = now;
    }

    updateWarningLeds(millis());

    if (mqttClient.connected() && millis() - lastAlertSnapshot >= ALERT_SNAPSHOT_MS) {
        lastAlertSnapshot = millis();
        publishVirtualAlertState();
    }
}
