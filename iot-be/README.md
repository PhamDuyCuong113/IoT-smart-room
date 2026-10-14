# Smart Room API

Backend Express + MySQL cho giao diện Smart Room. MQTT và Socket.IO tự bật khi cấu hình broker; nếu `MQTT_URL` để trống, API HTTP vẫn chạy bình thường.

Các API HTTP được viết trực tiếp bằng `app.get()` / `app.post()` trong `src/app.js` để tiện tìm và sửa.

Đăng nhập chỉ kiểm tra mật khẩu, không tạo session hoặc token. API không xác thực người gọi; hồ sơ truy cập theo ID và lệnh thiết bị ghi người thực hiện là `Hệ thống`.

## Chạy

1. Cài Node.js 18+ và MySQL.
2. Điền thông tin MySQL trong `.env`, sau đó khởi tạo schema và dữ liệu cơ bản:

   ```sh
   npm run db:init
   ```

3. Cài dependencies và chạy:

   ```sh
   npm install
   npm run dev
   ```

## API

- `POST /api/auth/register` `{ "username", "password", "fullName" }` → thông tin người dùng
- `POST /api/auth/login` `{ "username", "password" }` → thông tin người dùng
- `GET, PUT /api/profile/:id` (hồ sơ gồm các trường trong schema)
- `GET /api/dashboard` — số đo mới nhất, chuỗi 6 giờ, thiết bị
- `GET /api/sensor-data?q=&by=all&sort=newest&page=1&limit=10`
- `POST /api/sensor-data` `{ "sensor_id": 1, "value": 27.4 }`
- `PATCH /api/devices/:id/status` `{ "status": "ON" }` (tự ghi lịch sử)
- `GET /api/activity-history?device=&action=&status=&user=&from=&sort=newest&page=1&limit=10`
- `GET /api/health` — kiểm tra API và kết nối database

ESP32 gửi JSON `{ "deviceId": "ESP32-01", "temperature": 27.4, "humidity": 68, "light": 1250 }` trên `data/sensor`; backend lưu thành ba bản ghi cảm biến. Lệnh điều khiển từng thiết bị gửi tới `device/control` với `{ "requestId", "deviceId": 1, "state": true }` (ID 1–3), ESP32 phản hồi trên `device/response`. Socket.IO phát `sensor:new` và `device:updated`.
