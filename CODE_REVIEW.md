Nice job getting the full flow working end-to-end (file upload → LLM → JSON response). That’s a good starting point and also shows good initiative.

Before we merge this, there are a few important issues around security, reliability, and scalability that we should fix. Most of these are common when working with file uploads and LLMs, so I’ve called them out with context and suggested fixes.

**Review Comments**

### 1. Hardcoded API Key
```typescript
const client = new Anthropic({ apiKey: 'sk-ant-REDACTED' });
```

**Issue:**
The API key is hardcoded in the source code.

**Why this matters:**
If this code is ever pushed to a public repo or shared accidentally, the key can be exposed and abused. Also, hardcoding makes it difficult to manage different environments (dev, staging, prod).

**Action:**
Move this to environment variables:
```typescript
process.env.ANTHROPIC_API_KEY
```
and load it via a config layer.

---

### 2. Hardcoded Model & High Cost
```typescript
model: 'claude-opus-4-6'
```

**Issues:**
1. Model is tightly coupled to the code
2. Opus model is an expensive model for standard data extraction.

**Why this matters:**
Using the highest cost model in the Claude suite significantly burns unnecessary money on simple OCR tasks. Also, if we want to switch to a faster, cheaper model (like Haiku or Sonnet), it would require a code change and redeploy.

**Action:**
Move model selection to an environment variable (e.g., `LLM_MODEL`) so we can seamlessly switch models and use a cheaper model for simple OCR tasks.

---

### 3. Blocking File Operations
```typescript
fs.readFileSync(file.path);
fs.copyFileSync(file.path, savedPath);
```

**Issue:**
Synchronous file operations block the Node.js event loop.

**Why this matters:**
Node runs on a single thread. While one request is doing `readFileSync`, other requests are blocked. This becomes an issue during multiple uploads.

**Action:**
Use async versions:
```typescript
fs.promises.readFile
fs.promises.copyFile
```

---

### 4. Unsafe File Handling & PII Compliance
```typescript
path.join('./uploads', file.originalname)
```

**Issue:**
Using `file.originalname` directly is unsafe, and saving files locally can cause problems.

**Why this matters:**
1. A user can send a manipulated file name (like ../../../etc/passwd) and overwrite files on the server.
2. These documents may contain sensitive personal data, so storing them on local disk without proper handling is risky. 

**Action:**
1. Avoid saving files locally if not needed
2. Process the file in memory, or store it securely (e.g., in S3)

---

### 5. Global in Memory Storage
```typescript
global.extractions.push(result);
```

**Issue:**
Using global state for storing results.

**Why this matters:**
- Memory keeps growing → crash
- Data will be lost on restart
- Doesn’t work with multiple server instances

**Action:**
Store results in a database or remove this entirely.

---

### 6. Fragile JSON Parsing
```typescript
JSON.parse(response.content[0].text);
```

**Issue:**
LLM will not always return a valid JSON.

**Why this matters:**
LLMs often return:  
- markdown (````json ... ````)
- extra text
- slightly invalid JSON

This will cause runtime errors.

**Action:**
- Extract JSON safely (find `{}` boundaries)
- Add fallback handling if parsing fails

---

### 7. No Timeout Handling
```typescript
await client.messages.create(...)
```

**Issue:**
No timeout on external API call.

**Why this matters:**
If the LLM is slow or hangs, the request will hang indefinitely and affect the user experience.

**Action:**
Add a timeout (e.g., 30s) and fail gracefully.

---

### 8. Weak Prompt
```typescript
"Extract all information from this maritime document and return as JSON."
```

**Issue:**
Prompt is too open ended.

**Why this matters:**
The output can be inconsistent, making it harder for the frontend to rely on.

**Action:**
Define a clear JSON structure in the prompt with proper instructions and examples.

---

### 9. Missing Input Validation

**Issue:**
No validation for file type or size.

**Why this matters:**
- Invalid files can break processing
- Large files can impact performance

**Action:**
Validate:
- MIME type (jpeg, png, pdf)
- File size limits

---

### 10. Error Handling
```typescript
console.log('Error:', error);
res.status(500).json({ error: 'Something went wrong' });
```

**Issue:**
Generic error handling.

**Why this matters:**
- Hard to debug
- Client gets no useful information

**Action:**
- Use structured logging
- Return meaningful error responses (e.g., parsing vs API error)

---

### Teaching Moment

The key thing to understand is:

**LLMs are not reliable like traditional APIs — you have to code defensively around them.**

Right now the code assumes:
- response will always be valid JSON
- response will always be fast
- prompt will always behave consistently

In practice, none of these are guaranteed.

A more robust approach is:
- validate and sanitize LLM output before using it
- add timeouts and error handling around external calls
- make prompts strict so output is predictable

If you design with this mindset early, the system will be much more stable as usage grows.

---

### Summary

Great implementation. But before merging, please fix the below items:
- Move API key and model to env/config
- Replace sync file operations with async
- Remove global state
- Improve LLM handling (prompt, parsing, timeout)
- Add input validation
- Improve error handling

Once these are fixed, this will be in a strong position to move forward. 