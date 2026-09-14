import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyWebhookSignature } from '../webhook-security.js';

describe('Lemon Squeezy webhook signatures', () => {
  it('accepts the matching HMAC and rejects malformed signatures', () => {
    const body = Buffer.from('{"event":"subscription_created"}');
    const secret = 'test-secret';
    const signature = createHmac('sha256', secret).update(body).digest('hex');

    expect(verifyWebhookSignature(body, signature, secret)).toBe(true);
    expect(verifyWebhookSignature(body, 'wrong', secret)).toBe(false);
  });
});
