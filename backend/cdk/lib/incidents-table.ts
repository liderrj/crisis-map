import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface IncidentTableProps extends cdk.StackProps {}

export class IncidentsTable extends Construct {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, _props?: IncidentTableProps) {
    super(scope, id);

    this.table = new dynamodb.Table(this, 'Incidents', {
      partitionKey: { name: 'incidentId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Duplicate-detection: lookup incident by (type, geohash).
    this.table.addGlobalSecondaryIndex({
      indexName: 'type-geohash-index',
      partitionKey: { name: 'type', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'geohash', type: dynamodb.AttributeType.STRING },
    });

    // TEMPORARY: kept during the geo-index-v2 migration. Will be removed
    // once the backfill is complete (see backend/scripts/migrate-gsipk-v2.mjs).
    this.table.addGlobalSecondaryIndex({
      indexName: 'geo-index',
      partitionKey: { name: 'gsiPk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'geohash', type: dynamodb.AttributeType.STRING },
    });

    // Bbox queries: PK = first char of geohash (~32 shards), SK = geohash.
    // Sharding distributes load across partitions instead of one hot partition.
    this.table.addGlobalSecondaryIndex({
      indexName: 'geo-index-v2',
      partitionKey: { name: 'gsiPkV2', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'geohash', type: dynamodb.AttributeType.STRING },
    });

    // Partner API: idempotency on partner-supplied externalId.
    // PK = `${partnerId}#${externalId}` (composite, unique per partner).
    this.table.addGlobalSecondaryIndex({
      indexName: 'external-id-index',
      partitionKey: { name: 'externalKey', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.NUMBER },
    });

    // Partner API: list incidents by source partner.
    this.table.addGlobalSecondaryIndex({
      indexName: 'partner-source-index',
      partitionKey: { name: 'partnerId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.NUMBER },
    });
  }
}