import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

/**
 * Tiny rate-limit counter table. PK is the rate-limit key
 * (`<scope>:<id>:<minuteEpoch>`); the row carries an incrementing
 * counter and a TTL attribute so old windows are reclaimed by DynamoDB
 * without a sweeper.
 */
export class RateLimitsTable extends Construct {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.table = new dynamodb.Table(this, 'RateLimits', {
      partitionKey: { name: 'key', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      // 2 minutes is the upper bound: we only ever look at the
      // current minute's key, so anything older than 2 minutes is
      // safe to GC. The current minute's row has up to ~60s of life
      // after the minute boundary before the next write arrives.
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  }
}