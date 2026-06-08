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
}

export const DEFAULT_AGRICULTURE_PROFILE: AgricultureProfile = {
  operationTypes: ['crop'],
  cropTypes: [],
  livestockTypes: [],
  farmZones: [],
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
  return profile.operationTypes
    .map(type => type === 'crop' ? 'Crop Production' : type === 'livestock' ? 'Animal Production' : 'Poultry')
    .join(' + ');
}
