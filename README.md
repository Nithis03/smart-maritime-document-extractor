# Smart Maritime Document Extractor

A structural-document extraction API service built with NestJS, utilizing PostgreSQL for job retention. It uses external LLMs under the hood.

## Requirements

- Node.js (v18+)
- Docker & Docker Compose (for PostgreSQL)

## Setup

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Start the PostgreSQL instance via Docker:
   ```bash
   docker-compose up -d
   ```
3. Install dependencies:
   ```bash
   pnpm install
   ```
4. Start the server (development):
   ```bash
   pnpm run start:dev
   ```

The application runs on [`http://localhost:3000`](http://localhost:3000).

## Endpoints (Phase 1)

- `GET /api/health` - Health check.
- `POST /api/extract` - Uploads a document using `multipart/form-data` and processes it. Accepts a `file` field, and an optional `sessionId` field. Returns a structured JSON output of the document payload.
