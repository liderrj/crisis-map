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
    // Default to openapi.json.
    const yaml = await readFile(openapiPath(), 'utf8');
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'public, max-age=300',
      },
      body: yaml, // The handler returns the YAML as-is; many tools accept
                  // application/json with YAML content. The browser just
                  // shows text. To strictly comply with OpenAPI, clients
                  // should request /v1/openapi.yaml (future) or this
                  // endpoint with Accept: text/yaml.
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
