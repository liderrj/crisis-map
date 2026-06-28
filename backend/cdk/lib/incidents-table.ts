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

    // Bbox queries: PK is a fixed string, SK is the geohash. This makes
    // begins_with() queries possible (O(log n) regardless of bbox size).
    this.table.addGlobalSecondaryIndex({
      indexName: 'geo-index',
      partitionKey: { name: 'gsiPk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'geohash', type: dynamodb.AttributeType.STRING },
    });

    // Old geohash-createdAt-index removed after geo-index migration (Jun 2026).
  }
}