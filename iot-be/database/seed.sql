USE smart_room;

INSERT INTO Sensor (name, unit) VALUES
  ('DHT11 - Nhiệt độ', '°C'), ('DHT11 - Độ ẩm', '%'), ('Cảm biến ánh sáng', 'lux')
ON DUPLICATE KEY UPDATE unit = VALUES(unit);

INSERT INTO Device (name, status) VALUES
  ('Quạt', 'ON'), ('Đèn', 'ON'), ('Điều hòa', 'OFF')
ON DUPLICATE KEY UPDATE name = VALUES(name);
