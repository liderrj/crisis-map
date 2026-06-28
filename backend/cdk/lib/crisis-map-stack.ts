import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigateway2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { IncidentsTable } from './incidents-table';
import { ConfirmationsTable } from './confirmations-table';
import { DevicesTable } from './devices-table';
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

    const incidents = new IncidentsTable(this, 'IncidentsTable');
    const confirmations = new ConfirmationsTable(this, 'ConfirmationsTable');
    const devices = new DevicesTable(this, 'DevicesTable');
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
      ],
      resources: [
        incidents.table.tableArn,
        `${incidents.table.tableArn}/index/*`,
        confirmations.table.tableArn,
        devices.table.tableArn,
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

    const healthFn = mkLambda('Health', 'lambdas/health/handler.handler');
    const getIncidentsFn = mkLambda('GetIncidents', 'lambdas/incidents/get-incidents.handler', 60);
    const createIncidentFn = mkLambda('CreateIncident', 'lambdas/incidents/create-incident.handler');
    const confirmationsFn = mkLambda('Confirmations', 'lambdas/confirmations/handler.handler');
    const resourcesFn = mkLambda('Resources', 'lambdas/resources/handler.handler');
    const legendFn = mkLambda('Legend', 'lambdas/legend/handler.handler');
    const syncFn = mkLambda('Sync', 'lambdas/sync/handler.handler');

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

    const route = (method: string, path: string, fn: lambda.Function) => {
      new apigatewayv2.HttpRoute(this, `${method}${path}Route`, {
        httpApi: api.httpApi,
        integration: new apigateway2Integrations.HttpLambdaIntegration(`${method}${path}Integration`, fn),
        routeKey: apigatewayv2.HttpRouteKey.with(path, method as apigatewayv2.HttpMethod),
      });
    };

    route('GET', '/health', healthFn);
    route('GET', '/incidents', getIncidentsFn);
    route('POST', '/incidents', createIncidentFn);
    route('POST', '/confirmations', confirmationsFn);
    route('POST', '/images', imagesFn);
    route('GET', '/images', imagesFn);
    route('GET', '/resources', resourcesFn);
    route('GET', '/legend', legendFn);
    route('POST', '/sync', syncFn);
    route('POST', '/seed', seedFn);

    new cdk.CfnOutput(this, 'ApiUrl', { value: api.url });
    new cdk.CfnOutput(this, 'ImageBucketName', { value: images.bucket.bucketName });
    new cdk.CfnOutput(this, 'ImageCdnUrl', { value: `https://${images.distribution.distributionDomainName}` });
    new cdk.CfnOutput(this, 'TileBucketName', { value: tiles.bucket.bucketName });
    new cdk.CfnOutput(this, 'TileCdnUrl', { value: `https://${tiles.distribution.distributionDomainName}` });
  }
}