<div dir="rtl">

# 💬 فل‌فل‌چت

**فل‌فل‌چت** یک پیام‌رسان بلادرنگ مدرن و امن است که با Next.js، Rust و MongoDB ساخته شده. این پروژه برای استقرار روی سرور خودتان (self-hosted) طراحی شده و از ویژگی‌هایی مانند تماس صوتی، رمزنگاری، چندزبانگی و پنل مدیریت پیشرفته برخوردار است.

---

## ✨ ویژگی‌ها

- **پیام‌رسانی بلادرنگ** — چت گروهی و خصوصی با Socket.IO
- **تماس صوتی** — تماس یک‌به‌یک از طریق WebRTC با TURN/STUN
- **رمزنگاری هوشمند** — پیام‌های حساس با `hushCrypto` رمزگذاری می‌شوند
- **آپلود فایل** — ارسال تصویر، ویدیو، PDF و سایر فایل‌ها (با فشرده‌سازی خودکار)
- **استیکر و GIF** — پشتیبانی از استیکر و GIF اختصاصی
- **احراز هویت امن** — JWT در کوکی، هشینگ رمز عبور با bcrypt
- **پنل مدیریت** — مدیریت کاربران، اتاق‌ها، تماس‌ها، پشتیبان‌گیری و ذخیره‌سازی
- **چندزبانگی** — پشتیبانی از فارسی و انگلیسی (RTL/LTR)
- **طراحی موبایل‌محور** — رابط کاربری شبیه تلگرام با فولدرها، منوی همبرگری و ۱۰۰dvh
- **لاگ حسابرسی** — ثبت تمامی رویدادهای مهم سیستم
- **پشتیبان‌گیری امن** — پشتیبان‌گیری قابل‌ تأیید با امضای رمزنگاری
- **نرخ‌محدودی** — محافظت در برابر سوءاستفاده از API
- **مانیتورینگ** — یکپارچه‌سازی با Sentry

---

## 🏗️ معماری و تکنولوژی‌ها

| بخش | تکنولوژی |
| -------------- | -------------------------------- |
| فریم‌ورک | Next.js 16 (App Router) |
| بک‌اند | Rust (Axum + Socket.IO) |
| پایگاه داده | MongoDB |
| احراز هویت | JWT + bcrypt |
| استایل | Tailwind CSS 4 + Vanilla CSS |
| فونت | Vazirmatn (فارسی) + Sora (لاتین) |
| تماس صوتی | WebRTC + Google STUN + Open Relay TURN |
| مانیتورینگ | Sentry |
| زبان | TypeScript |

---

## 📱 طراحی موبایل

رابط کاربری موبایل بر اساس الگوی تلگرام طراحی شده:

- **لیست چت تمام‌صفحه** — بدون کشوی پایین، لیست چت‌ها صفحه اصلی موبایل است
- **منوی همبرگری** — دکمه ☰ برای باز کردن پنل تنظیمات از سمت چپ
- **تب‌های فولدر** — همه چت‌ها، خصوصی، گروه‌ها (زبان فارسی)
- **هدر چت** — دکمه بازگشت به جای دکمه بستن (X)
- **نوار ایمنی** — رعایت `env(safe-area-inset-*)` برای آیفون
- **ارتفاع ۱۰۰dvh** — جلوگیری از پرش آدرس‌بار سافاری
- **targets لمسی ۴۴px** — تمام دکمه‌ها و ورودی‌ها حداقل ۴۴ پیکسل

---

## 📁 ساختار پروژه

```
FelFelChat/
├── src/                      # بک‌اند Rust
│   ├── main.rs
│   ├── http/                 # REST API
│   ├── realtime/             # Socket.IO
│   ├── db/                   # MongoDB
│   └── auth/
├── app/                      # صفحات Next.js
├── components/               # کامپوننت‌های React
├── lib/                      # ابزارهای کلاینت (رمزنگاری، i18n، سوکت)
├── assets/                   # لوگو و برندینگ
├── fonts/
├── docs/
│   └── OPERATIONS.md
├── Cargo.toml
├── install.sh
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## ⚙️ پیش‌نیازها

- **Node.js** نسخه ۲۰ به بالا
- **Rust** نسخه ۱.۹۴ به بالا (`rustc` / `cargo`)
- **MongoDB** نسخه ۸ به بالا
- **npm**

---

## 🚀 راه‌اندازی سریع (لینوکس)

### روش ۱: نصب با npm

```bash
npm install -g @zethrise/felfelchat
felfel
```

### روش ۲: نصب با curl

```bash
curl -sL https://git.diastom.xyz/ZethRise/FelFelChat/-/raw/master/install.sh | bash
```

بعد از نصب، با دستور `felfel` اپ را مدیریت کنید. برای بروزرسانی خودکار، `felfel` را اجرا کنید — در صورت وجود نسخه جدید، گزینه بروزرسانی نمایش داده می‌شود.

### روش ۳: نصب با Docker

```bash
git clone https://github.com/ZethRise/FelFelChat.git
cd FelFelChat
docker compose up -d --build
```

اپ روی `http://127.0.0.1:3000` بالا می‌آید. MongoDB replica set داخل Compose راه‌اندازی می‌شود.

اگر `SUPERADMIN_PASSWORD` را ست نکنید، رمز سوپرادمین در لاگ کانتینر چاپ می‌شود:

```bash
docker compose logs app | grep SUPERADMIN_PASSWORD
```

برای پروداکشن، `JWT_SECRET` و `BACKUP_SIGNING_KEY` را در `.env` کنار `docker-compose.yml` بگذارید.

---

## 🛠️ راه‌اندازی دستی

### ۱. کلون پروژه

```bash
git clone https://git.diastom.xyz/ZethRise/FelFelChat.git
cd FelFelChat
```

### ۲. نصب وابستگی‌ها

```bash
npm install
```

### ۳. تنظیم متغیرهای محیطی

```bash
cp .env.example .env
```

فایل `.env` را ویرایش کنید:

```env
NODE_ENV=development
PORT=3000
APP_ORIGIN=http://localhost:3000

JWT_SECRET=<یک رشته تصادفی بلند>
DATABASE_URL=mongodb://127.0.0.1:27017/felfelchat?replicaSet=rs0&directConnection=true

UPLOAD_DIR=./uploads
UPLOAD_MAX_SIZE_MB=20

BACKUP_DIR=./backups
BACKUP_SIGNING_KEY=<یک رشته تصادفی بلند>

AUDIT_LOG_DIR=./logs

# اختیاری
SENTRY_DSN=
NEXT_PUBLIC_WEBRTC_TURN_URLS=
NEXT_PUBLIC_WEBRTC_TURN_USERNAME=
NEXT_PUBLIC_WEBRTC_TURN_CREDENTIAL=
```

### ۴. راه‌اندازی MongoDB با Replica Set

```bash
# در مسیر /etc/mongod.conf اضافه کنید:
replication:
  replSetName: "rs0"

# سرویس را ری‌استارت کنید
sudo systemctl restart mongod

# Replica Set را راه‌اندازی کنید
mongosh --eval "rs.initiate()"
```

### ۵. ساخت سوپرادمین (اختیاری)

```bash
npm run db:seed
```

### ۶. اجرای برنامه

```bash
# محیط توسعه
npm run dev

# محیط پروداکشن
npm run build
npm start
```

اپ در آدرس `http://localhost:3000` در دسترس است.

---

## 📜 دستورات مفید

| دستور | کاربرد |
| -------------------- | ------------------------------ |
| `npm run dev` | اجرا در محیط توسعه |
| `npm run build` | ساخت نسخه پروداکشن |
| `npm start` | اجرا در محیط پروداکشن |
| `npm run lint` | بررسی کیفیت کد |
| `npm run db:seed` | ساخت سوپرادمین در صورت نبود |

---

## 🔐 متغیرهای محیطی

| متغیر | اجباری | توضیح |
| ------------------------------ | ------ | ---------------------------- |
| `JWT_SECRET` | ✅ | کلید رمزنگاری توکن‌ها |
| `DATABASE_URL` | ✅ | آدرس اتصال MongoDB |
| `APP_ORIGIN` | ✅ | آدرس عمومی اپ |
| `BACKUP_SIGNING_KEY` | ✅ | کلید امضای فایل‌های پشتیبان |
| `PORT` | ❌ | پورت سرور (پیش‌فرض: ۳۰۰۰) |
| `UPLOAD_DIR` | ❌ | مسیر ذخیره فایل‌های آپلودشده |
| `UPLOAD_MAX_SIZE_MB` | ❌ | حداکثر سایز فایل (MB) |
| `SENTRY_DSN` | ❌ | DSN مانیتورینگ Sentry |
| `NEXT_PUBLIC_WEBRTC_TURN_URLS` | ❌ | آدرس‌های TURN Server |

---

## 🏥 بررسی سلامت سرور

| Endpoint | توضیح |
| ----------------- | --------------- |
| `GET /api/health` | وضعیت کلی سرور |
| `GET /api/ready` | آمادگی سرویس‌ها |

---

## 👑 سوپرادمین

### سوپرادمین چیست؟

سوپرادمین تنها کاربری است که به **پنل مدیریت** (`/admin`) دسترسی دارد. این حساب در اولین نصب توسط اسکریپت ایجاد می‌شود.

### دسترسی به پنل مدیریت

۱. به آدرس `http://your-server/admin` بروید
۲. با اطلاعات سوپرادمین وارد شوید
۳. (در صورت بسته بودن ثبت‌نام، از بخش Login استفاده کنید)

قابلیت‌های پنل مدیریت:

| بخش | توضیح |
| ----------- | ---------------------------------- |
| Users | مدیریت کاربران، بستن حساب، بن کردن |
| Rooms | مدیریت اتاق‌های گفتگو |
| Messages | مشاهده پیام‌های همه اتاق‌ها |
| Calls | تاریخچه و وضعیت تماس‌های صوتی |
| Storage | مدیریت فضای ذخیره‌سازی |
| Backup | ساخت و بازیابی پشتیبان |
| Settings | روشن/خاموش کردن ثبت‌نام |
| Sticker/GIF | آپلود و مدیریت استیکر و GIF |

### تغییر مشخصات سوپرادمین (از طریق وب)

در پنل مدیریت، در پایین صفحه داشبورد، بخش **🔐 Superadmin Profile** وجود دارد:

- نام کاربری جدید (اختیاری)
- نام نمایشی جدید
- رمز عبور جدید (اختیاری)
- رمز عبور فعلی (الزامی برای تأیید)

### تغییر مشخصات سوپرادمین (از طریق سرور)

اگر به پنل وب دسترسی ندارید یا رمز عبور را فراموش کرده‌اید، از دستور زیر در سرور استفاده کنید:

```bash
# روش ۱: از طریق TUI (توصیه شده)
felfel          # منو اصلی
# گزینه 16 را انتخاب کنید: Change superadmin password/username

# روش ۲: مستقیم
felfel superadmin
```

این دستور موارد زیر را می‌پرسد:

- نام کاربری جدید (اختیاری — خالی بگذارید تا تغییر نکند)
- نام نمایشی جدید (اختیاری)
- رمز عبور جدید (اختیاری — خالی بگذارید تا تغییر نکند)
- تأیید رمز عبور جدید

> **توجه:** این دستور مستقیماً در MongoDB تغییر می‌دهد و نیازی به اجرای اپلیکیشن ندارد.

---

## 📄 لایسنس

این پروژه تحت لایسنس MIT منتشر شده است.

</div>

---

<div dir="ltr">

# 💬 FelFelChat

**FelFelChat** is a modern, secure, self-hosted real-time messaging application built with Next.js, Rust, and MongoDB. It features real-time chat, WebRTC voice calls, end-to-end encryption, multilingual support (Farsi/English), and a powerful admin panel.

🔗 **Repository:** https://git.diastom.xyz/ZethRise/FelFelChat

---

## ✨ Features

- **Real-time Messaging** — Group and private chat powered by Socket.IO
- **Voice Calls** — One-on-one calls via WebRTC with TURN/STUN fallback
- **Message Encryption** — Sensitive messages encrypted with `hushCrypto`
- **File Uploads** — Send images, videos, PDFs, and more (with auto-compression)
- **Stickers & GIFs** — Custom sticker and GIF support
- **Secure Auth** — JWT cookies + bcrypt password hashing
- **Admin Panel** — Manage users, rooms, calls, backups, and storage
- **Multilingual** — Full Farsi and English support with RTL/LTR layouts
- **Mobile-First UI** — Telegram-style interface with folder tabs, hamburger menu, and 100dvh
- **Audit Logging** — All critical events are logged
- **Signed Backups** — Cryptographically signed backup/restore
- **Rate Limiting** — API abuse protection
- **Monitoring** — Sentry integration

---

## 🏗️ Tech Stack

| Layer | Technology |
| ----------- | ---------------------------------- |
| Framework | Next.js 16 (App Router) |
| Backend | Rust (Axum + Socket.IO) |
| Database | MongoDB |
| Auth | JWT + bcrypt |
| Styling | Tailwind CSS 4 + Vanilla CSS |
| Fonts | Vazirmatn (Persian) + Sora (Latin) |
| Voice Calls | WebRTC + Google STUN + Open Relay TURN |
| Monitoring | Sentry |
| Language | TypeScript |

---

## 📱 Mobile Design

The mobile UI is modeled after Telegram:

- **Full-screen chat list** — no bottom drawer; chat list is the mobile home screen
- **Hamburger menu** — ☰ button opens settings/admin/logout from the left
- **Folder tabs** — All Chats, Personal, Groups (Farsi and English)
- **Chat header** — back arrow instead of close (X) button
- **Safe areas** — respects `env(safe-area-inset-*)` for iPhone notch/home indicator
- **100dvh height** — prevents Safari address bar jump
- **44px touch targets** — all buttons and inputs are minimum 44px

---

## 📁 Project Structure

```
FelFelChat/
├── src/                      # Rust backend
│   ├── main.rs
│   ├── http/                 # REST API
│   ├── realtime/             # Socket.IO
│   ├── db/                   # MongoDB
│   └── auth/
├── app/                      # Next.js pages
├── components/               # React components
├── lib/                      # Client helpers (crypto, i18n, socket)
├── assets/                   # Logo and branding
├── fonts/
├── docs/
│   └── OPERATIONS.md
├── Cargo.toml
├── install.sh
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## ⚙️ Prerequisites

- **Node.js** v20 or later
- **Rust** 1.94 or later (`rustc` / `cargo`)
- **MongoDB** v8 or later
- **npm**

---

## 🚀 Quick Install (Linux)

### Method 1: Install via npm

```bash
npm install -g @zethrise/felfelchat
felfel
```

### Method 2: Install via curl

```bash
curl -sL https://git.diastom.xyz/ZethRise/FelFelChat/-/raw/master/install.sh | bash
```

After installation, use the `felfel` command to manage your server. Run `felfel` to check for updates — if a new version is available, you'll be prompted to update automatically.

### Method 3: Install with Docker

```bash
git clone https://github.com/ZethRise/FelFelChat.git
cd FelFelChat
docker compose up -d --build
```

The app is available at `http://127.0.0.1:3000`. Compose starts a MongoDB replica set automatically.

If you do not set `SUPERADMIN_PASSWORD`, the generated password is printed in the app container logs:

```bash
docker compose logs app | grep SUPERADMIN_PASSWORD
```

For production, put `JWT_SECRET` and `BACKUP_SIGNING_KEY` in a `.env` file next to `docker-compose.yml`.

---

## 🛠️ Manual Setup

### 1. Clone the repository

```bash
git clone https://git.diastom.xyz/ZethRise/FelFelChat.git
cd FelFelChat
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
NODE_ENV=development
PORT=3000
APP_ORIGIN=http://localhost:3000

JWT_SECRET=<long-random-secret>
DATABASE_URL=mongodb://127.0.0.1:27017/felfelchat?replicaSet=rs0&directConnection=true

UPLOAD_DIR=./uploads
UPLOAD_MAX_SIZE_MB=20

BACKUP_DIR=./backups
BACKUP_SIGNING_KEY=<long-random-signing-key>

AUDIT_LOG_DIR=./logs

# Optional
SENTRY_DSN=
NEXT_PUBLIC_WEBRTC_TURN_URLS=
NEXT_PUBLIC_WEBRTC_TURN_USERNAME=
NEXT_PUBLIC_WEBRTC_TURN_CREDENTIAL=
```

### 4. Set up MongoDB with Replica Set

A MongoDB replica set is optional. If you still use one, add this to `/etc/mongod.conf`:

```yaml
replication:
  replSetName: 'rs0'
```

Then restart and initialize:

```bash
sudo systemctl restart mongod
mongosh --eval "rs.initiate()"
```

### 5. Seed superadmin (optional)

```bash
npm run db:seed
```

### 6. Start the app

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

The app is available at `http://localhost:3000`.

---

## 📜 Scripts

| Command | Description |
| -------------------- | ------------------------- |
| `npm run dev` | Start in development mode |
| `npm run build` | Build for production |
| `npm start` | Start in production mode |
| `npm run lint` | Lint the codebase |
| `npm run db:seed` | Create superadmin if missing |

---

## 🔐 Environment Variables

| Variable | Required | Description |
| ------------------------------------ | -------- | -------------------------------- |
| `JWT_SECRET` | ✅ | Secret key for signing JWTs |
| `DATABASE_URL` | ✅ | MongoDB connection string |
| `APP_ORIGIN` | ✅ | Public app URL (for CORS) |
| `BACKUP_SIGNING_KEY` | ✅ | Key for signing backup files |
| `PORT` | ❌ | Server port (default: 3000) |
| `UPLOAD_DIR` | ❌ | Directory for uploaded files |
| `UPLOAD_MAX_SIZE_MB` | ❌ | Max upload size in MB |
| `SENTRY_DSN` | ❌ | Sentry monitoring DSN |
| `NEXT_PUBLIC_WEBRTC_TURN_URLS` | ❌ | TURN server URLs for voice calls |
| `NEXT_PUBLIC_WEBRTC_TURN_USERNAME` | ❌ | TURN server username |
| `NEXT_PUBLIC_WEBRTC_TURN_CREDENTIAL` | ❌ | TURN server credential |

---

## 🏥 Health Checks

| Endpoint | Description |
| ----------------- | ------------------------------------------------------------------- |
| `GET /api/health` | Overall server status |
| `GET /api/ready` | Service readiness check (returns 503 if dependencies are unhealthy) |

---

## 🛡️ Security

- All routes are protected by JWT authentication middleware
- Passwords hashed with **bcrypt**
- Uploaded files are served from a sandboxed directory with path-traversal protection
- Content Security Policy, X-Frame-Options, and other security headers applied on every response
- `JWT_SECRET` and `BACKUP_SIGNING_KEY` should be rotated regularly (see `docs/OPERATIONS.md`)

---

## 👑 Superadmin

### What is the Superadmin?

The superadmin is the only account with access to the **Admin Panel** (`/admin`). It is created automatically during installation by `install.sh`.

### Accessing the Admin Panel

1. Navigate to `http://your-server/admin`
2. Log in with your superadmin credentials
3. The panel is **only visible** to the superadmin account

| Section | Description |
| ----------- | ----------------------------------------- |
| Users | Manage users, ban accounts |
| Rooms | View and manage chat rooms |
| Messages | Browse all room messages |
| Calls | Voice call history and active call status |
| Storage | Manage uploaded files |
| Backup | Create & restore database backups |
| Settings | Toggle user registration on/off |
| Sticker/GIF | Upload and manage custom stickers & GIFs |

### Changing Superadmin Credentials (Web UI)

At the bottom of the Admin Dashboard there is a **🔐 Superadmin Profile** card where you can change:

- **Username** (optional)
- **Display name**
- **Password** (optional, min 8 characters)
- **Current password** is always required to confirm changes

### Changing Superadmin Credentials (Server CLI)

If you cannot access the web panel or have forgotten the password, use the `felfel` command directly on the server:

```bash
# Recommended: interactive TUI menu
felfel
# Select option 16: Change superadmin password/username

# Direct command
felfel superadmin
```

You will be prompted for:

- New username (optional — leave blank to keep current)
- New display name (optional)
- New password (optional — leave blank to keep current)
- Password confirmation

> **Note:** This command updates MongoDB directly. The app does not need to be running.

---

## 📄 License

This project is licensed under the MIT License.

</div>
