export type AgricultureOperation = 'crop' | 'livestock' | 'poultry';

export interface FarmLocation {
  name: string;
  latitude: number;
  longitude: number;
  timezone?: string;
}

export interface AgricultureModules {
  crops: boolean;
  livestock: boolean;
  poultry: boolean;
  eggProduction: boolean;
  dairy: boolean;
  sprayPlanner: boolean;
  packing: boolean;
  equipment: boolean;
  weather: boolean;
  reports: boolean;
}

export interface AgricultureProfile {
  operationTypes: AgricultureOperation[];
  cropTypes: string[];
  livestockTypes: string[];
  farmZones: string[];
  modules: AgricultureModules;
  location?: FarmLocation;
  locations: FarmLocation[];
  weekStartsOn: number;
}

export const DEFAULT_AGRICULTURE_PROFILE: AgricultureProfile = {
  operationTypes: ['crop'],
  cropTypes: [],
  livestockTypes: [],
  farmZones: [],
  locations: [],
  weekStartsOn: 0,
  modules: {
    crops: true,
    livestock: false,
    poultry: false,
    eggProduction: false,
    dairy: false,
    sprayPlanner: true,
    packing: true,
    equipment: true,
    weather: true,
    reports: true,
  },
};

export function buildAgricultureProfile(
  operations: AgricultureOperation[],
  existing?: Partial<AgricultureProfile>,
): AgricultureProfile {
  const selected: AgricultureOperation[] = operations.length ? operations : ['crop'];
  const hasCrop = selected.includes('crop');
  const hasLivestock = selected.includes('livestock');
  const hasPoultry = selected.includes('poultry');

  return {
    ...DEFAULT_AGRICULTURE_PROFILE,
    ...existing,
    operationTypes: selected,
    cropTypes: existing?.cropTypes ?? [],
    livestockTypes: existing?.livestockTypes ?? [],
    farmZones: existing?.farmZones ?? [],
    locations: existing?.locations ?? (existing?.location ? [existing.location] : []),
    weekStartsOn: existing?.weekStartsOn ?? 0,
    modules: {
      ...DEFAULT_AGRICULTURE_PROFILE.modules,
      ...existing?.modules,
      crops: hasCrop,
      livestock: hasLivestock || hasPoultry,
      poultry: hasPoultry,
      eggProduction: hasPoultry,
      dairy: hasLivestock,
      sprayPlanner: hasCrop,
      packing: hasCrop,
    },
  };
}

export function getAgricultureProfile(settings?: Record<string, unknown>): AgricultureProfile {
  const saved = settings?.agriculture as Partial<AgricultureProfile> | undefined;
  return buildAgricultureProfile(saved?.operationTypes ?? ['crop'], saved);
}

export function agricultureProfileLabel(profile: AgricultureProfile): string {
  const operations = profile.operationTypes;
  if (operations.length > 1) {
    if (!operations.includes('crop') && operations.includes('livestock') && operations.includes('poultry')) return 'Livestock & Poultry';
    return 'Integrated Farm';
  }
  if (operations[0] === 'livestock') return 'Livestock Farm';
  if (operations[0] === 'poultry') return 'Poultry Farm';
  return 'Crop Farm';
}
