# Smart Maritime Document Extractor

A robust, asynchronous document extraction and cross-validation AI pipeline built with NestJS, BullMQ (Redis), and PostgreSQL. 

Designed specifically for handling complex Maritime documents (PEME, COC, Passports) with high accuracy, graceful LLM deterioration handling, and complete cross-document compliance checking against role requirements.
---

## Quickstart

**Requirements:** Node 18+ and Docker.

1. **Clone & Install**
   ```bash
   pnpm install
   ```

2. **Environment Variables**
   ```bash
   cp .env.example .env
   ```
   **CRITICAL FOR EVALUATION:** You MUST open `.env` and assign your Gemini API key to `GEMINI_API_KEY`, otherwise the asynchronous extraction worker will silently fail all jobs!

3. **Start the Infrastructure (Postgres & Redis)**
   ```bash
   docker-compose up -d
   ```

4. **Start the API**
   ```bash
   pnpm run start:dev
   ```

The REST API is now officially running on `http://localhost:3000`.

---

## 🚀 How to Test (cURL Examples)

*The API defaults to asynchronous processing to protect the Node.js event loop and handle LLM latency gracefully at scale.*

### 1. Upload a Document (Async)
```bash
curl -X POST http://localhost:3000/api/extract \
  -H "Content-Type: multipart/form-data" \
  -F "file=@/path/to/your/pdf_or_image.jpg" \
  -F "sessionId=user-123"
```
*Returns a `jobId` and `pollUrl`.*

### 2. Check Extraction Status
```bash
curl http://localhost:3000/api/jobs/<jobId>
```
*Poll this until `status` becomes `COMPLETE`. It will contain the deeply structured JSON payload natively extracted by the LLM.*

### 3. Run Cross-Document Validation
Once you've uploaded a few documents for `user-123` (e.g. a Passport and a Medical Certificate), ask the system to automatically cross-validate them for hire-readiness:
```bash
curl -X POST http://localhost:3000/api/sessions/user-123/validate \
  -H "Content-Type: application/json" \
  -d '{"applicableRole": "Captain"}'
```
*This prompts the LLM to verify dates across documents and enforce strict STCW rules for the requested role.*

### 4. Get the Final Dashboard Report
```bash
curl http://localhost:3000/api/sessions/user-123/report
```
*Returns a unified, product-centric payload containing the document inventory and the final compliance `decision` (e.g., `READY`, `CONDITIONAL`).*

---

## 🏗 Architecture Highlights

- **Loosely Coupled Queue:** The native `BullMQ` engine naturally integrated with NestJS was manually abstracted behind an incredibly clean `IQueueProvider` interface, allowing a seamless zero-business-logic migration to AWS SQS or Apache Kafka.
- **Async-First by Design:** Node.js is single-threaded. By aggressively pushing LLM API bounds and memory-intensive file processing to a Redis queue, the main API cluster never arbitrarily blocks concurrent users.
- **Vendor-Agnostic LLM Layer:** Built against an `LLMProvider` interface. Swapping Gemini for Claude 3.5 or OpenAI strictly requires writing one provider class—zero changes to the parsing services.
- **Hybrid Relational Schema:** Standard queryable elements (e.g., `documentType`, `passportNumber`) are extracted into highly indexed PostgreSQL `VARCHAR` columns. Wildcard/variable dynamic data specifically lives in native PG `JSONB`, satisfying search efficiency over raw TEXT blobs.
