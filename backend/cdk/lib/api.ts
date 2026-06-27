import * as cdk from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { Construct } from 'constructs';

export class CrisisMapApi extends Construct {
  public readonly httpApi: apigatewayv2.HttpApi;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.httpApi = new apigatewayv2.HttpApi(this, 'HttpApi', {
      createDefaultStage: false,
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [apigatewayv2.CorsHttpMethod.GET, apigatewayv2.CorsHttpMethod.POST, apigatewayv2.CorsHttpMethod.OPTIONS],
        allowHeaders: ['Content-Type', 'deviceId', 'alias'],
      },
    });

    this.httpApi.addStage('$default', {
      autoDeploy: true,
      throttle: { rateLimit: 100, burstLimit: 200 },
      stageVariables: { timeoutInMillis: '60000' },
    });
  }

  public get url(): string {
    return this.httpApi.apiEndpoint;
  }
}
