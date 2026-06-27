export interface DeviceContext {
  deviceId: string;
  alias?: string;
}

export function extractDeviceContext(
  headers: Record<string, string | undefined>,
): DeviceContext | null {
  const deviceId = headers['deviceId'] ?? headers['deviceid'];
  if (!deviceId || deviceId.trim() === '') return null;
  const alias = headers['alias'];
  return { deviceId: deviceId.trim(), alias: alias?.trim() || undefined };
}

export function jsonResponse(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export function errorResponse(statusCode: number, message: string, code?: string) {
  return jsonResponse(statusCode, { error: message, code: code ?? message.toLowerCase().replace(/\s+/g, '_') });
}
