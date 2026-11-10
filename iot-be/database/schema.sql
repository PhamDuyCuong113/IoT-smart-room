CREATE DATABASE IF NOT EXISTS smart_room CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE smart_room;

CREATE TABLE IF NOT EXISTS `User` (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  fullName VARCHAR(255) NOT NULL,
  student_id VARCHAR(20),
  `class` VARCHAR(20),
  email VARCHAR(50),
  phone VARCHAR(20),
  github VARCHAR(255),
  figma VARCHAR(255),
  report VARCHAR(255),
  postman VARCHAR(255),
  role VARCHAR(50) NOT NULL DEFAULT 'Người dùng'
);

CREATE TABLE IF NOT EXISTS Device (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  status VARCHAR(10) NOT NULL DEFAULT 'OFF'
);

CREATE TABLE IF NOT EXISTS Sensor (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  unit VARCHAR(20) NOT NULL
);

CREATE TABLE IF NOT EXISTS DataSensor (
  id INT AUTO_INCREMENT PRIMARY KEY,
  value DOUBLE NOT NULL,
  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sensor_id INT NOT NULL,
  INDEX idx_data_sensor_time (sensor_id, recorded_at),
  FOREIGN KEY (sensor_id) REFERENCES Sensor(id)
);

CREATE TABLE IF NOT EXISTS ActionHistory (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  device_id INT NOT NULL,
  action VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL,
  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES `User`(id) ON DELETE SET NULL,
  FOREIGN KEY (device_id) REFERENCES Device(id)
);

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
