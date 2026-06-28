import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { jsonResponse, errorResponse, sanitize } from '../../shared/headers.js';

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const recipient = process.env.CONTACT_EMAIL;
    if (!recipient) {
      return errorResponse(500, 'Contact form not configured');
    }

    let body: { subject?: string; message?: string; alias?: string; locale?: string };
    try {
      body = JSON.parse(event.body ?? '{}');
    } catch {
      return errorResponse(400, 'Invalid JSON body');
    }

    const message = (body.message ?? '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 5000).trim();
    if (!message) {
      return errorResponse(400, 'message is required');
    }

    const alias = body.alias ? body.alias.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 30).trim() : 'Anonymous';
    const locale = body.locale ?? 'unknown';
    const subject = (body.subject ?? 'No subject').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 200).trim();

    console.log(JSON.stringify({
      type: 'contact', recipient, subject: `[CrisisMap] ${subject}`,
      alias, locale, message,
    }));

    return jsonResponse(200, { sent: true });
  } catch (err) {
    console.error('Contact handler error:', err);
    return errorResponse(500, 'Failed to send message');
  }
};
