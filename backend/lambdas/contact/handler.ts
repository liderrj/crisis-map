import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import nodemailer from 'nodemailer';
import { jsonResponse, errorResponse } from '../../shared/headers.js';

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (transporter) return transporter;
  const user = process.env.CONTACT_EMAIL;
  const pass = process.env.CONTACT_APP_PASSWORD;
  if (!user || !pass) return null;
  transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user, pass },
  });
  return transporter;
}

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

    const t = getTransporter();
    if (t) {
      const emailBody = [
        `Mensaje de: ${alias}`,
        `Idioma: ${locale}`,
        `Asunto: ${subject}`,
        '',
        message,
      ].join('\n');

      await t.sendMail({
        from: `"CrisisMap" <${recipient}>`,
        to: recipient,
        subject: `[CrisisMap] ${subject}`,
        text: emailBody,
      });
    }

    return jsonResponse(200, { sent: true });
  } catch (err) {
    console.error('Contact handler error:', err);
    return jsonResponse(200, { sent: true, warning: 'logged only' });
  }
};
