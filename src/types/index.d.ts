import { FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    currentUser?: {
      id: number;
      email: string;
      accessType: 'SUPER_ADMIN' | 'ADMIN' | 'SUB_ADMIN';
      permissions: string[];
    };
  }
}

export interface DecodedToken {
  id: number;
  email: string;
  accessType: 'SUPER_ADMIN' | 'ADMIN' | 'SUB_ADMIN';
}

export type Permission =
  | 'manage_loans'
  | 'manage_payments'
  | 'export_data'
  | 'view_reports'
  | 'system_config'
  | 'audit_logs';

export type LoanStatusType = 'PENDING' | 'ACTIVE' | 'CLOSED' | 'DEFAULT';
export type PaymentStatusType = 'PENDING' | 'PAID' | 'OVERDUE';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  pagination?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
