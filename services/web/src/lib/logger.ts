/**
 * Logging and audit trail for OpenClaw Web Service.
 * DECISION_197: MongoDB → SQLite migration.
 * Audit log now writes to SQLite via repositories.
 */
import { auditLog } from '@/lib/db/repositories';

type SecurityEventName =
  | 'auth.login.success'
  | 'auth.login.fail'
  | 'auth.rate_limited'
  | 'internal.core.auth_fail'
  | 'admin.action'
  | 'agent.skill.invoked'
  | 'agent.skill.rate_limited'
  | 'core.unavailable'
  | 'db.error';

interface LogEventInput {
  requestId?: string | null;
  route?: string;
  userId?: string;
  ip?: string | null;
  details?: Record<string, unknown>;
}

interface AuditLogInput {
  actorUserId?: string;
  action: 'book_import' | 'book_publish' | 'reindex' | 'config_change' | 'agent_run' | 'login_fail';
  details: Record<string, unknown>;
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function logSecurityEvent(event: SecurityEventName, input: LogEventInput = {}) {
  const payload = {
    level: event.endsWith('.fail') || event.endsWith('.error') ? 'warn' : 'info',
    event,
    timestamp: nowIso(),
    requestId: input.requestId ?? null,
    route: input.route ?? null,
    userId: input.userId ?? null,
    ip: input.ip ?? null,
    details: input.details ?? {},
  };

  console.log(JSON.stringify(payload));
}

export async function writeAuditLog(input: AuditLogInput) {
  try {
    auditLog.insert({
      actorUserId: input.actorUserId,
      action: input.action,
      details: input.details,
    });
  } catch (error) {
    await logSecurityEvent('db.error', {
      route: 'audit_log',
      userId: input.actorUserId,
      details: {
        reason: 'audit_log_write_failed',
        action: input.action,
        message: error instanceof Error ? error.message : 'unknown_error',
      },
    });
  }
}
