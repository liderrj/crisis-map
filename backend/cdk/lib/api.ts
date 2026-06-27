import * as cdk from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { Construct } from 'constructs';

export class CrisisMapApi extends Construct {
  public readonly httpApi: apigatewayv2.HttpApi;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.httpApi = new apigatewayv2.HttpApi(this, 'HttpApi', {
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [apigatewayv2.CorsHttpMethod.GET, apigatewayv2.CorsHttpMethod.POST, apigatewayv2.CorsHttpMethod.OPTIONS],
        allowHeaders: ['Content-Type', 'deviceId', 'alias'],
      },
    });

    new apigatewayv2.CfnStage(this, 'DefaultStage', {
      apiId: this.httpApi.apiId,
      stageName: '$default',
      autoDeploy: true,
      defaultRouteSettings: {
        throttlingBurstLimit: 200,
        throttlingRateLimit: 100,
      },
    });
  }

  public get url(): string {
    return this.httpApi.apiEndpoint;
  }
}
