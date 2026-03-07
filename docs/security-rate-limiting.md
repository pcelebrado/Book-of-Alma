# Security & Rate Limiting

## Overview

The security layer implements defense in depth with authentication, rate limiting, and audit logging. Rate limits prevent abuse and accidental loops while preserving the calm UX with clear, non-accusatory error messages.

Core-backed counters persisted on the Railway volume ensure rate limits survive process restarts and work under Railway's sleep/scale-to-zero constraints.

---

## Security Layers

### Layer 1: Network Security
- Only the web service is publicly exposed
- Core services are internal-only
- No direct browser access to internal services

### Layer 2: Authentication
- User authentication via NextAuth (HTTP-only cookies)
- Service authentication via JWT or shared secret
- Core service authentication with token/JWT verification

### Layer 3: Authorization
- Role-based access control (admin vs user)
- Endpoint-level permissions
- Resource ownership validation

### Layer 4: Rate Limiting
- Per-endpoint rate limits
- Per-user and per-IP tracking
- Core-backed counters for persistence

### Layer 5: Audit Logging
- All admin actions logged
- Authentication failures tracked
- Agent skill invocations recorded

---

## Rate Limiting Policy

### Login Endpoints

| Metric | Value |
|--------|-------|
| Limit | 5 attempts per 15 minutes |
| Scope | Per IP address |
| Response | 429 with retry information |

**Error Message:**
```
"Too many attempts. Try again in 15 minutes."
```

---

### Agent Skills

| Metric | Value |
|--------|-------|
| Per-minute | 10 requests per user |
| Per-hour | 100 requests per user |
| Response | 429 with retry information |

**Error Message:**
```
"You've hit the assistant limit. Try again soon."
```

---

### Search

| Metric | Value |
|--------|-------|
| Limit | 30 requests per minute per user |
| Response | 429 with retry information |

**Error Message:**
```
"Search is busy. Try again soon."
```

---

### Admin Actions

| Metric | Value |
|--------|-------|
| Limit | 5 requests per minute per admin |
| Applies | reindex, publish, import |
| Response | 429 with retry information |

**Error Message:**
```
"Too many admin actions. Try again shortly."
```

---

## Implementation

### Core-Backed Store Record

```json
{
  "key": "agent:user:12345",
  "window_start": 1736300400,
  "count": 5,
  "updated_at": "2026-03-07T04:00:00.000Z"
}
```

### Key Patterns

| Endpoint Type | Key Pattern | Example |
|---------------|-------------|---------|
| Login | `login:ip:{ip}` | `login:ip:192.168.1.1` |
| Agent | `agent:user:{userId}` | `agent:user:550e8400...` |
| Search | `search:user:{userId}` | `search:user:550e8400...` |
| Admin | `admin:user:{userId}` | `admin:user:550e8400...` |

### Windowing Model

- Counters are keyed by `key + window_start`.
- Window rollover is deterministic and reset by key window.
- Cleanup runs as part of periodic maintenance in core.

### Algorithm

```typescript
async function checkRateLimit(
  key: string,
  limit: number,
  windowMinutes: number
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setMinutes(now.getMinutes() - windowMinutes);
  
  // Upsert the counter for this window
  const result = await db.rate_limits.findOneAndUpdate(
    { key, windowStart: { $gte: windowStart } },
    { 
      $inc: { count: 1 },
      $setOnInsert: { createdAt: now, windowStart: now }
    },
    { upsert: true, returnDocument: 'after' }
  );
  
  if (result.count > limit) {
    const retryAfter = windowMinutes * 60;
    return { allowed: false, retryAfter };
  }
  
  return { allowed: true };
}
```

---

## Response Format

### Rate Limited Response

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 900
Content-Type: application/json

{
  "error": {
    "code": "rate_limited",
    "message": "Too many attempts. Try again in 15 minutes.",
    "details": {
      "retryAfterSeconds": 900
    }
  }
}
```

### Headers

| Header | Value | Description |
|--------|-------|-------------|
| `Retry-After` | Seconds | Time until next request allowed |
| `X-RateLimit-Limit` | Number | Maximum requests allowed |
| `X-RateLimit-Remaining` | Number | Requests remaining in window |
| `X-RateLimit-Reset` | Timestamp | When the window resets |

---

## Middleware Implementation

### Next.js Middleware

```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { checkRateLimit } from './lib/rate-limit';

export async function middleware(request: NextRequest) {
  const ip = request.ip ?? 'unknown';
  const path = request.nextUrl.pathname;
  
  // Login rate limiting
  if (path === '/api/auth/login') {
    const { allowed, retryAfter } = await checkRateLimit(
      `login:ip:${ip}`,
      5,      // 5 attempts
      15      // 15 minute window
    );
    
    if (!allowed) {
      return NextResponse.json(
        {
          error: {
            code: 'rate_limited',
            message: 'Too many attempts. Try again in 15 minutes.',
            details: { retryAfterSeconds: retryAfter }
          }
        },
        { 
          status: 429,
          headers: { 'Retry-After': String(retryAfter) }
        }
      );
    }
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*']
};
```

### API Route Handler

```typescript
// app/api/agent/skill/route.ts
import { checkRateLimit } from '@/lib/rate-limit';
import { getCurrentUser } from '@/lib/auth';

export async function POST(request: Request) {
  const user = await getCurrentUser();
  
  // Check rate limit
  const { allowed, retryAfter } = await checkRateLimit(
    `agent:user:${user.id}`,
    10,     // 10 per minute
    1       // 1 minute window
  );
  
  if (!allowed) {
    return Response.json(
      {
        error: {
          code: 'rate_limited',
          message: "You've hit the assistant limit. Try again soon.",
          details: { retryAfterSeconds: retryAfter }
        }
      },
      { status: 429 }
    );
  }
  
  // Process the request...
}
```

---

## CORS Configuration

### Allowed Origins

```typescript
// next.config.js
module.exports = {
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: process.env.NEXT_PUBLIC_APP_URL
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS'
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization'
          }
        ]
      }
    ];
  }
};
```

---

## Audit Logging

### Logged Events

| Event | Store | Details |
|-------|-------|---------|
| Login success | core audit store | userId, timestamp, ip |
| Login failure | core audit store | ip, reason, timestamp |
| Rate limit hit | core audit store | key, endpoint, timestamp |
| Admin action | core audit store | userId, action, details |
| Agent run | core run logs | userId, skill, context |

### Audit Log Schema

```json
{
  "id": "evt_01",
  "actor_user_id": "usr_01",
  "action": "login_fail",
  "details": {
    "ip": "192.168.1.1",
    "endpoint": "/api/auth/login",
    "reason": "invalid_credentials"
  },
  "created_at": "2026-03-07T04:00:00.000Z"
}
```

---

## Security Checklist

### Deployment Checklist

- [ ] Only Web service is publicly exposed
- [ ] No legacy database service is publicly exposed
- [ ] Core service has no public HTTP
- [ ] Service-to-service auth implemented (JWT)
- [ ] Login rate limiting enabled (5/15min per IP)
- [ ] Agent skills rate limited (10/min, 100/hr per user)
- [ ] Search rate limited (30/min per user)
- [ ] Admin actions rate limited (5/min per admin)
- [ ] CORS locked to web domain only
- [ ] Audit logging for all admin actions
- [ ] Audit logging for authentication failures
- [ ] Generic error messages (no account enumeration)
- [ ] HTTPS enforced in production
- [ ] HTTP-only cookies for sessions
- [ ] Secure cookie attributes (Secure, SameSite)

### Code Review Checklist

- [ ] No secrets in code or logs
- [ ] Input validation on all endpoints
- [ ] Output sanitization for user content
- [ ] SQL/NoSQL injection prevention
- [ ] XSS prevention (output encoding)
- [ ] CSRF protection
- [ ] Proper error handling (no stack traces to client)

---

## Monitoring & Alerting

### Metrics to Track

| Metric | Alert Threshold |
|--------|----------------|
| Rate limit hits | >100/hour |
| Login failures | >50/hour |
| Auth failures to Core | >20/hour |
| 429 responses | >200/hour |

### Log Analysis

```bash
# Find top rate-limited IPs
db.audit_log.aggregate([
  { $match: { action: "rate_limited", createdAt: { $gte: new Date(Date.now() - 86400000) } } },
  { $group: { _id: "$details.ip", count: { $sum: 1 } } },
  { $sort: { count: -1 } },
  { $limit: 10 }
]);
```

---

## Troubleshooting

### Rate Limit Too Aggressive

**Symptoms:** Legitimate users being rate limited

**Solutions:**
1. Increase limits temporarily
2. Add user to whitelist
3. Review window size (shorter windows = faster recovery)

### Rate Limit Not Working

**Symptoms:** No 429 responses, counters not incrementing

**Check:**
1. Core data store endpoint connectivity
2. Counter window key format matches (`key + window_start`)
3. Key format matches (case sensitivity)
4. Middleware is applied to route

### Audit Log Spam

**Symptoms:** Excessive audit log entries

**Solutions:**
1. Rate limit audit logging itself
2. Sample high-frequency events
3. Use separate collection for high-volume events

---

*For more details, see the [Internal Service Auth](./internal-service-auth.md) and [Data Layer Migration Notes](./mongodb-data-layer.md).*
