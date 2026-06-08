# Gigtab Local Setup Guide & Tracker

This document tracks the steps and environment requirements needed to get **Gigtab** running locally on Windows.

---

## 📋 Setup Checklist

| Phase       | Task                                                  | Status | Notes                                                  |
| :---------- | :---------------------------------------------------- | :----: | :----------------------------------------------------- |
| **Phase 1** | Verify/Install System Prerequisites (Deno, Node, Git) | `[x]`  | Deno installed at `C:\Users\brian\.deno\bin\deno.exe`. |
| **Phase 2** | Install Backend and Frontend Dependencies             | `[x]`  | Completed via `deno task setup`.                       |
| **Phase 3** | Build Frontend Assets                                 | `[x]`  | Frontend compiled successfully with Vite.              |
| **Phase 4** | Configure Environment (`.env`)                        | `[ ]`  | Optional custom host/port/mode.                        |
| **Phase 5** | Start the Application (Dev/Prod Mode)                 | `[/]`  | Server running on http://localhost:47777.              |

---

## 🛠️ Prerequisites & Environment Verification

### 1. Deno (Required for Backend & Tasks)

- **Status:** Installed at `C:\Users\brian\.deno\bin\deno.exe`.
- **Requirements:** Deno `v2.4.4` or above.
- **Installation (PowerShell - Windows):**
  ```powershell
  irm https://deno.land/install.ps1 | iex
  ```
  _(Note: You will need to restart your terminal or reload environment variables after running this command.)_

### 2. Node.js & npm (Required for Frontend Package Tooling)

- **Status:** Node `v24.11.1` / npm `11.11.0`
- **Requirements:** Node.js LTS or higher.

### 3. Git (Required for Cloning & Versioning)

- **Status:** Git `v2.51.0`
- **Requirements:** Standard Git CLI.

---

## 🚀 Step-by-Step Setup Instructions

### Step 1: Install Deno

Open PowerShell (as Administrator if required) and run:

```powershell
irm https://deno.land/install.ps1 | iex
```

Verify the installation by running:

```powershell
deno --version
```

### Step 2: Initialize dependencies and Build Frontend

Run the project's built-in setup task, which installs frontend packages and runs Vite build:

```powershell
deno task setup
```

This task executes:

1. `deno task install-frontend-deps` (`cd frontend && deno install`)
2. `deno task build-frontend` (`cd frontend && deno run build`)

> [!NOTE]
> Under the hood, Deno installs both npm-style packages in the frontend directory and cached modules for the backend automatically.

### Step 3: Configure Environment (Optional)

If you need to change ports or configure hosts, copy the environment variable block below into a `.env` file in the root of the project:

```ini
# Server Host (Default: bind to all interfaces)
GIGTAB_HOST=localhost

# Server Port (Default: 47777)
GIGTAB_PORT=47777

# Set to true to bypass login and start with a preconfigured admin/demo dataset
# GIGTAB_DEMO_MODE=true

# Launch browser on start (Default: true)
GIGTAB_LAUNCH_BROWSER=true
```

### Step 4: Run the Application

#### Option A: Run in Development Mode (Hot Reload)

To run frontend and backend simultaneously in watch mode:

```powershell
deno task dev
```

- Development server url: `http://localhost:5173` (Frontend dev server, proxies API calls to backend)

#### Option B: Run in Production Mode (Standard Server)

To serve the pre-built frontend from the backend:

```powershell
deno task start
```

- Production server url: `http://localhost:47777`

---

## 🔍 Directory Structure Reference

- [backend/](file:///c:/dev/gigtab/backend) - Hono-based TypeScript backend running on Deno. Uses SQLite for storage (`config.db` created in `./data` on first boot) and Deno KV for temporary tokens.
- [frontend/](file:///c:/dev/gigtab/frontend) - Vue 3 application built with Vite, TypeScript, Bootstrap, and AlphaTab for sheet music rendering.
- [extra/](file:///c:/dev/gigtab/extra) - Contains template configuration databases (`config-template.db`), empty sheet templates, and binary build scripts.
- [deno.jsonc](file:///c:/dev/gigtab/deno.jsonc) - Main Deno configuration, task scripts, and backend import maps.
