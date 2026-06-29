import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const path = event.rawPath ?? '';
    if (path.endsWith('/v1/docs')) {
      const html = await readFile(swaggerUiPath(), 'utf8');
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
        },
        body: html,
      };
    }
    // Default to openapi.json. The file is YAML but the endpoint name
    // stays as /v1/openapi.json for stable client integrations. We
    // advertise it as application/yaml so the Strict-Transport-Security
    // sniff policy and the partner's HTTP client get the real format.
    const yaml = await readFile(openapiPath(), 'utf8');
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/yaml; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'public, max-age=300',
      },
      body: yaml,
    };
  } catch (e) {
    console.error('openapi handler error:', e);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal error' }),
    };
  }
};

/**
 * Resolves the openapi-v1.yaml path. CDK bundles `dist/` from the
 * project root, so the file lives one level above `dist/`.
 */
function openapiPath(): string {
  // The Lambda's CWD is /var/task. The TS source lives at
  // backend/docs/openapi-v1.yaml; tsc does not copy it. We bundle it
  // into dist/docs/ via the CDK asset path. See the stack's
  // `Code.fromAsset('../dist')` plus the docs copy step.
  return join(process.cwd(), 'docs', 'openapi-v1.yaml');
}

function swaggerUiPath(): string {
  return join(process.cwd(), 'docs', 'swagger-ui', 'index.html');
}
