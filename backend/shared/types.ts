export type IncidentType =
  | 'people_trapped'
  | 'building_collapse'
  | 'damaged_building'
  | 'fire'
  | 'flood'
  | 'road_blocked'
  | 'bridge_damaged'
  | 'landslide'
  | 'gas_leak'
  | 'hospital'
  | 'shelter'
  | 'food'
  | 'water'
  | 'medicine'
  | 'electricity'
  | 'fuel'
  | 'internet'
  | 'starlink'
  | 'open_wifi'
  | 'charging_point'
  | 'other';

export type IncidentCategory =
  | 'emergency'
  | 'infrastructure'
  | 'service_interruption'
  | 'resource'
  | 'communications';

export type Severity = 'low' | 'medium' | 'high';

export type IncidentStatus = 'active' | 'resolved';

export type ConfirmationAction =
  | 'confirm'
  | 'improved'
  | 'worsened'
  | 'no_longer_exists';

export interface Location {
  lat: number;
  lng: number;
}

export interface Incident {
  incidentId: string;
  type: IncidentType;
  category: IncidentCategory;
  severity: Severity;
  status: IncidentStatus;
  location: Location;
  geohash: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  creatorAlias?: string;
  creatorDeviceId: string;
  confirmations: number;
  negativeVotes: number;
  imageCount: number;
  /** Partition key for the geo-index-v2 GSI (first char of geohash, ~32 shards). */
  gsiPkV2?: string;
  /**
   * Demo-mode flag. When true, the report is hidden from non-demo users
   * and consumes one slot of the per-device demo quota (Devices.demoIncidentsCreated).
   * Absent / false ⇒ "real" incident visible to everyone.
   */
  isDemo?: boolean;
  /**
   * Provenance tag. "citizen" for app users, "partner:<partnerId>" for
   * external integrations. Absent = legacy citizen incident.
   */
  source?: string;
  /** Set when source starts with "partner:". Identifies the OAuth partner. */
  partnerId?: string;
  /** Partner-supplied idempotency key. */
  externalId?: string;
  /** Composite PK for the external-id-index GSI: `${partnerId}#${externalId}`. */
  externalKey?: string;
  /** Free-form partner-supplied metadata. Echoed back in detail responses. */
  metadata?: Record<string, string | number | boolean>;
}

export interface Confirmation {
  incidentId: string;
  deviceId: string;
  action: ConfirmationAction;
  createdAt: number;
  /** Mirror of the parent incident's isDemo flag. */
  isDemo?: boolean;
}

export interface Device {
  deviceId: string;
  alias?: string;
  createdAt: number;
  lastSeen?: number;
  /** Lifetime count of demo-mode incidents this device has created. Never decremented. */
  demoIncidentsCreated?: number;
}

export interface IncidentCreateInput {
  type: IncidentType;
  severity: Severity;
  location: Location;
  description?: string;
  imageCount: number;
  isDemo?: boolean;
}

export interface ConfidenceResult {
  confirmations: number;
  negativeVotes: number;
  confidence: number;
}

export function computeConfidence(confirmations: number, negativeVotes: number): ConfidenceResult {
  return {
    confirmations,
    negativeVotes,
    confidence: Math.max(0, confirmations - negativeVotes),
  };
}

export const EXPIRATION_WINDOW_SECONDS = 72 * 60 * 60;

export const MAX_IMAGE_COUNT = 3;
export const MAX_IMAGE_BYTES = 250 * 1024;
export const MAX_IMAGE_DIMENSION = 1280;
export const MAX_DESCRIPTION_LENGTH = 500;
export const MAX_ALIAS_LENGTH = 30;
export const MAX_DEVICE_ID_LENGTH = 64;
export const MAX_INCIDENT_ID_LENGTH = 64;
export const DUPLICATE_RADIUS_METERS = 30;
export const DEMO_INCIDENT_LIMIT = 5;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidDeviceId(value: string): boolean {
  return UUID_RE.test(value) && value.length <= MAX_DEVICE_ID_LENGTH;
}

export function isValidIncidentId(value: string): boolean {
  return UUID_RE.test(value) && value.length <= MAX_INCIDENT_ID_LENGTH;
}
