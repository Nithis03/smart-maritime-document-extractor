# Architecture Decision Record

## Question 1 — Sync vs Async

**In production, async should be the default.**
Calling an LLM for OCR extraction can easily take 5 to 15 seconds. If we keep sync as the default everywhere, those HTTP requests will block and eventually cause 504 timeouts when the system is under load. 

Right now, our API defaults to `?mode=async` to keep the system stable and manage the queue. We kept the `?mode=sync` option around mostly as a convenience for the frontend—if a user is just uploading a single certificate and waiting on the UI, sync gives them immediate feedback without needing us to wire up websockets.

**Thresholds:**
Even if `?mode=sync` is requested, I would force the system to drop into async if:
- The uploaded file is larger than ~2MB
- The Redis queue already has 5-10 jobs backed up in `PROCESSING`
- We're getting close to hitting our LLM provider's API rate limits

---

## Question 2 — Queue Choice

**I went with BullMQ and Redis.**
It’s the standard choice for Node environments. It’s lightweight, easy to set up, and handles the basics like job states, retries, and delays out of the box without needing heavy infrastructure.

**Migration path:**
If we actually needed to process ~500 extractions every minute, Redis memory limits and node's single-threaded nature would become a bottleneck. At that scale, I'd migrate the queue to AWS SQS or Kafka for better durability and horizontal scaling.

**Current Failure Modes:**
- **Worker crashes:** If the node process dies while waiting for Gemini to respond, the job gets stuck in `PROCESSING` indefinitely. We'd need to add a stalled-job watcher to clean those up.
- **Redis crashes:** If Redis crashes and isn't configured with persistence (AOF/RDB), we lose the queue outright.

---

## Question 3 — LLM Provider Abstraction

I created a simple interface for the LLM provider instead of calling Gemini directly.

**Interface Design:**
```typescript
export interface LLMProvider {
  extractDocument(base64: string, mimeType: string, customPrompt?: string): Promise<string>;
  validateSession(sessionDataJson: string): Promise<string>;
  repairDocumentJSON(rawText: string): Promise<string>;
  getPromptVersion(): string;
}
```

**Justification:**
AI models are changing constantly. By coding against this `LLMProvider` interface (which `LlmService` currently implements for Gemini), we avoid vendor lock in. If a new model drops tomorrow that is cheaper or faster, we just write a new class for it and inject it. The rest of the business logic doesn't have to change at all.

---

## Question 4 — Schema Design

The suggested starter schema threw all the dynamic data into a couple of big `TEXT` columns. 

**Risks:**
Storing JSON as raw text makes it hard to query efficiently at the database level. You can't index it well, and doing full table scans to parse text at the application layer won't scale.

**How I actually built it:**
I decided to use a hybrid approach with proper Postgres features:
1. **Extracted columns:** I pulled the important, searchable fields right out of the JSON (`documentType`, `applicableRole`, `holderName`, `passportNumber`, `sirbNumber`) and made them actual `VARCHAR` columns.
2. **Indexes:** I added B-Tree indexes on `sessionId` and `fileHash`, which gives us instant deduplication if a user uploads the exact same file twice.
3. **Structured JSONB:** For the truly dynamic stuff like `fieldsJson` and `flagsJson`, I used Postgres `JSONB` instead of text, which is actually meant for querying.

---

## Question 5 — What You Skipped

**1. Authentication & Authorization**
- I didn’t implement authentication or role checks. Security is important for this system since it handles sensitive documents, but I focused first on the core extraction, async processing, and validation flow. The current design allows authentication to be added next as middleware without changing the main logic.

**2. File Storage (S3)**
- Right now, we just pass the file buffer straight to the LLM as Base64. In reality, files should be uploaded to S3 first, and the worker should download them via a signed URL. I deliberately skipped implementing a quick fix for this because we need to properly plan a dedicated cloud storage architecture (e.g., lifecycle policies, encryption) for the system's longevity.

**3. Observability & Logging**
- I used standard NestJS logging, but a real deployment needs structured JSON logs and trace IDs so we can track a request from the API gateway all the way down into the BullMQ worker. I skipped this for now because locking into a tool quickly isn't ideal—we need to evaluate the best telemetry stack (e.g., Signoz, Datadog) for long-term observability.



## Rate Limiting Mechanism

I implemented rate limiting using Redis with a sliding window approach inside a custom NestJS Guard.

**Why this approach?**

**Reuse of Redis**: We are already using Redis for BullMQ, so it made sense to use the same setup instead of adding something new.
**More accurate control**: Sliding window avoids sudden spikes that can happen with fixed window limits.
**Better control**: Writing a simple custom Guard made it easier to control the response format and headers like Retry-After.

---

## Prompt Versioning

**Why storing it matters for production:**
Prompts behave like code. If we change a prompt and suddenly the extraction quality drops, we need to know which records were generated using which version.

By storing promptVersion with every extraction, we can easily track this. It helps us compare results across versions, test improvements, and roll back if something goes wrong.