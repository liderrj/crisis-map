import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { withPartnerAuth, jsonResponse, errorResponse, hasScope } from '../../shared/auth.js';
import { BadRequest, listIncidents, parseFilters } from '../../shared/geo-query.js';
import { categoryForType } from '../../shared/constants.js';
import { computeConfidence, type Incident } from '../../shared/types.js';

export const handler = withPartnerAuth(
  async (event, auth): Promise<APIGatewayProxyResultV2> => {
    try {
      const qs = (event.queryStringParameters ?? {}) as Record<string, string | undefined>;
      const filters = parseFilters(qs);

      // Scope: read is required. Without `incidents:read` the withPartnerAuth
      // wrapper has already 403'd.
      const result = await listIncidents(filters);

      // Enrich with category and confidence (mirrors the citizen endpoint).
      const enriched = result.incidents.map(enrich);

      // `nextToken` is omitted for now (v1 returns the full page in one
      // shot up to the limit; partner-side paging by since/until is the
      // documented pattern until a stable cursor exists).
      return jsonResponse(200, {
        data: enriched,
        count: enriched.length,
        partner: { id: auth.partnerId, scope: hasScope(auth, 'incidents:write') ? 'write' : 'read' },
      });
    } catch (e) {
      if (e instanceof BadRequest) return errorResponse(400, e.message, 'bad_request');
      console.error('get-incidents-v1 error:', e);
      return errorResponse(500, 'Internal error');
    }
  },
  'incidents:read',
);

function enrich(i: Incident): Incident & { category: Incident['category']; confidence: number } {
  return {
    ...i,
    category: i.category ?? categoryForType(i.type),
    ...computeConfidence(i.confirmations, i.negativeVotes),
  };
}
