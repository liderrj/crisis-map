import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { jsonResponse } from '../../shared/headers.js';
import { LEGEND } from '../../shared/constants.js';

export const handler = async (_event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  return jsonResponse(200, {
    legend: LEGEND.map((l) => ({ colour: l.colour, label: l.label })),
  });
};
