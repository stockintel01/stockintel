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
  sigatoka: boolean;
}

export type FarmAreaUnit = 'hectare' | 'acre' | 'square_metre' | 'custom';

export interface SigatokaSentinelPlant {
  id: string;
  code: string;
  status: 'active' | 'retired';
  enrolledAt: string;
  retiredAt?: string;
  retirementReason?: string;
  replacementOf?: string;
}

export interface SigatokaMonitoringPlot {
  id: string;
  name: string;
  sectorName: string;
  status: 'active' | 'retired';
  area: number | null;
  sentinels: SigatokaSentinelPlant[];
}

export interface SigatokaConfiguration {
  enabled: boolean;
  sectorLabel: string;
  plotLabel: string;
  plantLabel: string;
  areaUnit: FarmAreaUnit;
  customAreaUnitName: string;
  customAreaSquareMetres: number;
  samplePlantCount: number;
  initialFerBaseline: number;
  monitoringPlots: SigatokaMonitoringPlot[];
  riskThresholds: {
    watch: number | null;
    high: number | null;
    critical: number | null;
  };
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
  sigatoka: SigatokaConfiguration;
}

export const DEFAULT_SIGATOKA_CONFIGURATION: SigatokaConfiguration = {
  enabled: true,
  sectorLabel: 'Sector',
  plotLabel: 'Plot',
  plantLabel: 'Sentinel plant',
  areaUnit: 'hectare',
  customAreaUnitName: '',
  customAreaSquareMetres: 1,
  samplePlantCount: 10,
  initialFerBaseline: 1.17,
  monitoringPlots: [],
  riskThresholds: { watch: null, high: null, critical: null },
};

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
    sigatoka: true,
  },
  sigatoka: DEFAULT_SIGATOKA_CONFIGURATION,
};

/** Parse human-entered lists without interfering while the user is still typing. */
export function parseAgricultureList(value: string): string[] {
  const seen = new Set<string>();
  return value
    .split(/[,;\n]+/)
    .map(item => item.trim().replace(/\s+/g, ' '))
    .filter(item => {
      if (!item) return false;
      const key = item.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

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
    sigatoka: {
      ...DEFAULT_SIGATOKA_CONFIGURATION,
      ...existing?.sigatoka,
      monitoringPlots: existing?.sigatoka?.monitoringPlots ?? [],
      riskThresholds: {
        ...DEFAULT_SIGATOKA_CONFIGURATION.riskThresholds,
        ...existing?.sigatoka?.riskThresholds,
      },
    },
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
      sigatoka: hasCrop && (existing?.sigatoka?.enabled ?? true),
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
