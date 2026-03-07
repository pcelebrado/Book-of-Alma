# Sleep/Scale-to-Zero UX

## Overview

The Sleep/Scale-to-Zero UX pattern handles periods when the core service is sleeping or unreachable due to Railway's scale-to-zero behavior. The design ensures **no silent failures** while maintaining a calm, editorial experience that keeps users engaged with their reading.

When core is unavailable, the UI transitions through clear states—"Waking" and "Unavailable"—with messaging that explains what's happening and what the user can do next.

---

## The Problem

Railway may sleep services when idle to conserve resources. This creates challenges:

- **Cold starts** can take 5-30 seconds
- **Intermittent availability** during wake-up
- **User confusion** if the UI hangs or fails silently

**Our Solution:** Graceful degradation with clear communication.

---

## Detection Rules

The web service treats Core as unavailable when:

| Condition | Detection |
|-----------|-----------|
| Request timeout | >5-8 seconds without response |
| HTTP errors | 502 Bad Gateway, 503 Service Unavailable |
| Health check failure | `/internal/health` returns non-200 |
| Connection refused | Network-level connection failure |

**Timeout Configuration:**
```typescript
const CORE_TIMEOUT = 8000; // 8 seconds
```

---

## UX States

### State 1: Ready

Core is responsive and operational.

```
┌─────────────────────────┐
│  Assistant     [● Ready]│
├─────────────────────────┤
│  [Explain] [Socratic]   │
│  [Flashcards] [Check]   │
│                         │
│  [Run skill...]         │
└─────────────────────────┘
```

---

### State 2: Waking

First request after sleep or health check indicates Core is starting.

```
┌─────────────────────────┐
│  Assistant              │
├─────────────────────────┤
│  ⏳ Waking assistant... │
│                         │
│  This can take a few    │
│  seconds after          │
│  inactivity.            │
│                         │
│  [Retry]                │
│                         │
│  [Continue reading →]   │
└─────────────────────────┘
```

**Behavior:**
- Show immediately on first failure
- Optional auto-retry after 2 seconds
- User can continue reading (non-blocking)
- Spinner indicates activity

---

### State 3: Unavailable

Core didn't respond within timeout after retry attempts.

```
┌─────────────────────────┐
│  Assistant              │
├─────────────────────────┤
│  ⚠️ Assistant           │
│     temporarily         │
│     unavailable         │
│                         │
│  Try again in a moment. │
│                         │
│  [Retry]                │
│                         │
│  Last success: 5 min ago│
└─────────────────────────┘
```

**Behavior:**
- Show after timeout (8 seconds)
- Clear error message
- Retry button for manual retry
- Timestamp of last successful call
- User can still read book content

---

## Component-Specific Handling

### Agent Panel (Reader)

| State | UI | User Can |
|-------|-----|----------|
| Ready | Full skill buttons | Use all skills |
| Waking | "Waking..." message | Continue reading |
| Unavailable | Error + Retry | Continue reading |

**Key Principle:** Never block reading. The book content is always available.

---

### Book Search (⌘K)

**When QMD is unavailable:**

```
┌─────────────────────────────┐
│  Search...              ⌘K  │
├─────────────────────────────┤
│  ⚠️ Search is waking up     │
│                             │
│  Semantic search is         │
│  temporarily unavailable.   │
│                             │
│  [Retry]  [Use basic search]│
└─────────────────────────────┘
```

**Fallback Options:**
1. **Core basic search** — Use core-backed substring search fallback
2. **Retry button** — Attempt QMD again
3. **Browse TOC** — Navigate without search

---

### Admin Reindex

**When Core is unavailable:**

```
┌─────────────────────────────┐
│  System Status              │
├─────────────────────────────┤
│  ⚠️ Core service is         │
│     asleep/unreachable      │
│                             │
│  The assistant and search   │
│  functions are temporarily  │
│  unavailable.               │
│                             │
│  [Wake and retry]           │
│                             │
│  Last run: 2 hours ago      │
│  Last error: Timeout after  │
│  8 seconds                  │
└─────────────────────────────┘
```

**Information Displayed:**
- Explicit error state
- Wake and retry CTA
- Last successful run time
- Last error details
- No silent failure

---

## Retry Strategy

### User-Driven Retry

Primary retry mechanism is user-initiated:

```typescript
function AgentPanel() {
  const [status, setStatus] = useState<'ready' | 'waking' | 'unavailable'>('ready');
  
  const handleRetry = async () => {
    setStatus('waking');
    try {
      await checkCoreHealth();
      setStatus('ready');
    } catch {
      setStatus('unavailable');
    }
  };
  
  return (
    <div>
      {status === 'unavailable' && (
        <>
          <p>Assistant temporarily unavailable</p>
          <button onClick={handleRetry}>Retry</button>
        </>
      )}
    </div>
  );
}
```

### Optional Auto-Retry

One automatic retry after 2 seconds:

```typescript
const AUTO_RETRY_DELAY = 2000;
const MAX_RETRIES = 1;

async function callWithRetry<T>(
  fn: () => Promise<T>,
  retryCount = 0
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      await sleep(AUTO_RETRY_DELAY);
      return callWithRetry(fn, retryCount + 1);
    }
    throw error;
  }
}
```

**No Infinite Loops:**
- Maximum 1 auto-retry
- Then require user action
- Show "still waking..." after 2 attempts

---

## Telemetry

### Logged Events

| Event | Data | Purpose |
|-------|------|---------|
| `core_unavailable` | timestamp, endpoint, error | Track downtime |
| `core_waking` | timestamp, attempt | Track wake attempts |
| `time_to_first_success` | duration after wake | Tune timeouts |
| `retry_attempted` | manual vs auto | Understand user behavior |

### Example Telemetry

```typescript
// Log when Core becomes unavailable
logger.info('core_unavailable', {
  endpoint: '/internal/agent/run',
  error: 'timeout',
  duration: 8000
});

// Log successful recovery
logger.info('core_recovered', {
  timeToRecovery: 12000,
  attempts: 2
});
```

### Metrics Dashboard

Track these metrics to tune sleep behavior:

| Metric | Target | Alert If |
|--------|--------|----------|
| Unavailability events | <10/day | >20/day |
| Avg time to recovery | <15s | >30s |
| User retry rate | <50% | >75% |

---

## Configuration

### Timeout Settings

```bash
# Core request timeout (milliseconds)
CORE_REQUEST_TIMEOUT=8000

# Health check interval (milliseconds)
HEALTH_CHECK_INTERVAL=30000

# Auto-retry enabled
AUTO_RETRY_ENABLED=true

# Auto-retry delay (milliseconds)
AUTO_RETRY_DELAY=2000
```

### Fallback Search

```bash
# Enable core fallback for search
SEARCH_FALLBACK_ENABLED=true

# Fallback search collection
SEARCH_FALLBACK_COLLECTION=book_sections
```

---

## Implementation Example

### Core Client with Sleep Handling

```typescript
// lib/core-client.ts
import { logger } from './logger';

const CORE_TIMEOUT = 8000;
const AUTO_RETRY_DELAY = 2000;

export class CoreClient {
  private baseUrl: string;
  private lastSuccess: Date | null = null;
  
  constructor() {
    this.baseUrl = process.env.INTERNAL_CORE_BASE_URL;
  }
  
  async call<T>(endpoint: string, options: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(CORE_TIMEOUT)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      this.lastSuccess = new Date();
      return await response.json();
      
    } catch (error) {
      logger.warn('core_call_failed', { endpoint, error: error.message });
      throw error;
    }
  }
  
  async checkHealth(): Promise<boolean> {
    try {
      await this.call('/internal/health', { method: 'GET' });
      return true;
    } catch {
      return false;
    }
  }
  
  getLastSuccess(): Date | null {
    return this.lastSuccess;
  }
}
```

### React Hook for Core Status

```typescript
// hooks/use-core-status.ts
import { useState, useEffect } from 'react';
import { CoreClient } from '@/lib/core-client';

export function useCoreStatus() {
  const [status, setStatus] = useState<'ready' | 'waking' | 'unavailable'>('ready');
  const [lastSuccess, setLastSuccess] = useState<Date | null>(null);
  
  const client = new CoreClient();
  
  const checkStatus = async () => {
    setStatus('waking');
    const isHealthy = await client.checkHealth();
    
    if (isHealthy) {
      setStatus('ready');
      setLastSuccess(new Date());
    } else {
      setStatus('unavailable');
    }
  };
  
  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, []);
  
  return { status, lastSuccess, checkStatus };
}
```

### Agent Panel Component

```typescript
// components/agent-panel.tsx
import { useCoreStatus } from '@/hooks/use-core-status';

export function AgentPanel() {
  const { status, lastSuccess, checkStatus } = useCoreStatus();
  
  if (status === 'waking') {
    return (
      <div className="agent-panel">
        <h3>Assistant</h3>
        <div className="status waking">
          <span className="spinner">⏳</span>
          <p>Waking assistant...</p>
          <p className="muted">
            This can take a few seconds after inactivity.
          </p>
          <button onClick={checkStatus}>Retry</button>
          <a href="#continue">Continue reading →</a>
        </div>
      </div>
    );
  }
  
  if (status === 'unavailable') {
    return (
      <div className="agent-panel">
        <h3>Assistant</h3>
        <div className="status unavailable">
          <span className="icon">⚠️</span>
          <p>Assistant temporarily unavailable</p>
          <p className="muted">Try again in a moment.</p>
          <button onClick={checkStatus}>Retry</button>
          {lastSuccess && (
            <p className="last-success">
              Last success: {formatRelativeTime(lastSuccess)}
            </p>
          )}
        </div>
      </div>
    );
  }
  
  return (
    <div className="agent-panel">
      <h3>Assistant</h3>
      {/* Skill buttons */}
    </div>
  );
}
```

---

## Compliance Checklist

- [ ] No silent failure: every failure state shows message + retry
- [ ] User can continue reading even if Core is down
- [ ] Admin surfaces last run time + error details
- [ ] Timeout is reasonable (5-8 seconds)
- [ ] Auto-retry is limited (max 1 attempt)
- [ ] Telemetry logs core_unavailable events
- [ ] Time-to-first-success is tracked
- [ ] Retry attempts are logged
- [ ] UI shows "last success" timestamp
- [ ] Search has fallback option

---

## Best Practices

1. **Never block reading** — Book content is always available
2. **Clear messaging** — Explain what's happening
3. **Actionable CTAs** — Always provide a next step
4. **Non-accusatory tone** — "Waking up" not "Error"
5. **Respect user time** — Show progress, not spinners forever
6. **Log everything** — Track for tuning and debugging
7. **Test cold starts** — Simulate sleep during development

---

*For more details, see the [Service Architecture](./service-architecture.md) and [Agent Skills](./agent-skills.md) documentation.*
