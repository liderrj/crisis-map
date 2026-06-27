import { IncidentType, IncidentCategory, Severity } from './types.js';

export const INCIDENT_TYPES: IncidentType[] = [
  'people_trapped',
  'building_collapse',
  'damaged_building',
  'fire',
  'flood',
  'road_blocked',
  'bridge_damaged',
  'landslide',
  'hospital',
  'shelter',
  'food',
  'water',
  'medicine',
  'electricity',
  'fuel',
  'internet',
  'starlink',
  'open_wifi',
  'charging_point',
  'other',
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
  people_trapped: 'emergency',
  building_collapse: 'emergency',
  damaged_building: 'emergency',
  fire: 'emergency',
  flood: 'emergency',
  road_blocked: 'emergency',
  bridge_damaged: 'emergency',
  landslide: 'emergency',
  electricity: 'infrastructure',
  fuel: 'service_interruption',
  hospital: 'resource',
  shelter: 'resource',
  food: 'resource',
  water: 'resource',
  medicine: 'resource',
  internet: 'communications',
  starlink: 'communications',
  open_wifi: 'communications',
  charging_point: 'communications',
  other: 'emergency',
};

export function categoryForType(type: IncidentType): IncidentCategory {
  return TYPE_CATEGORY_MAP[type] ?? 'emergency';
}

export function isValidIncidentType(value: string): value is IncidentType {
  return INCIDENT_TYPES.includes(value as IncidentType);
}

export function isValidSeverity(value: string): value is Severity {
  return SEVERITIES.includes(value as Severity);
}

export const LEGEND: { category: IncidentCategory; colour: string; label: string }[] = (
  Object.keys(CATEGORY_COLOURS) as IncidentCategory[]
).map((category) => ({
  category,
  colour: CATEGORY_COLOURS[category],
  label: CATEGORY_LABELS[category],
}));
