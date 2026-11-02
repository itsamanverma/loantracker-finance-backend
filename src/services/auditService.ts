import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';

interface AuditEntry {
  userId?: number;
  action: string;
  entityType: string;
  entityId?: number;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * Append-only audit log writer.
 * Use for all sensitive state changes: CREATE_LOAN, RECORD_PAYMENT,
 * UPDATE_INTEREST_RATES, CREATE_USER, DEACTIVATE_USER, EXPORT_DATA, SMS_BROADCAST.
 */
export const auditService = {
  async log(entry: AuditEntry): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          userId: entry.userId,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          details: (entry.details ?? {}) as Prisma.InputJsonValue,
          ipAddress: entry.ipAddress,
        },
      });
    } catch (err) {
      // Audit logging must never crash the main flow
      console.error('⚠️ AuditService: Failed to write audit log:', err);
    }
  },
};
