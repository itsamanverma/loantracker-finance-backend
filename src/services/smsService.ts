import { env } from '../config/env.js';

/**
 * SMS service using AWS SNS for OTP and broadcast messages.
 * Falls back to console logging in development when AWS credentials are not configured.
 */
export const smsService = {
  async send(mobile: string, message: string): Promise<void> {
    const phoneNumber = `+91${mobile}`;

    // Development / missing credentials: simulate SMS unless AWS_ENDPOINT is set
    if (
      !env.AWS_ENDPOINT &&
      (env.NODE_ENV === 'development' ||
        !env.AWS_ACCESS_KEY_ID ||
        !env.AWS_SECRET_ACCESS_KEY)
    ) {
      console.log(`📱 [SMS SIMULATED] To: ${phoneNumber}`);
      console.log(`   Message: ${message}`);
      return;
    }

    // Use AWS SNS (via LocalStack or real AWS)
    const awsSdk = await import('@aws-sdk/client-sns').catch(() => {
      throw new Error('AWS SDK not installed. Run: npm install @aws-sdk/client-sns');
    }) as { SNSClient: new (cfg: unknown) => { send: (cmd: unknown) => Promise<unknown> }; PublishCommand: new (cfg: unknown) => unknown };

    const client = new awsSdk.SNSClient({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID || 'test',
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY || 'test',
      },
      endpoint: env.AWS_ENDPOINT || undefined,
    });

    try {
      await client.send(
        new awsSdk.PublishCommand({
          PhoneNumber: phoneNumber,
          Message: message,
          MessageAttributes: {
            'AWS.SNS.SMS.SenderID': {
              DataType: 'String',
              StringValue: env.AWS_SNS_SENDER_ID,
            },
            'AWS.SNS.SMS.SMSType': {
              DataType: 'String',
              StringValue: 'Transactional',
            },
          },
        })
      );
    } catch (err: any) {
      console.error(`AWS SNS failed: ${err.message || err}`);
      if (env.NODE_ENV === 'development') {
        console.log(`📱 [FALLBACK SMS SIMULATED] To: ${phoneNumber}`);
        console.log(`   Message: ${message}`);
      } else {
        throw err;
      }
    }
  },
};
