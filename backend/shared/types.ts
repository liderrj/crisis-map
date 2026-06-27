export type IncidentType =
  | 'people_trapped'
  | 'building_collapse'
  | 'damaged_building'
  | 'fire'
  | 'flood'
  | 'road_blocked'
  | 'bridge_damaged'
  | 'landslide'
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
}

export interface Confirmation {
  incidentId: string;
  deviceId: string;
  action: ConfirmationAction;
  createdAt: number;
}

export interface Device {
  deviceId: string;
  alias?: string;
  createdAt: number;
}

export interface IncidentCreateInput {
  type: IncidentType;
  severity: Severity;
  location: Location;
  description?: string;
  imageCount: number;
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
export const DUPLICATE_RADIUS_METERS = 30;
