# IoT backend

## Chạy ứng dụng

```powershell
npm install
npm run db:init
npm run dev
```

`npm run db:init` khởi tạo schema của database được cấu hình trong `.env`. `npm start` chạy server ở chế độ thường.

## Xem dữ liệu ESP32 trong terminal

Chạy `npm run dev` tại `iot-be`. Backend in `MQTT connected` khi kết nối Broker, sau đó in xác nhận từng topic đã được Broker chấp nhận. Mỗi bản tin nhận được đều có topic và payload, ví dụ:

```text
[MQTT] Đã đăng ký data/sensor (QoS 0).
[MQTT] Nhận data/sensor: {"deviceId":"ESP32-01","temperature":29.5,"humidity":68,"light":2350}
[MQTT] Nhận sensor/virtual-alerts: {"esp32Id":"ESP32-01",...}
[MQTT] Nhận device/response: {"esp32Id":"ESP32-01",...}
```

Log `Nhận` xuất hiện trước bước giải mã/ghi database, nên chỉ xác nhận backend đã nhận bản tin MQTT. Nếu xử lý thất bại, lỗi tương ứng được in tiếp trong terminal. Nếu chưa có log kết nối hoặc đăng ký topic, kiểm tra `MQTT_URL`, Broker và thông tin đăng nhập trong `.env`; nếu đã đăng ký nhưng không có bản tin, kiểm tra kết nối ESP32 và topic publish có khớp không. Khi chạy bằng `npm start`, khởi động lại BE sau khi sửa code; `npm run dev` tự khởi động lại khi file thay đổi.

Sketch ESP32 hiện dùng cổng MQTT `1888`. Broker cần lắng nghe trên địa chỉ mạng mà ESP32 truy cập được và đúng cổng này. Nếu Mosquitto chỉ lắng nghe `127.0.0.1:1883`, kết nối tới `192.168.137.1:1888` sẽ không tới listener đó; cần cấu hình listener Broker phù hợp với cả BE và ESP32.

## Tìm code theo chức năng

Mỗi chức năng nằm trong một file tại `src/modules/`, ví dụ `sensors.js` hoặc `devices.js`. API được khai báo trực tiếp bằng `app.get`, `app.post`, `app.patch` trong file đó; request, response và truy vấn database nằm cạnh nhau.

- MQTT handler trong `src/integrations/mqtt/` giải mã bản tin rồi gọi hàm của module tương ứng.
- `src/integrations/websocket/` quản lý Socket.IO và tên sự kiện; middleware dùng chung ở `src/middlewares/`.
- API mới cần được khai báo trong file chức năng và thêm vào danh sách endpoint trong `src/modules/system.js`. Đặc tả Swagger ở `src/docs/openapi.js`.

## Kiểm thử

`npm test` chạy unit test, không cần MySQL.

Integration test dùng database riêng có tên kết thúc bằng `_test`. Tạo cấu hình cục bộ, điền thông tin MySQL và giữ database này tách biệt với database phát triển:

```powershell
Copy-Item .env.test.example .env.test
npm run db:init:test
npm run test:integration
```

Không chạy test integration trên database phát triển hoặc production. Có thể chạy riêng bộ cảnh báo bằng `node --test test/virtual-alerts.test.js`; test này cũng nạp `.env.test` và từ chối tên database không kết thúc bằng `_test`.
