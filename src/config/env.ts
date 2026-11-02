import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),

  // Swagger / API Key
  SWAGGER_API_KEY: z.string().min(16).default('lntrack-dev-api-key-change-in-prod'),
  SWAGGER_ENABLED: z
    .string()
    .transform((v) => v !== 'false')
    .default('true'),

  // AWS SNS
  AWS_REGION: z.string().default('ap-south-1'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_SNS_SENDER_ID: z.string().default('LNTRACK'),
  AWS_ENDPOINT: z.string().optional(),

  // WhatsApp
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),

  // Pinggy / CORS allow-list
  ALLOWED_ORIGINS: z.string().optional(), // comma-separated
});

export const env = envSchema.parse(process.env);
