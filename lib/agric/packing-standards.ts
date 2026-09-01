import type { PackingCommodityStandard, PackingMarket, PackingQualityConfig } from './types';

const FRESH_PRODUCE_CHECKS = [
  'Produce is sound, clean, practically free from pests, pest damage, abnormal moisture and foreign smell or taste.',
  'The lot is sufficiently developed and in a condition that can withstand transport and arrive in satisfactory condition.',
  'Package contents are uniform and the visible contents represent the whole package.',
  'Food-contact packaging is clean, suitable and protects the produce from damage and contamination.',
  'The package identifies the packer or dispatcher, produce, origin, commercial specification and lot.',
  'Destination-country legal, phytosanitary and customer requirements have been checked for this order.',
];

export const BUILT_IN_PACKING_STANDARDS: PackingCommodityStandard[] = [
  {
    id: 'codex-banana-cxs-205-1997',
    name: 'Codex banana export standard',
    commodity: 'Banana',
    market: 'export',
    destinationCountries: [],
    authority: 'Codex Alimentarius Commission',
    reference: 'CXS 205-1997',
    version: 'Revised 2022',
    sourceUrl: 'https://www.fao.org/fao-who-codexalimentarius/sh-proxy/hu/?lnk=1&url=https%253A%252F%252Fworkspace.fao.org%252Fsites%252Fcodex%252FStandards%252FCXS%2B205-1997%252FCXS_205e.pdf',
    packageTypes: ['Export carton', 'Food-grade crate'],
    packageSizes: ['Customer specification', 'Net weight specification'],
    grades: [
      { name: 'Extra Class', description: 'Superior quality with only very slight superficial defects.', acceptanceCriteria: ['Fruit is characteristic of the variety or commercial type.', 'Only very slight superficial defects are present.', 'Quality tolerance does not exceed 5% by number or weight.'] },
      { name: 'Class I', description: 'Good quality with limited slight shape, colour or superficial skin defects.', acceptanceCriteria: ['Defects do not affect the flesh.', 'Superficial skin defects do not exceed 2 cm2 of surface area.', 'Quality tolerance does not exceed 10% by number or weight.'] },
      { name: 'Class II', description: 'Marketable quality meeting minimum requirements with permitted defects.', acceptanceCriteria: ['Defects do not affect the flesh.', 'Permitted skin defects do not exceed 4 cm2 of surface area.', 'Produce affected by rot or deterioration making it unfit is excluded.'] },
    ],
    rejectionReasons: ['Rot or deterioration', 'Pest damage', 'Flesh affected', 'Below required size', 'Excess skin defects', 'Incorrect maturity', 'Mixed origin or variety', 'Package or label nonconformance', 'Contamination', 'Customer specification failure'],
    requiredChecks: [...FRESH_PRODUCE_CHECKS, 'For Gros Michel and Cavendish subgroups, reference fingers meet the 14 cm minimum length and 2.7 cm minimum diameter unless an applicable destination rule is stricter.', 'Size tolerance does not exceed 10% by number or weight in the immediately adjacent size.'],
    isActive: true,
  },
  {
    id: 'codex-okra-cxs-318-2014',
    name: 'Codex okra export standard',
    commodity: 'Okra',
    market: 'export',
    destinationCountries: [],
    authority: 'Codex Alimentarius Commission',
    reference: 'CXS 318-2014',
    version: '2014',
    sourceUrl: 'https://www.fao.org/input/download/standards/13806/CXS_318e_2014.pdf',
    packageTypes: ['Export carton', 'Food-grade crate', 'Retail pack'],
    packageSizes: ['Size code 1: 2-4 cm', 'Size code 2: >4-6 cm', 'Size code 3: >6-8 cm', 'Size code 4: >8-10 cm', 'Size code 5: >10 cm', 'Customer specification'],
    grades: [
      { name: 'Extra Class', description: 'Superior quality okra with only very slight superficial defects.', acceptanceCriteria: ['Produce is characteristic of the variety or commercial type.', 'Only very slight superficial defects are present.', 'Quality tolerance does not exceed 5% by number or weight.'] },
      { name: 'Class I', description: 'Good quality okra with only limited defects permitted by the standard.', acceptanceCriteria: ['Permitted defects do not affect general appearance, keeping quality or presentation.', 'Quality tolerance does not exceed 10% by number or weight.'] },
      { name: 'Class II', description: 'Marketable okra satisfying minimum requirements with permitted defects.', acceptanceCriteria: ['Produce affected by rot, marked bruising or deterioration making it unfit is excluded.', 'Quality tolerance does not exceed 10% by number or weight.'] },
    ],
    rejectionReasons: ['Rot or deterioration', 'Marked bruising', 'Pest damage', 'Fibrous or over-mature', 'Below customer size', 'Mixed variety or origin', 'Package or label nonconformance', 'Contamination', 'Customer specification failure'],
    requiredChecks: [...FRESH_PRODUCE_CHECKS, 'When size grading is declared, length is measured without the peduncle and matches the selected size code.', 'Size tolerance does not exceed 10% by number in the immediately adjacent size.'],
    isActive: true,
  },
];

const normalized = (value?: string) => (value ?? '').trim().toLocaleLowerCase();

export function packingStandardCatalog(config: PackingQualityConfig | null): PackingCommodityStandard[] {
  const configured = (config?.commodityStandards ?? []).filter(standard => standard.isActive);
  const configuredIds = new Set(configured.map(standard => standard.id));
  return [...configured, ...BUILT_IN_PACKING_STANDARDS.filter(standard => !configuredIds.has(standard.id))];
}

export function matchingPackingStandards(
  config: PackingQualityConfig | null,
  commodity: string,
  market: PackingMarket,
  destinationCountry?: string,
): PackingCommodityStandard[] {
  const country = normalized(destinationCountry);
  const candidates = packingStandardCatalog(config)
    .filter(standard => normalized(standard.commodity) === normalized(commodity) && standard.market === market)
    .filter(standard => !standard.destinationCountries.length || standard.destinationCountries.some(item => normalized(item) === country));
  const destinationSpecific = candidates.filter(standard => standard.destinationCountries.length);
  return (destinationSpecific.length ? destinationSpecific : candidates).sort((left, right) => left.name.localeCompare(right.name));
}

export function packingMarketLabel(market?: PackingMarket): string {
  return market === 'export' ? 'Export market' : market === 'local' ? 'Local market' : 'Legacy market record';
}

export function standardGradeNames(standard: PackingCommodityStandard): string[] {
  return standard.grades.map(grade => grade.name);
}
