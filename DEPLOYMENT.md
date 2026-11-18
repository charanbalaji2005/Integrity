# Deploying IntegrityOS to Render (Two Separate Cloud Instances)

IntegrityOS is architected for dual-instance cloud deployment:
1. **Backend Web Service (`integrityos-backend`):** Node.js + Express API, WebSocket (Socket.IO), Prisma ORM connected to Neon Cloud PostgreSQL, and Groq LLM integration.
2. **Frontend Static Site (`integrityos-frontend`):** React + Vite Single Page Application (SPA) served globally via Render's CDN.

---

## 🚀 Option A: Automatic 1-Click Deployment (Render Blueprint)

The repository includes a ready-to-use [`render.yaml`](./render.yaml).

1. Push your repository to **GitHub** or **GitLab**.
2. Log in to [dashboard.render.com](https://dashboard.render.com/).
3. Click **New +** (top right) → **Blueprint**.
4. Connect your GitHub/GitLab repository.
5. Render will detect `render.yaml` and configure both instances:
   - `integrityos-backend` (Web Service)
   - `integrityos-frontend` (Static Site)
6. Click **Apply**. Render will deploy both instances and link their URLs automatically!

---

## 🛠️ Option B: Manual Setup via Render Dashboard

If you prefer to configure each instance manually in the Render dashboard, follow these steps:

### 1️⃣ Instance 1: Backend Web Service

1. Go to [Render Dashboard](https://dashboard.render.com/) → **New +** → **Web Service**.
2. Connect your Git repository.
3. Configure the following settings:
   - **Name:** `integrityos-backend` (or your choice)
   - **Language / Runtime:** `Node`
   - **Root Directory:** `backend`
   - **Branch:** `main`
   - **Region:** Choose closest to your database (e.g. `Oregon (US West)` or `Ohio (US East)`)
   - **Build Command:**
     ```bash
     npm install --include=dev && npx prisma generate && (npx prisma db push --accept-data-loss || true) && npm run build
     ```
   - **Start Command:**
     ```bash
     npm run start
     ```
   - **Plan:** `Free` or `Starter`
   - **Health Check Path:** `/api/health`

4. Add **Environment Variables** under the **Environment** tab:

   | Key | Value | Description |
   |---|---|---|
   | `NODE_ENV` | `production` | Production mode |
   | `PORT` | `10000` | Render default port |
   | `DATABASE_URL` | `postgresql://...` | PostgreSQL connection string (Neon, Supabase, or Render Postgres) |
   | `ADMIN_EMAIL` | `charanbalajineelampalli752005@gmail.com` | Default platform administrator email |
   | `ADMIN_PASSWORD` | `752006` | Default administrator password |
   | `GROQ_API_KEY` | `gsk_... (your Groq API Key)` | Groq API Key |
   | `GROQ_CHAT_MODEL` | `openai/gpt-oss-120b` | Groq Active Model |
   | `LLM_PROVIDER` | `groq` | Provider selector |
   | `BETTER_AUTH_SECRET` | *(Generate a 32+ character random string)* | Auth secret token |
   | `BETTER_AUTH_URL` | `https://<your-backend>.onrender.com` | Your backend Render URL |
   | `FRONTEND_URL` | `https://<your-frontend>.onrender.com` | Your frontend Render URL |
   | `SMTP_USER` | `neelampallicharanbalaji14@gmail.com` | SMTP Username |
   | `SMTP_PASS` | `hwipnbegmfaoxfju` | SMTP App Password |

5. Click **Create Web Service**. Once deployed, copy your backend URL (e.g. `https://integrityos-backend.onrender.com`).

---

### 2️⃣ Instance 2: Frontend Static Site

1. In Render Dashboard, click **New +** → **Static Site**.
2. Connect the same repository.
3. Configure the following settings:
   - **Name:** `integrityos-frontend`
   - **Root Directory:** *(leave blank for root directory)*
   - **Branch:** `main`
   - **Build Command:**
     ```bash
     npm install --include=dev && npm run build
     ```
   - **Publish Directory:** `dist`

4. Set up **SPA Rewrite Rules** (under **Redirects/Rewrites**):
   - **Type:** `Rewrite`
   - **Source:** `/*`
   - **Destination:** `/index.html`

5. Add **Environment Variables** under the **Environment** tab:

   | Key | Value | Description |
   |---|---|---|
   | `VITE_API_URL` | `https://integrityos-backend.onrender.com` | Your deployed backend Render URL |
   | `VITE_GROQ_API_KEY` | `gsk_... (your Groq API Key)` | Groq API Key |
   | `VITE_GROQ_MODEL` | `openai/gpt-oss-120b` | Active Groq Model |

6. Click **Create Static Site**.

---

## 🗄️ Initializing the Neon Database Schema

To push the database schema to your Neon cloud instance from your local terminal:

```bash
cd backend
npx prisma db push
```

To seed initial sample assessments and administrative accounts:

```bash
npx tsx src/database/seed.ts
```

---

## 🔍 Verification & Health Check

1. **Backend Verification:**
   Visit `https://<your-backend-app>.onrender.com/api/health` in your browser. You should receive:
   ```json
   {
     "success": true,
     "status": "healthy",
     "services": { "database": "healthy" }
   }
   ```
2. **Frontend Verification:**
   Visit `https://<your-frontend-app>.onrender.com/`. The web app will load, connecting to the backend instance and the Groq LLM live proctoring service.
