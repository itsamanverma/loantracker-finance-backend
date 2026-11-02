import { env } from '../config/env.js';

/**
 * WhatsApp Business API service for mobile verification fallback.
 * Sends the "loan_verification" template message to borrower's WhatsApp.
 */
export const whatsappService = {
  async sendVerification(mobile: string): Promise<void> {
    const phoneNumber = `91${mobile}`; // E.164 without +

    // Development / missing credentials: simulate WhatsApp
    if (
      env.NODE_ENV === 'development' ||
      !env.WHATSAPP_PHONE_NUMBER_ID ||
      !env.WHATSAPP_ACCESS_TOKEN
    ) {
      console.log(`💬 [WHATSAPP SIMULATED] To: +${phoneNumber}`);
      console.log(`   Template: loan_verification — "Reply YES to verify your number"`);
      return;
    }

    // Production: call WhatsApp Cloud API
    const url = `https://graph.facebook.com/v18.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

    const payload = {
      messaging_product: 'whatsapp',
      to: phoneNumber,
      type: 'template',
      template: {
        name: 'loan_verification',
        language: { code: 'en_US' },
        components: [
          {
            type: 'body',
            parameters: [{ type: 'text', text: `+${phoneNumber}` }],
          },
        ],
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`WhatsApp API error: ${response.status} — ${error}`);
    }
  },
};
