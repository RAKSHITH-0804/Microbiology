# J.J.M. Medical College - Microbiology Department ERP

A monorepo with three parts:

| Folder      | Stack                                                                 |
| ----------- | --------------------------------------------------------------------- |
| `backend/`  | Node.js, Express, TypeScript, `pg`, Zod, JWT (httpOnly cookie), bcrypt |
| `frontend/` | Vite, React 18, TypeScript, Tailwind CSS, Lucide React, Axios          |
| `database/` | SQL migrations, migration runner, seed script and seed data            |

## Prerequisites

- Node.js 20 LTS or newer (`winget install OpenJS.NodeJS.LTS`, then open a new terminal)
- PostgreSQL 14+ running locally (user `postgres`, password from `.env`)

## Setup (PowerShell)

```powershell
cd e:\Indigo\Microbiology

# 1. Install all workspace dependencies
npm install

# 2. Create the database (once)
& "C:\Program Files\PostgreSQL\17\bin\createdb.exe" -U postgres microbiology_db

# 3. Create the schema and load master data + default HOD user
npm run db:migrate
npm run db:seed

# 4. Start backend (http://localhost:5000) and frontend (http://localhost:5173)
npm run dev
```

Run the apps individually with `npm run dev:backend` or `npm run dev:frontend`.

Default login: **hod / admin123** (change this after first login).

## Environment

The root `.env` is used by the database scripts; `backend/.env` is used by the API.
See `.env.example` for the variables.

## Useful scripts

| Command              | Description                                    |
| -------------------- | ---------------------------------------------- |
| `npm run dev`        | Backend + frontend in watch mode               |
| `npm run build`      | Production build of backend and frontend       |
| `npm run typecheck`  | TypeScript checks for both apps                |
| `npm run db:migrate` | Apply pending SQL files in `database/migrations` |
| `npm run db:seed`    | Idempotently seed master data and the HOD user |

## API (initial)

| Method | Path               | Auth | Description                       |
| ------ | ------------------ | ---- | --------------------------------- |
| GET    | `/api/health`      | No   | API and database health           |
| POST   | `/api/auth/login`  | No   | Login, sets httpOnly `token` cookie |
| POST   | `/api/auth/logout` | No   | Clears the auth cookie            |
| GET    | `/api/auth/me`     | Yes  | Current user profile              |
