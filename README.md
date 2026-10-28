# FitPath v1 — lightweight Android and Docker fitness app

FitPath is a small working MVP. It uses **JavaScript (Node.js + vanilla HTML/CSS/JS)**, SQLite (built into Node 22), and optionally an **Android WebView APK**. No external npm packages, PostgreSQL, Redis, or account subscriptions are needed. Designed for **Ubuntu 24.04 on an OCI free VM with 1 OCPU, 1 GB RAM, 5 GB swap, and 100 GB storage**.

## Features

- Register / log in; password hashed with scrypt; 30-day randomized bearer sessions.
- Save full name, optional age (18+), fitness level, goal, and food preference.
- 12 exercises across beginner, intermediate and advanced with steps, equipment, suggested sets/reps, durations and safety advice.
- 3 food plans (balanced, vegetarian, protein-focused), 4 meal ideas per plan.
- Three rotating exercises each day, workout completion and history.
- Responsive installable **PWA** from Android Chrome, plus Java Android WebView wrapper source.
- Local persistent SQLite data in a Docker volume.

Not included yet: payments, video streaming, calorie prescriptions, AI coaching, clinician-approved personal diet plans, administrator panel, social functions, password recovery, or email verification. This is a starter app, **not for clinical use**. Not suitable as tailored guidance for minors.

## 1. Quick local test (any PC with Node >= 22.13)

```bash
cd FitPath-MVP
node server.mjs
```

Open `http://localhost:3000`. `node --test tests/*.test.mjs` runs an API smoke/integration test. A `data/fitpath.db` file is created on first launch; `data/` is gitignored.

## 2. Deploy to an OCI Ubuntu 24.04 VPS

SSH into the server (replace the address):

```bash
ssh ubuntu@YOUR_OCI_PUBLIC_IP
```

Install Docker Engine and Docker Compose plugin per the official Ubuntu instructions: https://docs.docker.com/engine/install/ubuntu/ . Ubuntu's distribution packages may also work: `sudo apt update && sudo apt install -y docker.io docker-compose-v2` (verify with `docker compose version`; otherwise use Docker's official repository). Add your user to the docker group **only if you accept that this gives root-equivalent permissions**, or keep using `sudo docker compose`.

Copy the unzipped `FitPath-MVP` folder from your PC:

```bash
# This command runs on your PC, NOT inside your SSH session.
scp -r FitPath-MVP ubuntu@YOUR_OCI_PUBLIC_IP:~/
```

Build/start on the VPS:

```bash
cd ~/FitPath-MVP
sudo docker compose up -d --build
sudo docker compose ps
curl http://127.0.0.1:3000/health
```

Expected response: `{"status":"ok","service":"fitpath","version":"1.0.0"}`. **Port 3000 is bound to 127.0.0.1**; it is intentionally not publicly exposed. Set up HTTPS below to access from Android. Initial Docker image pulls require internet. Persistent data is stored in `fitpath_data` Docker volume; container recreation preserves it.

Memory settings: the Compose service is capped at **256 MB**, Node's JS heap at **160 MB**. The database lives on the disk; 5 GB swap can help prevent OOM but is not a substitute for available physical RAM. Keep concurrent user numbers low on a 1 OCPU/1 GB server; test load before opening to the public.

## 3. Publish HTTPS using Caddy (recommended)

You need a DNS name you control such as `fitness.example.com`. Point its **A** record to the VPS public IPv4. In the OCI Security List or NSG, permit inbound TCP **80 and 443**; also permit them in Ubuntu's firewall if enabled. Do **not** open port 3000 externally. Make sure no other web server is listening on ports 80/443 (or integrate FitPath with your existing nginx instead).

```bash
cd ~/FitPath-MVP
cp .env.example .env
nano .env                     # change FITPATH_DOMAIN to your real domain
sudo docker compose -f compose.yaml -f compose.https.yaml up -d --build
sudo docker compose -f compose.yaml -f compose.https.yaml ps
```

Caddy provisions and renews a public TLS certificate automatically when DNS and ports work. Caddy container uses **host networking** on Linux because the Node container is exposed only on 127.0.0.1:3000. Test `https://YOUR_DOMAIN/health` from a browser. If OCI reports failure, check public DNS, port 80/443 rules and `sudo docker compose -f compose.yaml -f compose.https.yaml logs --tail=100 caddy`.

**Security:** Never create an account or transmit passwords over bare HTTP via a public IP. Use a valid HTTPS domain. Real users' profile/activity information requires your own privacy, security and backup policies.

## 4A. Install on Android without building an APK (PWA)

After deploying HTTPS, open `https://YOUR_DOMAIN` in **Chrome on Android**. In Chrome's menu choose **Install app** (or **Add to Home screen**, depending on Android/Chrome). FitPath then appears as an app icon and launches full-screen. The UI shell may be cached; signing in and saving workouts require a server connection. PWA installation is not the same thing as an APK.

## 4B. Build the installable Android APK (source provided)

The `android/` directory is a complete minimal Android Studio Gradle project, using Java for the WebView shell and your **JavaScript front end** for the app. The Android app asks for your **HTTPS server URL** on first launch, then loads your JS app. A small **gear icon** at the top right opens server settings. The Android project deliberately forbids cleartext HTTP connections.

**Using Android Studio on Windows:**

1. Install Android Studio and the Android SDK from https://developer.android.com/studio . Open `FitPath-MVP/android` as a project.
2. Allow Gradle to sync and install **Android SDK Platform 35** and **Build Tools** when prompted. Use JDK 17 if required by the configured Android Gradle Plugin 8.7.3.
3. Menu: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
4. The installable **debug APK** will be at `android/app/build/outputs/apk/debug/app-debug.apk`.
5. Copy it to your Android device and allow installation of apps from that source when prompted; launch FitPath and enter `https://YOUR_DOMAIN`.

**Optional automatic build on GitHub:** push this folder to your own GitHub repository, open **Actions → Build installable Android APK → Run workflow**, then download the `FitPath-debug-apk` workflow artifact. The GitHub workflow uses Google's Android build tools on a hosted runner; no Android SDK needs to run on your 1 GB OCI VPS. A debug APK is suitable for private testing, not for production Play Store distribution. A public release requires a properly secured signed release build and publication compliance.

**Important:** A precompiled APK is **not included** in this ZIP because an Android SDK/Gradle build environment is not available in the current generation environment. The source and repeatable build workflow are included. Avoid renaming the ZIP file to `.apk`: it will not become an installable Android application.

## 5. Database tables

| Table | Purpose |
|---|---|
| `users` | Name, login email, hashed password, age, fitness goal, level and food preference |
| `exercises` | Exercise instructions, sets, reps, safety and difficulty |
| `diet_plans` | Plan labels and descriptions |
| `meals` | Meal ideas belonging to each diet plan |
| `workout_logs` | Per-user, per-exercise daily completion |
| `sessions` | Hashed access tokens and expiration |

On first boot the 12 exercise records, 3 diet plans and 12 meals are inserted only if missing. Your registered users and activity are persisted in SQLite. SQLite is suitable for a small audience, not a high-concurrency service.

## 6. Routes

| Method | Route | Notes |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/api/catalog` | Exercises and diet plans |
| POST | `/api/register` | Name, email, password, profile choices |
| POST | `/api/login` | Returns bearer token |
| GET | `/api/me` | Current profile, authenticated |
| PATCH | `/api/me` | Update profile, authenticated |
| GET | `/api/logs` | Activity history, authenticated; optional `?date=YYYY-MM-DD` |
| POST | `/api/logs` | Mark one exercise done for a date |
| DELETE | `/api/logs/:exerciseId?date=YYYY-MM-DD` | Undo a daily completion |
| POST | `/api/logout` | Revoke current bearer token |

## 7. Backups, updates and operations

The SQLite files are in a Docker-managed named volume. To safely back up, first stop the app, then copy the database to a location **outside the Docker volume**, and restart:

```bash
cd ~/FitPath-MVP
sudo docker compose stop fitpath
mkdir -p "$HOME/fitpath-backups"
# Find the actual Docker volume name from: sudo docker volume ls
sudo docker volume ls
# Example: replace FITPATH_VOLUME with the full volume name from the list
sudo docker run --rm -v FITPATH_VOLUME:/from:ro -v "$HOME/fitpath-backups":/to busybox sh -c 'cp /from/fitpath.db /to/fitpath-$(date +%Y%m%d-%H%M%S).db'
sudo docker compose start fitpath
```

Keep backups encrypted and protected; they contain profile information, password hashes and workout logs. Test a restore periodically. Back up before editing schema. To update after copying new source files, run `sudo docker compose -f compose.yaml -f compose.https.yaml up -d --build`. When using HTTPS, include the second Compose file on future operations.

Potential future versions: admin UI to add exercises/diet plans, exercise media, reminders, account recovery and data export/delete, user goal-driven training schedules, clinician-reviewed nutrition plans, analytics, multi-user scaling, and rate limiting at the reverse proxy.
