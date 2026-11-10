# Cảnh báo cảm biến ảo

## Vận hành

1. Mở `firmware/SmartRoomVirtual/SmartRoomVirtual.ino` trong Arduino IDE. Kiểm tra Wi-Fi và địa chỉ MQTT Broker trước khi nạp.
2. Ba LED cảnh báo mới nối GPIO25, GPIO26, GPIO27; mỗi LED có một điện trở nối tiếp 220–330 Ω và chân âm về GND.
3. Chạy `npm run dev` trong `iot-be` và `iot-fe`, đăng nhập rồi mở menu **Đếm nháy đèn** (`#/blink-counts`).

Sketch random ba giá trị trong khoảng 0…y−1 mỗi 5 giây; mặc định y=100. Giá trị > y/2 kích hoạt LED tương ứng, sáng 500 ms rồi tắt 500 ms. Giá trị bằng ngưỡng không cảnh báo. Một lượt là một lần chuyển từ không cảnh báo sang cảnh báo; chuỗi 40 → 70 → 80 → 30 → 60 tính 2 lượt. Không đếm từng nhịp nháy.

Ba LED cũ GPIO18/19/21 vẫn điều khiển thủ công. DHT11/LDR vẫn gửi số đo thật lên `data/sensor` để các trang hiện có tiếp tục hoạt động.

## MySQL

Database hiện tại đã được tạo hai bảng `VirtualAlertState` và `VirtualAlertDaily`. Nếu dùng database khác, chọn đúng database rồi chạy riêng `iot-be/database/migrations/003_virtual_alerts.sql`. Không cần chạy lại seed. Cài mới bằng `npm run db:init` đã có hai bảng trong schema.

Backend lưu tổng cảnh báo/ngày bằng giá trị lớn nhất ESP32 gửi, không cộng lặp. ESP32 giữ bộ đếm ngày hiện tại trong NVS qua reset. Không xóa NVS trong lúc thống kê: xóa NVS làm mất bộ đếm tại thiết bị, không thể nối lại chính xác bằng dữ liệu đã mất.

ESP32 cần đồng bộ NTP để xác định ngày GMT+7. Khi chưa có ngày hợp lệ, đèn vẫn hoạt động nhưng các lượt đó không được tự gán vào một ngày. ESP32 chỉ lưu bộ đếm ngày hiện tại, không lưu toàn bộ lịch sử offline qua nhiều ngày; MySQL giữ các ngày đã nhận được.

## MQTT và API

Topic mới: `sensor/virtual-alerts`, mặc định trong `MQTT_VIRTUAL_ALERTS_TOPIC`. ESP32 gửi bản tin sau mỗi lần random và khi MQTT kết nối lại. Topic `data/sensor` còn chứa `virtualSensors`, nhưng trạng thái và thống kê của màn hình mới được xử lý riêng từ `sensor/virtual-alerts`.

```json
{
  "esp32Id": "ESP32-01",
  "date": "20261104",
  "timeSynced": true,
  "leds": [
    {"sensorId":"sensor1","pin":25,"sensorValue":70,"y":100,"threshold":50,"alertActive":true,"hardwareLedOn":true,"alertsToday":2},
    {"sensorId":"sensor2","pin":26,"sensorValue":50,"y":100,"threshold":50,"alertActive":false,"hardwareLedOn":false,"alertsToday":0},
    {"sensorId":"sensor3","pin":27,"sensorValue":20,"y":100,"threshold":50,"alertActive":false,"hardwareLedOn":false,"alertsToday":1}
  ]
}
```

- `GET /api/virtual-alerts?esp32Id=ESP32-01`: ba LED, số đo, ngưỡng, trạng thái, ngày và thời điểm Backend nhận (ISO UTC).
- `GET /api/virtual-alerts/daily?esp32Id=ESP32-01&from=2026-11-01&to=2026-11-07`: bảng theo ngày giảm dần, chỉ gồm ngày có bản ghi trong MySQL. Mặc định lọc 7 ngày gần nhất GMT+7, tối đa 31 ngày. Không tạo dòng cho ngày trống; 0 là đã có báo cáo với 0 lượt.

Hai API cần Bearer token. Tài khoản chỉ xem cũng truy cập được; trang này không có công tắc điều khiển đèn hoặc sửa ngưỡng. Swagger tại `/api-docs`.

Backend phát `virtual-alerts:updated` sau khi transaction thành công. Frontend lấy lại dữ liệu khi nhận sự kiện hoặc kết nối lại. Biểu tượng đèn nháy bằng CSS theo `alertActive`, không đồng bộ chính xác pha sáng/tắt với GPIO. Sau 15 giây không nhận snapshot mới, đèn mô phỏng dừng và hiển thị **Mất cập nhật**; không kết luận LED thật đã tắt.

## Kiểm tra

Trong `iot-be`: `node --test test/virtual-alerts.test.js`. Cần database đã có schema/migration. Test tạo mã ESP32 và tài khoản thử ngẫu nhiên, chỉ xóa đúng dữ liệu thử khi hoàn tất.

Trong `iot-fe`: `npm run build` và `npm run lint`.

Trên phần cứng: kiểm tra giá trị dưới/bằng/trên ngưỡng, cả ba LED, đổi ngày, reset giữ NVS và mất/kết nối lại Wi-Fi/MQTT. Để thử ngưỡng có kiểm soát, tạm thay giá trị random bằng 49, 50, 51; sau đó khôi phục random.
