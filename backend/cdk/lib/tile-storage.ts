import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { Construct } from 'constructs';

/**
 * Self-hosted OpenStreetMap raster tiles for the offline-first crisis map.
 *
 * Layout in the bucket:
 *   tiles/{z}/{x}/{y}.png
 *
 * Served through CloudFront with Origin Access Control so the bucket
 * stays private. The Angular Service Worker intercepts requests for
 * these tiles and writes them into the Cache API, which is how the
 * "offline map" experience works.
 *
 * The seed script (`backend/scripts/seed-tiles.mjs`) is responsible for
 * populating the bucket. See `apps/web/SELF_HOSTED_TILES.md` for the
 * end-to-end pipeline.
 */
export class TileStorage extends Construct {
  public readonly bucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.bucket = new s3.Bucket(this, 'TileBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      // Tiles are read-only from the public internet via CloudFront,
      // but the SW fetches them with `mode: 'no-cors'` (response is
      // opaque). The browser happily caches the opaque response and
      // later loads the same URL via <img> tags (which don't enforce
      // CORS). We allow GET from any origin so the prefetch fetch
      // works from any deployed frontend URL.
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
          maxAge: 300,
        },
      ],
    });

    this.distribution = new cloudfront.Distribution(this, 'TileCDN', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        // Tiles are public-ish but small. Cache aggressively at the
        // edge; if a region needs an update, bump the cache version
        // in the path (tiles/v2/{z}/{x}/{y}.png) and invalidate.
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        // Long max-age at the edge since tiles don't change once
        // generated. The browser (via the SW) controls its own cache.
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT,
      },
      enabled: true,
      comment: 'CrisisMap self-hosted OSM tiles',
    });
  }
}