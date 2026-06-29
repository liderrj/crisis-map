import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { TABLES, getItem } from '../../shared/db.js';
import {
  DEMO_INCIDENT_LIMIT,
  type Device,
} from '../../shared/types.js';
import { extractDeviceContext, jsonResponse, errorResponse } from '../../shared/headers.js';

/**
 * Returns the demo-mode quota state for the calling device.
 *
 * Used by the frontend `DemoModeService` to render the
 * "Reportes demo: X / 5" counter and disable the Report FAB when the
 * limit is hit.
 *
 * The counter is a lifetime count on the `Devices` table — never
 * decremented — so the limit is enforced across sessions, reloads,
 * and PWA reinstalls (as long as the deviceId stays the same).
 */
export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const device = extractDeviceContext(event.headers as Record<string, string | undefined>);
    if (!device) return errorResponse(400, 'deviceId header is required');

    const existing = await getItem<Device>(TABLES.devices, { deviceId: device.deviceId });
    const used = existing?.demoIncidentsCreated ?? 0;
    const limit = DEMO_INCIDENT_LIMIT;
    return jsonResponse(200, {
      deviceId: device.deviceId,
      demoLimit: limit,
      demoIncidentsCreated: used,
      remaining: Math.max(0, limit - used),
    });
  } catch (err) {
    console.error('Devices quota error:', err);
    return errorResponse(500, 'Internal error');
  }
};
