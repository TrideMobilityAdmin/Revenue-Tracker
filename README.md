# TRiDE Revenue Command — FY2027 (MERN)

A MERN-stack rebuild of the standalone HTML revenue tracker: MongoDB + Express API,
React (Vite) frontend, restricted-access login, ready to run in VS Code and deploy to AWS.

```
tride-revenue-tracker/
├── backend/          Express + MongoDB API (JWT auth, entries, management remarks)
├── frontend/          React (Vite) dashboard
└── docker-compose.yml Local dev: mongo + backend + frontend in one command
```

## 1. Restricted access / login

The whole app sits behind a single **standard shared password**, as requested:

```
13/08/2020
```

- Set in `backend/.env` as `AUTH_PASSWORD=13/08/2020` (format kept exactly as given, `DD/MM/YYYY`).
- `POST /api/auth/login` checks the password and issues a JWT (default 12h expiry).
- Every other `/api/*` route requires `Authorization: Bearer <token>` — enforced by
  `backend/middleware/auth.js`.
- The React app stores the token in `localStorage` and redirects to `/login` if a
  request ever comes back `401` (expired/invalid token).
- Login attempts are rate-limited (20 per 15 minutes per IP) since it's one shared
  password rather than per-user credentials — see `backend/routes/auth.js`.

**Before going live:** change `AUTH_PASSWORD` and `JWT_SECRET` via environment
variables (not by editing code) if you want a different password later, and
always serve over HTTPS so the password isn't sent in the clear.

## 2. Running it locally in VS Code

### Option A — Docker Compose (fastest)

```bash
cd tride-revenue-tracker
cp backend/.env.example backend/.env      # edit if needed
docker compose up --build
```

- Frontend: https://revenue-tracker.tride.live
- Backend health check: https://revenue-tracker-api.tride.live/api/health
- Mongo runs in its own container with a persistent volume.

### Option B — Run natively (better for active development)

```bash
# Terminal 1 - MongoDB (skip if you already have one running, e.g. Atlas)
docker run -d -p 27017:27017 --name tride-mongo mongo:7

# Terminal 2 - backend
cd backend
cp .env.example .env
npm install
npm run dev          # nodemon, restarts on save

# Terminal 3 - frontend
cd frontend
cp .env.example .env
npm install
npm run dev           # Vite dev server on http://localhost:5173
```

Open the two folders as a VS Code multi-root workspace (or just open the repo
root — both `backend` and `frontend` have their own `package.json`). Recommended
extensions: ESLint, Prettier, MongoDB for VS Code, Docker.

## 3. Environment variables

**backend/.env**
| Variable | Purpose |
|---|---|
| `PORT` | API port (default 5000) |
| `MONGO_URI` | MongoDB connection string (local, Atlas, or DocumentDB) |
| `AUTH_PASSWORD` | The shared standard password gate (`13/08/2020`) |
| `JWT_SECRET` | Signing secret for login tokens — **change before deploying** |
| `JWT_EXPIRES_IN` | Token lifetime (default `12h`) |
| `CORS_ORIGIN` | Comma-separated list of allowed frontend origins |

**frontend/.env**
| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Base URL the React app calls, e.g. `https://api.yourdomain.com/api` |

## 4. Deploying to AWS

Three reasonable paths, from simplest to most "properly production":

### Path 1 — Single EC2 instance + Docker Compose (simplest)

1. Launch an EC2 instance (Ubuntu 22.04, t3.small+), open ports 80/443 in the security group.
2. Install Docker + Docker Compose plugin.
3. `git clone` this repo onto the instance, fill in `backend/.env` with production
   values (strong `JWT_SECRET`, your domain in `CORS_ORIGIN`).
4. `docker compose up -d --build`.
5. Put an Nginx/Certbot reverse proxy (or an AWS Application Load Balancer) in
   front for HTTPS, pointing at port 8080 (frontend) and forwarding `/api` to
   port 5000, or rely on the bundled `frontend/nginx.conf` proxy if both
   containers run on the same host.
6. Point your domain's DNS (Route 53) at the instance's Elastic IP.

### Path 2 — ECS Fargate + MongoDB Atlas (recommended "real" setup)

1. Create a **MongoDB Atlas** cluster (free tier is fine to start) instead of
   self-hosting Mongo — far less to manage, and it's already AWS-network-friendly
   if you pick an AWS-hosted Atlas region.
2. Push `backend` and `frontend` images to **ECR**:
   ```bash
   aws ecr create-repository --repository-name tride-backend
   aws ecr create-repository --repository-name tride-frontend
   docker build -t tride-backend ./backend
   docker build -t tride-frontend ./frontend --build-arg VITE_API_URL=https://revenue-tracker-api.tride.live/api
   # tag + docker push to the ECR URIs from the create-repository output
   ```
3. Create an **ECS Fargate** cluster with two services (backend, frontend),
   each pulling its ECR image. Store `MONGO_URI`, `AUTH_PASSWORD`, `JWT_SECRET`
   in **AWS Secrets Manager** or **SSM Parameter Store** and inject them as
   task-definition secrets (don't bake them into the image).
4. Put an **Application Load Balancer** in front with two target groups
   (`/api/*` → backend service, `/*` → frontend service) and an ACM certificate
   for HTTPS.
5. Route 53 → ALB.

### Path 3 — Frontend on S3 + CloudFront, backend on Elastic Beanstalk

1. `npm run build` the frontend (with `VITE_API_URL` set to your API domain),
   upload `frontend/dist` to an S3 bucket, serve via CloudFront (with an OAC)
   for a fast, cheap static front end.
2. `eb init` / `eb create` the `backend` folder as a Node.js Elastic Beanstalk
   environment; set the same environment variables through the EB console.
3. Use MongoDB Atlas for the database, same as Path 2.

Whichever path you pick:

- Always terminate TLS (HTTPS) in front of the login endpoint — the shared
  password should never travel over plain HTTP.
- Rotate `JWT_SECRET` and `AUTH_PASSWORD` via environment variables/secrets,
  never commit real values to git (`.env` is already git-ignored).
- The `/api/health` endpoint is there for your load balancer / target group
  health checks.

## 5. What carried over from the standalone HTML version

- FY2027 (Apr 2026–Mar 2027) specific metrics, ₹ Crore formatting throughout
- Dark, colorful dashboard theme with per-card accent colors
- Short/Mid/Long/Unscheduled term buckets, auto-calculated from expected date
- Click-to-filter metric cards driving the Project-wise Summary table
- Per-entry Remarks (rolled up per project, read-only) and a separate,
  editable **Mang. Remarks** field per project that overwrites on Save
- 12-month bar chart, term-bucket doughnut, committed-vs-potential bar chart

The one structural change: data now lives in MongoDB behind the API instead of
browser `localStorage`, so it's shared across every device/user who logs in
with the standard password, rather than being tied to one browser/file.
