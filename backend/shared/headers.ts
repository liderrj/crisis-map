import { isValidDeviceId, MAX_ALIAS_LENGTH } from './types.js';

export interface DeviceContext {
  deviceId: string;
  alias?: string;
}

function getHeader(headers: Record<string, string | undefined>, name: string): string | undefined {
  const lower = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === lower) return headers[k];
  }
  return undefined;
}

export function extractDeviceContext(
  headers: Record<string, string | undefined>,
): DeviceContext | null {
  const rawId = getHeader(headers, 'deviceid');
  if (!rawId) return null;
  const deviceId = rawId.trim();
  if (!isValidDeviceId(deviceId)) return null;
  const rawAlias = getHeader(headers, 'alias');
  const alias = rawAlias ? rawAlias.trim().slice(0, MAX_ALIAS_LENGTH) || undefined : undefined;
  return { deviceId, alias };
}

export function jsonResponse(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    },
    body: JSON.stringify(body),
  };
}

export function errorResponse(statusCode: number, message: string, code?: string) {
  return jsonResponse(statusCode, { error: message, code: code ?? message.toLowerCase().replace(/\s+/g, '_') });
}

export function sanitize(value: string, maxLen = 500): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, maxLen).trim();
}
