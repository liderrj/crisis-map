import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { jsonResponse, errorResponse, sanitize } from '../../shared/headers.js';

const ses = new SESClient({});

const MAX_SUBJECT_LENGTH = 200;
const MAX_MESSAGE_LENGTH = 5000;
const MAX_ALIAS_LENGTH = 30;

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const recipient = process.env.CONTACT_EMAIL;
    if (!recipient) {
      console.error('CONTACT_EMAIL env var not set');
      return errorResponse(500, 'Contact form not configured');
    }

    let body: { subject?: string; message?: string; alias?: string; locale?: string };
    try {
      body = JSON.parse(event.body ?? '{}');
    } catch {
      return errorResponse(400, 'Invalid JSON body');
    }

    const subject = sanitize(body.subject ?? 'No subject', MAX_SUBJECT_LENGTH);
    const message = sanitize(body.message ?? '', MAX_MESSAGE_LENGTH);
    if (!message) {
      return errorResponse(400, 'message is required');
    }

    const alias = body.alias ? sanitize(body.alias, MAX_ALIAS_LENGTH) : 'Anonymous';
    const locale = body.locale ?? 'unknown';

    const emailBody = [
      `Alias: ${alias}`,
      `Locale: ${locale}`,
      '',
      message,
    ].join('\n');

    await ses.send(new SendEmailCommand({
      Destination: { ToAddresses: [recipient] },
      Message: {
        Subject: { Data: `[CrisisMap] ${subject}` },
        Body: { Text: { Data: emailBody } },
      },
      Source: recipient,
    }));

    return jsonResponse(200, { sent: true });
  } catch (err) {
    console.error('Contact handler error:', err);
    return errorResponse(500, 'Failed to send message');
  }
};
