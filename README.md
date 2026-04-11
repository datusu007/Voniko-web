# PLC Control — Hệ Thống Quản Lý Phiên Bản File PLC

> 🏭 Mini Git Server nội bộ dành cho kỹ sư PLC — Chạy 24/7 trong mạng LAN, không cần Internet

[![JavaScript](https://img.shields.io/badge/JavaScript-99.5%25-F7DF1E?logo=javascript&logoColor=black)](https://github.com/Orsted-LTA/PLC-Control)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![Python](https://img.shields.io/badge/Python-3.9+-3776AB?logo=python&logoColor=white)](https://python.org)
[![License](https://img.shields.io/badge/License-Private-red)](https://github.com/Orsted-LTA/PLC-Control)

---

## 📋 Tổng Quan

**PLC Control** là hệ thống quản lý phiên bản file nội bộ, được xây dựng cho môi trường sản xuất công nghiệp. Mỗi lần kỹ sư upload file PLC → hệ thống tự động tạo version mới, lưu toàn bộ lịch sử, cho phép so sánh và khôi phục về bất kỳ phiên bản nào — tương tự Git nhưng dành riêng cho file máy PLC.

### ✨ Tính Năng Chính

| Tính năng | Mô tả |
|---|---|
| 📁 **Quản lý file & thư mục** | Cấu trúc Line → Machine, hỗ trợ mọi định dạng file PLC |
| 🔢 **Version Control** | Mỗi upload tạo version mới, lưu lịch sử đầy đủ với commit message |
| 🔍 **Diff View** | So sánh nội dung 2 phiên bản với highlight thay đổi, hỗ trợ fullscreen |
| 📄 **Office Diff** | Trích xuất và so sánh nội dung file Word, Excel, PowerPoint, CSV, RTF |
| ↩️ **Restore** | Khôi phục về bất kỳ phiên bản cũ nào, tự động tạo backup WAL |
| 🔒 **File Lock/Unlock** | Khóa file khi đang chỉnh sửa, ngăn xung đột giữa nhiều kỹ sư |
| 🔔 **Thông báo Real-time** | SSE (Server-Sent Events) hiển thị hoạt động tức thì |
| 🟢 **Trạng thái Online** | Xem ai đang online trong hệ thống theo thời gian thực |
| 💾 **Backup tự động** | Tự động backup DB theo lịch, có thể duyệt và khôi phục từ snapshot |
| 👥 **Phân quyền** | Admin / Kỹ sư (Editor) / Chỉ xem (Viewer) |
| 📊 **Dashboard & Audit Log** | Thống kê tổng quan và lịch sử toàn bộ hoạt động hệ thống |
| 🌐 **Đa ngôn ngữ** | Tiếng Việt 🇻🇳 · English 🇬🇧 · 中文 🇨🇳 |
| 📤 **Upload lớn** | Hỗ trợ file lên đến **5 GB** |
| 🔋 **Kiểm tra Pin** | Hệ thống kiểm tra OCV/CCV IT8511A+ tích hợp trực tiếp vào giao diện web |

---

## 🏗️ Kiến Trúc Hệ Thống

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PLC Control Server                           │
│                                                                     │
│  ┌──────────────────┐      ┌──────────────────────────────────────┐ │
│  │    Frontend      │      │            Backend                   │ │
│  │  React 18 + Vite │─────▶│  Node.js + Express                   │ │
│  │   Ant Design 5   │      │  REST API + SSE + WebSocket (/ws)    │ │
│  │   ECharts        │◀─────│  (Port 3001)                         │ │
│  │   (Port 3000)    │      └──────────┬──────────────┬────────────┘ │
│  └──────────────────┘                 │              │              │
│                              ┌────────▼──────┐  ┌───▼───────────┐  │
│                              │  SQLite DB    │  │ Python FastAPI │  │
│                              │ ./data/plc.db │  │  Port 8765    │  │
│                              └───────────────┘  │  hardware-    │  │
│                                                 │  services/    │  │
│                              ┌────────────────┐ │  IT8511A+     │  │
│                              │  File Storage  │ │  via VISA/COM │  │
│                              │  ./uploads/    │ └───────────────┘  │
│                              └────────────────┘                    │
└─────────────────────────────────────────────────────────────────────┘
```

### Stack Công Nghệ

| Layer | Technology |
|---|---|
| **Backend** | Node.js 18+ · Express 4 · better-sqlite3 |
| **Auth** | JWT (access token + refresh token) |
| **Real-time** | SSE (Server-Sent Events) · WebSocket (`ws`) |
| **Frontend** | React 18 · Vite · Ant Design 5 · ECharts |
| **Diff Engine** | diff · diff2html |
| **Office Parser** | xlsx · mammoth · pptx2json |
| **Hardware Service** | Python 3.9+ · FastAPI · pyvisa · pyserial · openpyxl |
| **Font** | Inter · Noto Sans · Noto Sans SC |

---

## 📁 Cấu Trúc Project

```
PLC-Control/
├── backend/
│   ├── src/
│   │   ├── config/         # Cấu hình port, JWT, storage
│   │   ├── middleware/     # Auth, error handler, SSE
│   │   ├── models/         # Database schema & khởi tạo
│   │   ├── routes/         # API routes (bao gồm battery.js)
│   │   ├── controllers/    # Business logic
│   │   └── utils/          # Logger, file utils, diff, backup, batterySocket
│   ├── .env.example
│   ├── package.json
│   └── server.js           # HTTP server + WebSocket init
│
├── frontend/
│   ├── src/
│   │   ├── api/            # Axios client (battery.js)
│   │   ├── components/     # Layout, CommitGraph, FileDiff
│   │   ├── contexts/       # AuthContext, LangContext
│   │   ├── locales/        # vi.js · en.js · zh.js (+ battery keys)
│   │   └── pages/          # Login, Dashboard, Files, FileDetail,
│   │                       # History, Users, Profile, BackupViewer,
│   │                       # Barcode, Battery
│   ├── index.html
│   ├── package.json
│   └── vite.config.js      # Proxy: /api + /ws → localhost:3001
│
├── hardware-services/       # Python headless battery test service
│   ├── battery_service.py  # FastAPI app — SCPI logic, OCV/CCV, SSE, Excel
│   ├── requirements.txt    # fastapi, uvicorn, pyvisa, pyserial, openpyxl
│   └── README.md           # Setup & API docs
│
├── .gitignore
└── README.md
```

---

## ⚙️ Yêu Cầu Môi Trường

| Software | Version | Ghi chú |
|---|---|---|
| Node.js | 18+ | LTS recommended |
| npm | 9+ | Đi kèm Node.js |
| Python | 3.9+ | Chỉ cần nếu dùng module kiểm tra pin |
| OS | Windows / Linux / macOS | Đã test trên Windows Server & Ubuntu |

---

## 🚀 Cài Đặt & Chạy

### 1. Clone repo

```bash
git clone https://github.com/Orsted-LTA/PLC-Control.git
cd PLC-Control
```

### 2. Cài đặt Backend

```bash
cd backend
npm install
cp .env.example .env
# Chỉnh sửa .env nếu cần (port, JWT secret, v.v.)
```

### 3. Cài đặt Frontend

```bash
cd ../frontend
npm install
```

### 4. Chạy hệ thống

**Backend** (cổng 3001):
```bash
cd backend
node server.js
```

**Frontend** (cổng 3000):
```bash
cd frontend
npm run dev
```

Truy cập: `http://localhost:3000` hoặc `http://<IP-máy-chủ>:3000`

### 5. Tài khoản mặc định

| Vai trò | Username | Password |
|---|---|---|
| Admin | `admin` | `admin123` |

> ⚠️ **Đổi mật khẩu ngay sau lần đăng nhập đầu tiên!**

---

## 🔋 Hệ Thống Kiểm Tra Pin (Battery Test Module)

Tích hợp trực tiếp vào giao diện web, cho phép vận hành máy kiểm tra điện tử **IT8511A+** để đo OCV/CCV pin mà không cần phần mềm desktop riêng.

### Kiến Trúc Module

```
[Browser — BatteryPage.jsx]
        │  WebSocket  ws://host/ws/battery
        │  REST       /api/battery/*
        ▼
[Node.js — batterySocket.js + routes/battery.js]
        │  HTTP proxy  →  localhost:8765
        │  SSE relay   ←  localhost:8765/stream
        ▼
[Python FastAPI — hardware-services/battery_service.py]
        │  pyvisa SCPI  →  IT8511A+ qua cổng COM/USB
        │  hoặc Simulation Mode (không cần phần cứng)
        ▼
[Excel Report — hardware-services/reports/{order}_{date}.xlsx]
```

### Cài Đặt Python Service

```bash
cd hardware-services
python -m venv venv

# Windows
venv\Scripts\activate
# Linux/macOS
source venv/bin/activate

pip install -r requirements.txt
```

### Khởi Động Service

```bash
# Trong hardware-services/ (sau khi activate venv)
uvicorn battery_service:app --host 127.0.0.1 --port 8765
```

> Service sẽ chạy tại `http://127.0.0.1:8765`
> API docs: `http://127.0.0.1:8765/docs`

### Sử Dụng

1. Khởi động Node.js backend và Python service
2. Mở trình duyệt → vào mục **🔋 Kiểm tra Pin** trong menu trái
3. Chọn cổng COM và kết nối (hoặc bật **Simulation Mode** nếu không có phần cứng)
4. Nhập thông số: Mã đơn hàng, Ngày, Điện trở (Ω), Thời gian OCV/Load, Hệ số K
5. Nhấn **Bắt đầu** — hệ thống tự động: Chờ pin → Đo OCV → Đặt tải → Đo CCV → Lưu Excel → Chờ lấy pin ra
6. Nhấn **Tải báo cáo Excel** để tải file kết quả

### Chế Độ Simulation

Bật checkbox **Simulation Mode** trước khi kết nối → hệ thống tạo dữ liệu ngẫu nhiên, không cần phần cứng IT8511A+.

### API Endpoints (Battery)

| Method | Endpoint | Mô tả |
|---|---|---|
| `GET` | `/api/battery/ports` | Danh sách cổng COM khả dụng |
| `GET` | `/api/battery/status` | Trạng thái phiên kiểm tra hiện tại |
| `GET` | `/api/battery/health` | Kiểm tra kết nối tới Python service |
| `GET` | `/api/battery/report/download` | Tải xuống báo cáo Excel |
| `WS` | `/ws/battery` | WebSocket: stream live data + điều khiển |

### WebSocket Messages

Gửi lên (client → server):
```json
{ "action": "get_ports" }
{ "action": "connect", "payload": { "port": "COM3", "baud_rate": 115200, "simulation": false } }
{ "action": "start", "payload": { "order_id": "ORD-001", "date": "2026-04", "resistance": 3.9, "ocv_time": 2.0, "load_time": 2.0, "coeff": 1.0 } }
{ "action": "stop" }
{ "action": "clear_session" }
```

Nhận về (server → client):
```json
{ "type": "ports", "ports": ["COM3", "COM4"] }
{ "type": "connect_result", "ok": true, "message": "IT8511A+ V1.0" }
{ "type": "reading", "elapsed": 1.2, "voltage": 3.945, "phase": "ocv" }
{ "type": "record", "record": { "id": 1, "ocv": 3.945, "ccv": 3.712, "time": "09:32:15" } }
{ "type": "status", "text": "Waiting for battery ID 2..." }
{ "type": "error", "message": "Lost connection to instrument" }
```

---

## 🗂️ Phân Quyền

| Quyền | Admin | Editor | Viewer |
|---|:---:|:---:|:---:|
| Xem file & lịch sử | ✅ | ✅ | ✅ |
| Upload version mới | ✅ | ✅ | ❌ |
| Khóa / Mở khóa file | ✅ | ✅ | ❌ |
| Khôi phục phiên bản | ✅ | ✅ | ❌ |
| Quản lý người dùng | ✅ | ❌ | ❌ |
| Xem Audit Log | ✅ | ❌ | ❌ |
| Backup & Restore DB | ✅ | ❌ | ❌ |
| Kiểm tra Pin (Battery) | ✅ | ✅ | ✅ |

---

## 🔌 API Endpoints Chính

| Method | Endpoint | Mô tả |
|---|---|---|
| `POST` | `/api/auth/login` | Đăng nhập |
| `GET` | `/api/files` | Danh sách file |
| `POST` | `/api/files` | Upload file / version mới |
| `GET` | `/api/files/:id` | Chi tiết file + lịch sử |
| `GET` | `/api/versions/diff` | So sánh 2 phiên bản |
| `POST` | `/api/versions/:id/restore` | Khôi phục phiên bản |
| `GET` | `/api/versions/:id/download` | Tải về |
| `POST` | `/api/files/:id/lock` | Khóa file |
| `POST` | `/api/files/:id/unlock` | Mở khóa file |
| `GET` | `/api/activity` | Audit log hoạt động |
| `GET` | `/api/sse/events` | Real-time SSE stream |
| `GET` | `/api/backups` | Danh sách backup |
| `POST` | `/api/backups/restore` | Khôi phục từ backup |
| `GET` | `/api/battery/ports` | Danh sách cổng COM |
| `GET` | `/api/battery/report/download` | Tải báo cáo Excel pin |
| `WS` | `/ws/battery` | WebSocket kiểm tra pin |

---

## 🖥️ Giao Diện

- **Dashboard** — Thống kê tổng quan: số file, phiên bản, dung lượng, hoạt động gần đây
- **Quản lý File** — Duyệt file theo cấu trúc Line/Machine, tìm kiếm, lọc
- **Chi tiết File** — Timeline phiên bản dạng Git graph, so sánh diff, khóa file
- **Diff Fullscreen** — Mở rộng toàn màn hình để đọc diff dễ hơn
- **Lịch sử Hoạt động** — Audit log toàn hệ thống
- **Quản lý Người dùng** — Tạo, phân quyền, vô hiệu hoá tài khoản (Admin)
- **Backup Viewer** — Duyệt và khôi phục file từ snapshot backup
- **Hồ sơ cá nhân** — Đổi tên, avatar, mật khẩu
- **Tạo Barcode** — Tạo PDF barcode từ file CSV/Excel đơn hàng
- **🔋 Kiểm tra Pin** — Kết nối IT8511A+, đo OCV/CCV real-time, biểu đồ điện áp ECharts, báo cáo Excel

---

## 🌐 Đa Ngôn Ngữ

Hệ thống hỗ trợ 3 ngôn ngữ, chuyển đổi ngay lập tức không cần reload trang:

| | Tiếng Việt 🇻🇳 | English 🇬🇧 | 中文 🇨🇳 |
|---|---|---|---|
| Header toolbar | Nút VI / EN / 中文 | Same | Same |
| User dropdown menu | Menu Ngôn ngữ | Language menu | 语言菜单 |
| Lưu lựa chọn | `localStorage` | `localStorage` | `localStorage` |

---

## 🌐 Triển Khai Trong Mạng LAN

Hệ thống được thiết kế chạy trên HTTP thuần (không cần HTTPS) trong mạng nội bộ:

```bash
# Chạy backend lắng nghe tất cả interface
HOST=0.0.0.0 node server.js

# Kỹ sư truy cập từ máy khác trong mạng
http://192.168.1.100:3000
```

- ✅ Không cần Internet
- ✅ Không cần domain hay SSL
- ✅ Hỗ trợ tên file CJK (Tiếng Trung, Tiếng Việt có dấu)
- ✅ Tương thích Windows Server & Ubuntu
- ✅ Module kiểm tra pin chạy cục bộ trên máy chủ, không cần mạng phụ

---

## 📝 Biến Môi Trường

```env
# backend/.env
PORT=3001
JWT_SECRET=your-secret-key-here
JWT_REFRESH_SECRET=your-refresh-secret-here
UPLOAD_DIR=./uploads
DATA_DIR=./data
BACKUP_DIR=./backups

# URL tới Python battery service (mặc định cổng 8765)
BATTERY_SERVICE_URL=http://127.0.0.1:8765
```

---

## 📄 License

Dự án nội bộ — All rights reserved © 2026 Orsted-LTA
