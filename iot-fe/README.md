# SMART ROOM — Frontend

Giao diện React + CSS trên Vite với dữ liệu mẫu dùng chung giữa dashboard và bảng cảm biến. Không sử dụng thư viện UI, router hay biểu đồ bên ngoài.

## Chạy dự án

```sh
npm install
npm run dev
```

```sh
npm run build
npm run preview
```

## Cấu trúc

```text
src/
  App.jsx                 # Route và layout điều hướng chung
  App.css                 # CSS layout và thành phần chung
  index.css               # CSS nền tảng
  pages/
    Dashboard/            # Tổng quan, biểu đồ SVG, thiết bị ảo
    SensorData/           # Tìm kiếm, lọc và phân trang dữ liệu cảm biến
    ActivityHistory/      # Bộ lọc và bảng lịch sử hoạt động
    Profile/              # Hồ sơ và liên kết dự án
  components/             # Tiêu đề, phân trang, biểu đồ
  data/mockData.js        # 73 mốc cảm biến, 219 bản ghi và lịch sử mẫu
  data/MockRoomProvider.jsx # Trạng thái thiết bị và lịch sử điều khiển mẫu
  data/useMockRoom.js     # Context và hook truy cập phòng mẫu
  utils/                  # Thời gian và lưu hồ sơ
```

## Route

| Trang             | URL                   |
| ----------------- | --------------------- |
| Dashboard         | `/#/dashboard`        |
| Dữ liệu cảm biến  | `/#/sensor-data`      |
| Lịch sử hoạt động | `/#/activity-history` |
| Hồ sơ             | `/#/profile`          |

Route dùng hash và sự kiện `hashchange`; hỗ trợ Back/Forward, mở trực tiếp và tải lại trên static hosting. Ứng dụng mở thẳng Dashboard, không yêu cầu tài khoản.

## Chức năng demo

- Dashboard tự co theo chiều cao màn hình; hiển thị cả ba biểu đồ trên desktop. Điện thoại và màn hình thấp dùng nút chuyển biểu đồ để giữ nội dung trong một màn hình. Màn hình quá nhỏ hoặc khi phóng to vẫn có thể cuộn để đọc đủ nội dung.
- Biểu đồ SVG đen trắng đơn giản, đường nét mảnh trên nền trắng, trục giờ UTC+7, hiển thị 6 giờ gần nhất, số liệu thấp nhất/trung bình/cao nhất và tooltip khi rê chuột/chạm. Có thể dùng phím trái/phải, Home/End để xem điểm dữ liệu.
- Mock data gồm 73 mốc cách nhau 5 phút từ 04:45 đến 10:45 ngày 07/10/2026 (UTC+7). Các thẻ chỉ số, điểm cuối biểu đồ và bảng cảm biến luôn dùng cùng số đo.
- Công tắc thay đổi trạng thái thiết bị, thêm bản ghi vào lịch sử với thời gian thao tác thực tế và lưu bằng localStorage; giữ trạng thái khi chuyển trang hoặc tải lại.
- Cảm biến chọn tìm theo tất cả dữ liệu, thời gian, giá trị, tên thiết bị hoặc ID; hỗ trợ từ khóa không dấu và lọc thiết bị kết hợp. Sắp xếp gồm Tất cả (mặc định, giữ thứ tự dữ liệu), Mới nhất và Cũ nhất; hai lựa chọn thời gian dùng ID để phân thứ tự khi trùng thời gian. Phân trang 219 bản ghi, mặc định 10 dòng; đổi tìm kiếm hoặc thứ tự sắp xếp sẽ về trang đầu. Thanh phân trang chỉ hiển thị các trang gần trang hiện tại và hai đầu.
- Lịch sử lọc thiết bị, thao tác, trạng thái, người thực hiện và thời điểm bắt đầu (`DD/MM/YYYY HH:mm:ss`). Sắp xếp theo Mới nhất (mặc định) hoặc Cũ nhất, tính theo thời gian ghi nhận và ID khi trùng thời gian; thay đổi thứ tự sẽ về trang đầu. Có đặt lại bộ lọc, thứ tự sắp xếp và phân trang.
- Hồ sơ lưu bằng localStorage; tên người dùng được ghi vào lịch sử thao tác thiết bị, vai trò chỉ đọc.

Chưa tích hợp backend, MQTT hoặc ESP32. Dữ liệu cảm biến là một snapshot cố định, không tự cập nhật; thao tác thiết bị được mô phỏng trên frontend. Các trang dữ liệu có thể truy cập trực tiếp trong bản demo.
