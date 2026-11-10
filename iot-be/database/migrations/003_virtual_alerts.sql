CREATE TABLE IF NOT EXISTS VirtualAlertState (
  esp32_id VARCHAR(64) NOT NULL,
  sensor_id VARCHAR(16) NOT NULL,
  value INT NOT NULL,
  max_value INT NOT NULL,
  threshold DOUBLE NOT NULL,
  alert_active BOOLEAN NOT NULL,
  hardware_led_on BOOLEAN NOT NULL,
  time_synced BOOLEAN NOT NULL,
  alert_date DATE NULL,
  received_at DATETIME(3) NOT NULL,
  PRIMARY KEY (esp32_id, sensor_id)
);

CREATE TABLE IF NOT EXISTS VirtualAlertDaily (
  esp32_id VARCHAR(64) NOT NULL,
  alert_date DATE NOT NULL,
  sensor_id VARCHAR(16) NOT NULL,
  alert_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (esp32_id, alert_date, sensor_id)
);
