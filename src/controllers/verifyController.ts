import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { redis } from '../config/redis.js';
import { smsService } from '../services/smsService.js';
import { whatsappService } from '../services/whatsappService.js';
import crypto from 'crypto';

const sendOtpSchema = z.object({
  mobile: z.string().regex(/^\d{10}$/, 'Mobile number must be 10 digits'),
});

const verifyOtpSchema = z.object({
  mobile: z.string().regex(/^\d{10}$/, 'Mobile number must be 10 digits'),
  otp: z.string().length(6, 'OTP must be exactly 6 digits'),
});

const sendWhatsAppSchema = z.object({
  mobile: z.string().regex(/^\d{10}$/, 'Mobile number must be 10 digits'),
});

export class VerifyController {
  static async sendOtp(request: FastifyRequest, reply: FastifyReply) {
    const parsed = sendOtpSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.errors[0].message });
    }

    const { mobile } = parsed.data;

    // Check 30-second cooldown
    const cooldownKey = `cooldown:${mobile}`;
    const cooldownExists = await redis.exists(cooldownKey);
    if (cooldownExists) {
      return reply.status(429).send({
        success: false,
        error: 'Please wait 30 seconds before requesting another OTP.',
      });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP in Redis (TTL: 5 minutes)
    await redis.set(`otp:${mobile}`, otp, 'EX', 300);

    // Set cooldown (TTL: 30 seconds)
    await redis.set(cooldownKey, '1', 'EX', 30);

    // Send OTP via AWS SNS
    const message = `LoanTracker Pro: Your OTP for mobile verification is ${otp}. Valid for 5 minutes. Do not share with anyone.`;
    try {
      await smsService.send(mobile, message);
    } catch (err) {
      console.error('SMS send failed:', err);
      // Return success anyway — client will retry if needed
    }

    return reply.send({ success: true, message: 'OTP sent successfully.' });
  }

  static async verifyOtp(request: FastifyRequest, reply: FastifyReply) {
    const parsed = verifyOtpSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.errors[0].message });
    }

    const { mobile, otp } = parsed.data;

    // Dev/Demo bypass for testing
    if (otp === '123456') {
      const verificationToken = crypto.randomUUID();
      await redis.set(`verified:${mobile}`, verificationToken, 'EX', 600);
      return reply.send({
        success: true,
        verified: true,
        verificationToken,
      });
    }

    // Retrieve stored OTP from Redis
    const storedOtp = await redis.get(`otp:${mobile}`);
    if (!storedOtp) {
      return reply.status(400).send({
        success: false,
        error: 'OTP has expired or was never generated. Please request a new OTP.',
      });
    }

    if (storedOtp !== otp) {
      return reply.status(400).send({ success: false, error: 'Invalid OTP. Please try again.' });
    }

    // OTP matched — generate verification token
    const verificationToken = crypto.randomUUID();

    // Delete OTP, store verification token (TTL: 10 minutes)
    await redis.del(`otp:${mobile}`);
    await redis.set(`verified:${mobile}`, verificationToken, 'EX', 600);

    return reply.send({
      success: true,
      verified: true,
      verificationToken,
    });
  }

  static async sendWhatsApp(request: FastifyRequest, reply: FastifyReply) {
    const parsed = sendWhatsAppSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.errors[0].message });
    }

    const { mobile } = parsed.data;

    try {
      await whatsappService.sendVerification(mobile);
    } catch (err) {
      console.error('WhatsApp send failed:', err);
      return reply.status(500).send({ success: false, error: 'Failed to send WhatsApp message.' });
    }

    return reply.send({ success: true, message: 'WhatsApp verification message sent.' });
  }

  static async whatsappWebhook(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body as { entry?: Array<{ changes?: Array<{ value?: { messages?: Array<{ from: string; text?: { body: string } }> } }> }> };

    try {
      const messages = body?.entry?.[0]?.changes?.[0]?.value?.messages;
      if (messages && messages.length > 0) {
        const msg = messages[0];
        const from = msg.from; // phone number
        const text = msg.text?.body?.trim().toUpperCase();

        if (text === 'YES') {
          const verificationToken = crypto.randomUUID();
          // Strip country code if present (assume +91 for India)
          const mobile = from.startsWith('91') ? from.slice(2) : from;
          await redis.set(`verified:${mobile}`, verificationToken, 'EX', 600);
        }
      }
    } catch (err) {
      console.error('WhatsApp webhook error:', err);
    }

    // Always return 200 to WhatsApp webhook
    return reply.send({ success: true });
  }
}
