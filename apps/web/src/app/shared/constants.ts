export type IncidentType =
  | 'people_trapped' | 'building_collapse' | 'damaged_building' | 'fire' | 'flood'
  | 'road_blocked' | 'bridge_damaged' | 'landslide' | 'gas_leak'
  | 'hospital' | 'shelter' | 'food' | 'water' | 'medicine' | 'electricity' | 'fuel'
  | 'internet' | 'starlink' | 'open_wifi' | 'charging_point' | 'other';

export type IncidentCategory = 'emergency' | 'infrastructure' | 'service_interruption' | 'resource' | 'communications';
export type Severity = 'low' | 'medium' | 'high';
export type IncidentStatus = 'active' | 'resolved';
export type ConfirmationAction = 'confirm' | 'improved' | 'worsened' | 'no_longer_exists';

export interface Location { lat: number; lng: number; }

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
  confidence: number;
  imageCount: number;
}

export const INCIDENT_TYPES: { type: IncidentType; label: string }[] = [
  { type: 'people_trapped', label: 'People trapped' },
  { type: 'building_collapse', label: 'Building collapse' },
  { type: 'damaged_building', label: 'Damaged building' },
  { type: 'fire', label: 'Fire' },
  { type: 'flood', label: 'Flood' },
  { type: 'road_blocked', label: 'Road blocked' },
  { type: 'bridge_damaged', label: 'Bridge damaged' },
  { type: 'landslide', label: 'Landslide' },
  { type: 'gas_leak', label: 'Gas leak' },
  { type: 'hospital', label: 'Hospital' },
  { type: 'shelter', label: 'Shelter' },
  { type: 'food', label: 'Food' },
  { type: 'water', label: 'Water' },
  { type: 'medicine', label: 'Medicine' },
  { type: 'electricity', label: 'Electricity' },
  { type: 'fuel', label: 'Fuel' },
  { type: 'internet', label: 'Internet' },
  { type: 'starlink', label: 'Starlink' },
  { type: 'open_wifi', label: 'Open WiFi' },
  { type: 'charging_point', label: 'Charging Point' },
  { type: 'other', label: 'Other' },
];

export const SEVERITIES: Severity[] = ['low', 'medium', 'high'];

export const CATEGORY_COLOURS: Record<IncidentCategory, string> = {
  emergency: 'red',
  infrastructure: 'orange',
  service_interruption: 'yellow',
  resource: 'green',
  communications: 'blue',
};

export const CATEGORY_LABELS: Record<IncidentCategory, string> = {
  emergency: 'Emergency',
  infrastructure: 'Infrastructure damage',
  service_interruption: 'Service interruption',
  resource: 'Available resource',
  communications: 'Communications',
};

const TYPE_CATEGORY_MAP: Record<IncidentType, IncidentCategory> = {
  people_trapped: 'emergency', building_collapse: 'emergency', damaged_building: 'emergency',
  fire: 'emergency', flood: 'emergency', road_blocked: 'emergency', bridge_damaged: 'emergency',
  landslide: 'emergency', gas_leak: 'emergency', electricity: 'infrastructure', fuel: 'service_interruption',
  hospital: 'resource', shelter: 'resource', food: 'resource', water: 'resource', medicine: 'resource',
  internet: 'communications', starlink: 'communications', open_wifi: 'communications',
  charging_point: 'communications', other: 'emergency',
};

export function categoryForType(type: IncidentType): IncidentCategory {
  return TYPE_CATEGORY_MAP[type] ?? 'emergency';
}

export const MAX_IMAGE_COUNT = 3;
export const MAX_IMAGE_BYTES = 250 * 1024;
export const MAX_IMAGE_DIMENSION = 1280;
export const MAX_DESCRIPTION_LENGTH = 500;
