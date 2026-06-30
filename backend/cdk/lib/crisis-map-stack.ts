import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigateway2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { IncidentsTable } from './incidents-table';
import { ConfirmationsTable } from './confirmations-table';
import { DevicesTable } from './devices-table';
import { OAuthClientsTable } from './oauth-clients-table';
import { ExternalActionsTable } from './external-actions-table';
import { RateLimitsTable } from './rate-limits-table';
import { ImageStorage } from './image-storage';
import { TileStorage } from './tile-storage';
import { CrisisMapApi } from './api';

export class CrisisMapStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const seedToken = process.env.SEED_TOKEN ?? '';
    if (!seedToken) {
      throw new Error('SEED_TOKEN env var is required to deploy this stack');
    }

    const contactEmail = process.env.CONTACT_EMAIL ?? '';
    if (!contactEmail) {
      throw new Error('CONTACT_EMAIL env var is required to deploy this stack');
    }
    const contactAppPassword = process.env.CONTACT_APP_PASSWORD ?? '';
    if (!contactAppPassword) {
      throw new Error('CONTACT_APP_PASSWORD env var is required to deploy this stack');
    }

    // Partner API JWT signing secret. Stored in SSM Parameter Store
    // (SecureString) so it never lives in the deploy-time env, in the
    // CDK source, or in the CloudFormation template. To rotate: run
    //   aws ssm put-parameter --name "/crisismap/partner-api/jwt-signing-secret" \
    //     --type SecureString --value "<new 32+ char secret>" --overwrite
    // then `cdk deploy` again. Tokens issued with the old secret become
    // invalid as soon as the Lambdas restart.
    const jwtSecretParam = ssm.StringParameter.fromSecureStringParameterAttributes(
      this, 'JwtSigningSecret', { parameterName: '/crisismap/partner-api/jwt-signing-secret' },
    );

    const incidents = new IncidentsTable(this, 'IncidentsTable');
    const confirmations = new ConfirmationsTable(this, 'ConfirmationsTable');
    const devices = new DevicesTable(this, 'DevicesTable');
    const oauthClients = new OAuthClientsTable(this, 'OAuthClientsTable');
    const externalActions = new ExternalActionsTable(this, 'ExternalActionsTable');
    const rateLimits = new RateLimitsTable(this, 'RateLimitsTable');
    const images = new ImageStorage(this, 'ImageStorage');
    const tiles = new TileStorage(this, 'TileStorage');
    const api = new CrisisMapApi(this, 'Api');

    const sharedPolicy = new iam.PolicyStatement({
      actions: [
        'dynamodb:PutItem',
        'dynamodb:GetItem',
        'dynamodb:UpdateItem',
        'dynamodb:Query',
        'dynamodb:Scan',
        'dynamodb:BatchGetItem',
      ],
      resources: [
        incidents.table.tableArn,
        `${incidents.table.tableArn}/index/*`,
        confirmations.table.tableArn,
        devices.table.tableArn,
      ],
    });

    // Partner-API policy: extra tables (OAuthClients read, ExternalActions
    // write, Incidents with the new GSIs). Distinct from the citizen
    // sharedPolicy so we can rotate independently later.
    const partnerPolicy = new iam.PolicyStatement({
      actions: [
        'dynamodb:PutItem',
        'dynamodb:GetItem',
        'dynamodb:UpdateItem',
        'dynamodb:Query',
        'dynamodb:Scan',
        'dynamodb:BatchGetItem',
      ],
      resources: [
        incidents.table.tableArn,
        `${incidents.table.tableArn}/index/*`,
        confirmations.table.tableArn,
        devices.table.tableArn,
        oauthClients.table.tableArn,
        externalActions.table.tableArn,
      ],
    });

    const s3Policy = new iam.PolicyStatement({
      actions: ['s3:PutObject', 's3:GetObject'],
      resources: [`${images.bucket.bucketArn}/*`],
    });

    const s3ListPolicy = new iam.PolicyStatement({
      actions: ['s3:ListBucket'],
      resources: [images.bucket.bucketArn],
    });

const baseEnv = {
      INCIDENTS_TABLE: incidents.table.tableName,
      CONFIRMATIONS_TABLE: confirmations.table.tableName,
      DEVICES_TABLE: devices.table.tableName,
      IMAGE_BUCKET: images.bucket.bucketName,
    };

    // Environment shared only by the Confirmations lambda. The rate-limit
    // table is added to its IAM policy below.
    const confirmationsEnv: Record<string, string> = {
      ...baseEnv,
      RATE_LIMITS_TABLE: rateLimits.table.tableName,
      JWT_SECRET_PARAM: '/crisismap/partner-api/jwt-signing-secret',
    };

    // Policy granting UpdateItem on the rate-limits table for the
    // Confirmations lambda only — other lambdas don't need it.
    const confirmationsRatePolicy = new iam.PolicyStatement({
      actions: ['dynamodb:UpdateItem'],
      resources: [rateLimits.table.tableArn],
    });

    // The JWT secret is NOT in partnerEnv. Instead each partner Lambda
    // gets `grantRead(jwtSecretParam)` and resolves the value at cold
    // start via the SSM GetParameter API. This keeps the secret out of
    // the Lambda's env-var payload (which shows up in plaintext in the
    // AWS console) and lets us rotate the value without redeploying.
    const partnerEnv = {
      ...baseEnv,
      OAUTH_CLIENTS_TABLE: oauthClients.table.tableName,
      EXTERNAL_ACTIONS_TABLE: externalActions.table.tableName,
      JWT_SECRET_PARAM: jwtSecretParam.parameterName,
    };

    const mkLambda = (name: string, handler: string, timeoutSec = 15): lambda.Function => {
      const fn = new lambda.Function(this, name, {
        runtime: lambda.Runtime.NODEJS_20_X,
        architecture: lambda.Architecture.ARM_64,
        timeout: cdk.Duration.seconds(timeoutSec),
        memorySize: 512,
        handler,
        code: lambda.Code.fromAsset('../dist'),
        environment: baseEnv,
      });
      fn.addToRolePolicy(sharedPolicy);
      return fn;
    };

    const mkPartnerLambda = (name: string, handler: string, timeoutSec = 15): lambda.Function => {
      const fn = new lambda.Function(this, name, {
        runtime: lambda.Runtime.NODEJS_20_X,
        architecture: lambda.Architecture.ARM_64,
        timeout: cdk.Duration.seconds(timeoutSec),
        memorySize: 512,
        handler,
        code: lambda.Code.fromAsset('../dist'),
        environment: partnerEnv,
      });
      fn.addToRolePolicy(partnerPolicy);
      return fn;
    };

    const healthFn = mkLambda('Health', 'lambdas/health/handler.handler');
    const getIncidentsFn = mkLambda('GetIncidents', 'lambdas/incidents/get-incidents.handler', 60);
    const devicesFn = mkLambda('Devices', 'lambdas/devices/handler.handler');
    const createIncidentFn = mkLambda('CreateIncident', 'lambdas/incidents/create-incident.handler');
    const confirmationsFn = new lambda.Function(this, 'Confirmations', {
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(15),
      memorySize: 512,
      handler: 'lambdas/confirmations/handler.handler',
      code: lambda.Code.fromAsset('../dist'),
      environment: confirmationsEnv,
    });
    confirmationsFn.addToRolePolicy(sharedPolicy);
    confirmationsFn.addToRolePolicy(confirmationsRatePolicy);

    // Confirmations lambda also derives confirmerHashes from the same
    // SSM secret the partner JWTs use (see shared/confirmer-hash.ts).
    // Granting GetParameter on the parameter ARN (not just the name)
    // lets the lambda cache the value in memory for 5 minutes.
    const jwtSecretParamArn = cdk.Fn.join('', [
      'arn:aws:ssm:',
      this.region,
      ':',
      this.account,
      ':parameter',
      confirmationsEnv.JWT_SECRET_PARAM ?? '/crisismap/partner-api/jwt-signing-secret',
    ]);
    confirmationsFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [jwtSecretParamArn],
    }));
    const resourcesFn = mkLambda('Resources', 'lambdas/resources/handler.handler');
    const legendFn = mkLambda('Legend', 'lambdas/legend/handler.handler');
    const syncFn = mkLambda('Sync', 'lambdas/sync/handler.handler', 30);

    const imagesFn = new lambda.Function(this, 'Images', {
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(15),
      memorySize: 512,
      handler: 'lambdas/images/handler.handler',
      code: lambda.Code.fromAsset('../dist'),
      environment: baseEnv,
    });
    imagesFn.addToRolePolicy(sharedPolicy);
    imagesFn.addToRolePolicy(s3Policy);
    imagesFn.addToRolePolicy(s3ListPolicy);

    const seedFn = new lambda.Function(this, 'Seed', {
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(15),
      memorySize: 512,
      handler: 'lambdas/seed/handler.handler',
      code: lambda.Code.fromAsset('../dist'),
      environment: { ...baseEnv, SEED_TOKEN: seedToken },
    });
    seedFn.addToRolePolicy(sharedPolicy);

    const contactFn = new lambda.Function(this, 'Contact', {
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(15),
      memorySize: 512,
      handler: 'lambdas/contact/handler.handler',
      code: lambda.Code.fromAsset('../dist'),
      environment: { ...baseEnv, CONTACT_EMAIL: contactEmail, CONTACT_APP_PASSWORD: contactAppPassword },
      description: 'v3',
    });

    // Partner API v1 Lambdas. Each one reads the JWT secret from SSM
    // (grantRead attached) rather than receiving it as an env var, so
    // the value never appears in the AWS console and rotates without
    // a redeploy (after the 5 min cache TTL).
    const oauthFn = mkPartnerLambda('OAuth', 'lambdas/oauth/handler.handler');
    const getIncidentsV1Fn = mkPartnerLambda('GetIncidentsV1', 'lambdas/v1/get-incidents.handler', 30);
    const getIncidentV1Fn = mkPartnerLambda('GetIncidentV1', 'lambdas/v1/get-incident.handler');
    const getConfirmationsV1Fn = mkPartnerLambda('GetConfirmationsV1', 'lambdas/v1/get-confirmations.handler');
    const postIncidentV1Fn = mkPartnerLambda('PostIncidentV1', 'lambdas/v1/post-incident.handler', 30);
    const patchIncidentV1Fn = mkPartnerLambda('PatchIncidentV1', 'lambdas/v1/patch-incident.handler');
    const postConfirmationV1Fn = mkPartnerLambda('PostConfirmationV1', 'lambdas/v1/post-confirmation.handler');
    const openapiFn = mkPartnerLambda('OpenapiV1', 'lambdas/v1/openapi.handler');
    for (const fn of [oauthFn, getIncidentsV1Fn, getIncidentV1Fn, getConfirmationsV1Fn, postIncidentV1Fn, patchIncidentV1Fn, postConfirmationV1Fn, openapiFn]) {
      jwtSecretParam.grantRead(fn);
    }

    // Lambdas that rehost images need S3 write access.
    postIncidentV1Fn.addToRolePolicy(s3Policy);

    const route = (method: string, path: string, fn: lambda.Function) => {
      new apigatewayv2.HttpRoute(this, `${method}${path}Route`, {
        httpApi: api.httpApi,
        integration: new apigateway2Integrations.HttpLambdaIntegration(`${method}${path}Integration`, fn),
        routeKey: apigatewayv2.HttpRouteKey.with(path, apigateway2HttpMethod(method)),
      });
    };

    // Citizen API (unchanged).
    route('GET', '/health', healthFn);
    route('GET', '/incidents', getIncidentsFn);
    route('POST', '/incidents', createIncidentFn);
    route('POST', '/confirmations', confirmationsFn);
    route('GET', '/confirmations', confirmationsFn);
    route('POST', '/images', imagesFn);
    route('GET', '/images', imagesFn);
    route('GET', '/devices/quota', devicesFn);
    route('GET', '/resources', resourcesFn);
    route('GET', '/legend', legendFn);
    route('POST', '/sync', syncFn);
    route('POST', '/seed', seedFn);
    route('POST', '/contact', contactFn);

    // Partner API v1.
    route('POST', '/v1/oauth/token', oauthFn);
    route('GET', '/v1/incidents', getIncidentsV1Fn);
    route('GET', '/v1/incidents/{id}', getIncidentV1Fn);
    route('GET', '/v1/incidents/{id}/confirmations', getConfirmationsV1Fn);
    route('POST', '/v1/incidents', postIncidentV1Fn);
    route('PATCH', '/v1/incidents/{id}', patchIncidentV1Fn);
    route('POST', '/v1/incidents/{id}/confirmations', postConfirmationV1Fn);
    route('GET', '/v1/openapi.json', openapiFn);
    route('GET', '/v1/docs', openapiFn);

    new cdk.CfnOutput(this, 'ApiUrl', { value: api.url });
    new cdk.CfnOutput(this, 'ImageBucketName', { value: images.bucket.bucketName });
    new cdk.CfnOutput(this, 'ImageCdnUrl', { value: `https://${images.distribution.distributionDomainName}` });
    new cdk.CfnOutput(this, 'TileBucketName', { value: tiles.bucket.bucketName });
    new cdk.CfnOutput(this, 'TileCdnUrl', { value: `https://${tiles.distribution.distributionDomainName}` });
  }
}

// Local helper to keep the call sites tidy and type-checked.
function apigateway2HttpMethod(m: string): apigatewayv2.HttpMethod {
  switch (m) {
    case 'GET': return apigatewayv2.HttpMethod.GET;
    case 'POST': return apigatewayv2.HttpMethod.POST;
    case 'PUT': return apigatewayv2.HttpMethod.PUT;
    case 'PATCH': return apigatewayv2.HttpMethod.PATCH;
    case 'DELETE': return apigatewayv2.HttpMethod.DELETE;
    default: throw new Error(`Unsupported method: ${m}`);
  }
}
