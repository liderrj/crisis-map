import * as cdk from 'aws-cdk-lib';
import { CrisisMapStack } from '../lib/crisis-map-stack';

const app = new cdk.App();
new CrisisMapStack(app, 'CrisisMapStack', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
