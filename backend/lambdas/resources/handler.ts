import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { jsonResponse } from '../../shared/headers.js';
import { INCIDENT_TYPES, SEVERITIES, CATEGORY_COLOURS, CATEGORY_LABELS, LEGEND } from '../../shared/constants.js';
import type { IncidentCategory } from '../../shared/types.js';

export const handler = async (_event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const { categoryForType } = await import('../../shared/constants.js');
  return jsonResponse(200, {
    types: INCIDENT_TYPES.map((type) => ({
      type,
      category: categoryForType(type),
      colour: CATEGORY_COLOURS[categoryForType(type)],
    })),
    severities: SEVERITIES,
    categories: (Object.keys(CATEGORY_COLOURS) as IncidentCategory[]).map((category) => ({
      category,
      colour: CATEGORY_COLOURS[category],
      label: CATEGORY_LABELS[category],
    })),
    legend: LEGEND,
  });
};
