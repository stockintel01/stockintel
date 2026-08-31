'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Archive,
  Bug,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  Download,
  Droplets,
  FileSpreadsheet,
  FlaskConical,
  Leaf,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
  Wifi,
  Upload,
} from 'lucide-react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getAgricultureProfile } from '@/lib/agric/config';
import { getFarmWeek } from '@/lib/agric/week';
import {
  calculateSigatokaMetrics,
  aggregateSigatokaSessions,
  diseaseClassLabel,
  generateSigatokaDecisionAlerts,
  validateSigatokaPlants,
  type SigatokaLeafScore,
  type SigatokaPlantObservation,
  type SigatokaSessionRecord,
} from '@/lib/agric/sigatoka';
import { createSigatokaImportTemplateCsv, parseSigatokaImport } from '@/lib/agric/sigatoka-import';
import { downloadSigatokaFieldWorkbook, printSigatokaFieldReport } from '@/lib/agric/sigatoka-field-report';
import { useAgric } from '@/lib/agric/useAgric';
import {
  addSigatokaSession,
  addSigatokaSessions,
  archiveSigatokaSessions,
  permanentlyDeleteExpiredSigatokaSession,
  restoreSigatokaSession,
  SIGATOKA_ARCHIVE_DAYS,
  subscribeSigatokaSessions,
  updateSigatokaSession,
  updateSigatokaSessionStatus,
} from '@/lib/agric/sigatoka-service';
import { useAppStore } from '@/lib/store';
import { exportToCSV, exportToPDF } from '@/lib/export';
import { userHasAccess } from '@/lib/access-permissions';

const AREA_FACTORS = { hectare: 10000, acre: 4046.8564224, square_metre: 1 } as const;
type ReportPeriod = 'all' | 'week' | 'month' | 'year' | 'custom';

function emptyPlants(count: number, sentinels: Array<{ id: string; code: string }> = []): SigatokaPlantObservation[] {
  return Array.from({ length: count }, (_, index) => ({
    plantNumber: index + 1,
    sentinelPlantId: sentinels[index]?.id,
    sentinelPlantCode: sentinels[index]?.code,
    previousLeafReading: 0,
    currentLeafReading: 0,
    leaf2: null,
    leaf3: null,
    leaf4: null,
    youngestInfestedLeaf: null,
    youngestNecroticLeaf: null,
    leavesAtFlowering: null,
    leavesAtHarvest: null,
    notes: '',
  }));
}

function optionalNumber(value: string): number | null {
  return value === '' ? null : Number(value);
}

function daysBetween(startDate: string, endDate: string): number {
  return Math.max(1, Math.round((new Date(`${endDate}T12:00:00`).getTime() - new Date(`${startDate}T12:00:00`).getTime()) / 86400000));
}

function archiveExpiry(session: SigatokaSessionRecord): Date | null {
  const timestamp = session.expireAt as { toDate?: () => Date } | undefined;
  if (typeof timestamp?.toDate === 'function') return timestamp.toDate();
  if (session.archivedAtIso) {
    const date = new Date(session.archivedAtIso);
    if (!Number.isNaN(date.getTime())) {
      date.setUTCDate(date.getUTCDate() + SIGATOKA_ARCHIVE_DAYS);
      return date;
    }
  }
  return null;
}

function ScoreSelect({ value, onChange, label }: { value: SigatokaLeafScore | null; onChange: (score: SigatokaLeafScore | null) => void; label: string }) {
  const serialized = value ? `${value.stage}-${value.density}` : '';
  return <div className="space-y-1.5"><Label>{label}</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={serialized} onChange={event => {
    if (!event.target.value) return onChange(null);
    const [stage, density] = event.target.value.split('-');
    onChange({ stage: Number(stage) as SigatokaLeafScore['stage'], density: density as SigatokaLeafScore['density'] });
  }}><option value="">No symptoms</option>{[1, 2, 3, 4, 5, 6].flatMap(stage => [<option key={`${stage}-low`} value={`${stage}-low`}>{stage}- (under 50 lesions)</option>, <option key={`${stage}-high`} value={`${stage}-high`}>{stage}+ (over 50 lesions)</option>])}</select></div>;
}

function metric(value: number | null | undefined, decimals = 1): string {
  return value === null || value === undefined || !Number.isFinite(value) ? 'Not recorded' : value.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

export default function SigatokaPage() {
  const { organization, user } = useAppStore();
  const profile = getAgricultureProfile(organization?.settings);
  const config = profile.sigatoka;
  const fieldReportOptions = {
    organizationName: organization?.name ?? 'Farm organization',
    sectorLabel: config.sectorLabel,
    plotLabel: config.plotLabel,
    plantLabel: config.plantLabel,
    riskThresholds: config.riskThresholds,
  };
  const canRecord = userHasAccess(user, 'agricSigatoka');
  const canManage = canRecord && ['owner', 'manager', 'super_admin'].includes(user?.role ?? '');
  const { plans } = useAgric();
  const [sessions, setSessions] = useState<SigatokaSessionRecord[]>([]);
  const [archivedSessions, setArchivedSessions] = useState<SigatokaSessionRecord[]>([]);
  const [showObservation, setShowObservation] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState('');
  const [currentPlant, setCurrentPlant] = useState(0);
  const [plants, setPlants] = useState(() => emptyPlants(config.samplePlantCount));
  const [sectorName, setSectorName] = useState(profile.location?.name ?? 'Main Farm');
  const [plotName, setPlotName] = useState(profile.farmZones[0] ?? '');
  const [plotArea, setPlotArea] = useState('');
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const [observedAt, setObservedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [intervalDays, setIntervalDays] = useState(7);
  const [meanRawFerOverride, setMeanRawFerOverride] = useState('');
  const [notes, setNotes] = useState('');
  const [rainfallMm, setRainfallMm] = useState('');
  const [treatmentApplied, setTreatmentApplied] = useState(false);
  const [treatmentDate, setTreatmentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [treatmentProduct, setTreatmentProduct] = useState('');
  const [treatmentActiveIngredient, setTreatmentActiveIngredient] = useState('');
  const [treatmentDose, setTreatmentDose] = useState('');
  const [treatmentMethod, setTreatmentMethod] = useState('');
  const [reportPlot, setReportPlot] = useState('all');
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>('all');
  const [reportYear, setReportYear] = useState(() => new Date().getFullYear());
  const [reportWeek, setReportWeek] = useState(() => getFarmWeek(new Date().toISOString().slice(0, 10), profile.weekStartsOn).week);
  const [reportMonth, setReportMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [reportStartDate, setReportStartDate] = useState(() => `${new Date().getFullYear()}-01-01`);
  const [reportEndDate, setReportEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [showArchive, setShowArchive] = useState(false);
  const [archiveSelectionIds, setArchiveSelectionIds] = useState<string[]>([]);
  const [archiveScope, setArchiveScope] = useState('');
  const [archiveConfirmation, setArchiveConfirmation] = useState('');
  const [archiveReason, setArchiveReason] = useState('');
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [loadError, setLoadError] = useState('');
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [pendingWrites, setPendingWrites] = useState(false);
  const [importing, setImporting] = useState(false);
  const [loadingRainfall, setLoadingRainfall] = useState(false);
  const [importIssues, setImportIssues] = useState<string[]>([]);

  useEffect(() => {
    if (!organization?.id) return;
    return subscribeSigatokaSessions(organization.id, (records, pending) => {
      setSessions(records.filter(record => !record.archivedAt && !record.archivedAtIso));
      setArchivedSessions(records.filter(record => Boolean(record.archivedAt || record.archivedAtIso)));
      setPendingWrites(pending);
      setLoadError('');
    }, () => setLoadError('Disease scouting records could not be loaded. Check access permissions and connectivity.'));
  }, [organization?.id]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);

  const previousSession = useMemo(() => sessions
    .filter(session => session.plotName.toLowerCase() === plotName.trim().toLowerCase() && session.status !== 'draft' && session.observedAt < observedAt)
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0], [observedAt, plotName, sessions]);
  const editingSession = sessions.find(session => session.id === editingSessionId);
  const previousFinalFer = editingSession?.metrics.previousFinalFer ?? previousSession?.metrics.finalFer ?? config.initialFerBaseline;
  const metrics = useMemo(() => {
    try { return calculateSigatokaMetrics(plants, intervalDays, previousFinalFer, optionalNumber(meanRawFerOverride)); } catch { return null; }
  }, [intervalDays, meanRawFerOverride, plants, previousFinalFer]);
  const validation = useMemo(() => validateSigatokaPlants(plants, previousSession?.plants, optionalNumber(meanRawFerOverride)), [meanRawFerOverride, plants, previousSession?.plants]);
  const decisionAlerts = useMemo(() => generateSigatokaDecisionAlerts(sessions, config.riskThresholds), [config.riskThresholds, sessions]);
  const matchingPlanApplications = useMemo(() => plans
    .filter(plan => !plotName || String(plan.farmZone).toLowerCase() === plotName.toLowerCase())
    .flatMap(plan => (plan.applicationHistory ?? []).map(application => ({ plan, application })))
    .sort((a, b) => b.application.appliedAt.localeCompare(a.application.appliedAt)), [plans, plotName]);
  const completedPlants = plants.filter(plant => plant.previousLeafReading > 0 && plant.currentLeafReading > 0).length;
  const farmWeek = getFarmWeek(observedAt, profile.weekStartsOn);
  const availableYears = useMemo(() => Array.from(new Set([new Date().getFullYear(), ...sessions.map(session => session.monitoringYear)])).sort((a, b) => b - a), [sessions]);
  const filteredActiveSessions = useMemo(() => sessions.filter(session => {
    if (reportPlot !== 'all' && session.plotName !== reportPlot) return false;
    if (reportPeriod === 'week') return session.monitoringYear === reportYear && session.monitoringWeek === reportWeek;
    if (reportPeriod === 'month') return session.observedAt.slice(0, 7) === reportMonth;
    if (reportPeriod === 'year') return session.monitoringYear === reportYear;
    if (reportPeriod === 'custom') return (!reportStartDate || session.observedAt >= reportStartDate) && (!reportEndDate || session.observedAt <= reportEndDate);
    return true;
  }), [reportEndDate, reportMonth, reportPeriod, reportPlot, reportStartDate, reportWeek, reportYear, sessions]);
  const reportSessions = useMemo(() => filteredActiveSessions.filter(session => session.status !== 'draft'), [filteredActiveSessions]);
  const reportRangeLabel = reportPeriod === 'week' ? `${reportYear} week ${reportWeek}`
    : reportPeriod === 'month' ? new Date(`${reportMonth}-01T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      : reportPeriod === 'year' ? String(reportYear)
        : reportPeriod === 'custom' ? `${reportStartDate || 'First record'} to ${reportEndDate || 'Latest record'}`
          : 'All dates';
  const weeklySummaries = useMemo(() => aggregateSigatokaSessions(reportSessions), [reportSessions]);
  const chartData = weeklySummaries.slice(-16).map(summary => ({
    week: `W${summary.week}`,
    sed: Math.round(summary.sedMean),
    sedMin: Math.round(summary.sedMin),
    sedMax: Math.round(summary.sedMax),
    rainfall: summary.rainfallMm,
    yil: summary.averageYil,
    ynl: summary.averageYnl,
    nlf: summary.averageNlf,
    nlh: summary.averageNlh,
  }));
  const latestReport = reportSessions[0];
  const myDrafts = sessions.filter(session => session.status === 'draft' && session.observerId === user?.id);
  const recoverableArchivedSessions = canManage ? archivedSessions : archivedSessions.filter(session => session.observerId === user?.id && session.status !== 'verified');
  const recentWeeks = weeklySummaries.slice(-6);
  const activeMonitoringPlots = config.monitoringPlots.filter(plot => plot.status === 'active');
  const selectedPlant = plants[currentPlant];
  const selectedRegisteredPlot = activeMonitoringPlots.find(plot => plot.name.toLowerCase() === plotName.trim().toLowerCase());
  const selectedSentinel = selectedRegisteredPlot?.sentinels.find(sentinel => sentinel.id === selectedPlant?.sentinelPlantId);
  const carriedFromPlant = previousSession && selectedPlant
    ? previousSession.plants.find(plant => plant.sentinelPlantId && plant.sentinelPlantId === selectedPlant.sentinelPlantId)
      ?? (!selectedSentinel?.replacementOf ? previousSession.plants.find(plant => plant.plantNumber === selectedPlant.plantNumber) : undefined)
    : undefined;
  const knownPlots = Array.from(new Set([...activeMonitoringPlots.map(plot => plot.name), ...profile.farmZones, ...sessions.map(session => session.plotName)].filter(Boolean))).sort();
  const reportPlots = reportPlot === 'all' ? knownPlots : knownPlots.filter(plot => plot === reportPlot);
  const filteredReportCoverage = new Set(reportSessions.map(session => session.plotName)).size;
  const harvestChartData = weeklySummaries.slice(-12).map(summary => {
    const counted = summary.harvestDistribution.counted;
    return {
      week: `W${summary.week}`,
      under3: counted ? summary.harvestDistribution.under3 / counted * 100 : 0,
      from3To5: counted ? summary.harvestDistribution.from3To5 / counted * 100 : 0,
      over5: counted ? summary.harvestDistribution.over5 / counted * 100 : 0,
    };
  });

  const areaLabel = config.areaUnit === 'custom' ? config.customAreaUnitName || 'custom unit' : config.areaUnit === 'square_metre' ? 'm2' : config.areaUnit === 'hectare' ? 'ha' : 'ac';
  const squareMetresPerUnit = config.areaUnit === 'custom' ? config.customAreaSquareMetres : AREA_FACTORS[config.areaUnit];

  function plantsForObservation(name: string, date: string): SigatokaPlantObservation[] {
    const registered = activeMonitoringPlots.find(plot => plot.name.toLowerCase() === name.trim().toLowerCase());
    const activeSentinels = registered?.sentinels.filter(plant => plant.status === 'active') ?? [];
    const freshPlants = emptyPlants(config.samplePlantCount, activeSentinels);
    const prior = sessions
      .filter(session => session.plotName.toLowerCase() === name.trim().toLowerCase() && session.status !== 'draft' && session.observedAt < date)
      .sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0];
    if (!prior) return freshPlants;

    return freshPlants.map(plant => {
      const registeredSentinel = activeSentinels.find(sentinel => sentinel.id === plant.sentinelPlantId);
      const byPermanentId = plant.sentinelPlantId ? prior.plants.find(previous => previous.sentinelPlantId === plant.sentinelPlantId) : undefined;
      const byLegacyPosition = !registeredSentinel?.replacementOf ? prior.plants.find(previous => previous.plantNumber === plant.plantNumber) : undefined;
      const previousPlant = byPermanentId ?? byLegacyPosition;
      return previousPlant ? { ...plant, previousLeafReading: previousPlant.currentLeafReading } : plant;
    });
  }

  function setObservationContext(name: string, date: string) {
    const prior = sessions
      .filter(session => session.plotName.toLowerCase() === name.trim().toLowerCase() && session.status !== 'draft' && session.observedAt < date)
      .sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0];
    setPlants(plantsForObservation(name, date));
    setIntervalDays(prior ? daysBetween(prior.observedAt, date) : 7);
    setCurrentPlant(0);
  }

  function updatePlant(fields: Partial<SigatokaPlantObservation>) {
    setPlants(current => current.map((plant, index) => index === currentPlant ? { ...plant, ...fields } : plant));
  }

  function resetObservationForm() {
    setEditingSessionId('');
    setObservedAt(today);
    setObservationContext(plotName, today);
    setNotes('');
    setMeanRawFerOverride('');
    setRainfallMm('');
    setTreatmentApplied(false);
    setTreatmentDate(today);
    setTreatmentProduct('');
    setTreatmentActiveIngredient('');
    setTreatmentDose('');
    setTreatmentMethod('');
  }

  function applyRegisteredPlot(name: string) {
    const registered = activeMonitoringPlots.find(plot => plot.name.toLowerCase() === name.trim().toLowerCase());
    if (!name.trim() || editingSessionId) return;
    if (registered) {
      setSectorName(registered.sectorName);
      setPlotArea(registered.area === null ? '' : String(registered.area));
    }
    setObservationContext(name, observedAt);
  }

  async function fillRainfallFromWeather() {
    const location = profile.location ?? profile.locations[0];
    if (!location) { setMessage('Add the farm coordinates in Settings before loading weather history.'); return; }
    const startDate = previousSession?.observedAt ?? observedAt;
    setLoadingRainfall(true);
    setMessage('Loading rainfall history for this observation interval...');
    try {
      const query = `latitude=${location.latitude}&longitude=${location.longitude}&start_date=${startDate}&end_date=${observedAt}&daily=precipitation_sum&timezone=${encodeURIComponent(location.timezone ?? 'auto')}`;
      let response = await fetch(`https://archive-api.open-meteo.com/v1/archive?${query}`);
      if (!response.ok) response = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`);
      if (!response.ok) throw new Error('Weather history is not available for this interval.');
      const payload = await response.json() as { daily?: { precipitation_sum?: Array<number | null> } };
      const total = (payload.daily?.precipitation_sum ?? []).reduce<number>((sum, value) => sum + (Number.isFinite(value) ? Number(value) : 0), 0);
      setRainfallMm(total.toFixed(1));
      setMessage(`Rainfall filled from the saved ${location.name} coordinates. Replace it if the farm rain gauge is more accurate.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Rainfall history could not be loaded.');
    } finally { setLoadingRainfall(false); }
  }

  function editObservation(session: SigatokaSessionRecord) {
    setEditingSessionId(session.id);
    setSectorName(session.sectorName);
    setPlotName(session.plotName);
    setPlotArea(session.plotArea === null ? '' : String(session.plotArea));
    setObservedAt(session.observedAt);
    setIntervalDays(session.intervalDays);
    setMeanRawFerOverride(session.meanRawFerOverride === null || session.meanRawFerOverride === undefined ? '' : String(session.meanRawFerOverride));
    setPlants(session.plants);
    setNotes(session.notes ?? '');
    setRainfallMm(session.rainfallMm === null || session.rainfallMm === undefined ? '' : String(session.rainfallMm));
    setTreatmentApplied(Boolean(session.treatment));
    setTreatmentDate(session.treatment?.appliedAt ?? session.observedAt);
    setTreatmentProduct(session.treatment?.product ?? '');
    setTreatmentActiveIngredient(session.treatment?.activeIngredient ?? '');
    setTreatmentDose(session.treatment?.dose ?? '');
    setTreatmentMethod(session.treatment?.method ?? '');
    setCurrentPlant(Math.max(0, session.plants.findIndex(plant => plant.previousLeafReading <= 0 || plant.currentLeafReading <= 0)));
    setShowObservation(true);
  }

  function riskLabel(sed: number | undefined): string {
    if (sed === undefined) return 'No observations';
    const { watch, high, critical } = config.riskThresholds;
    if (critical !== null && sed >= critical) return 'Critical';
    if (high !== null && sed >= high) return 'High';
    if (watch !== null && sed >= watch) return 'Watch';
    return watch === null && high === null && critical === null ? 'Thresholds not configured' : 'Below attention threshold';
  }

  function riskTone(sed: number): string {
    const label = riskLabel(sed);
    if (label === 'Critical') return 'bg-red-600 text-white';
    if (label === 'High') return 'bg-orange-500 text-white';
    if (label === 'Watch') return 'bg-amber-300 text-amber-950';
    if (label === 'Below attention threshold') return 'bg-green-100 text-green-800';
    return 'bg-slate-100 text-slate-600';
  }

  function exportReportCsv() {
    if (!reportSessions.length) return setMessage('There are no submitted observations to export.');
    exportToCSV(reportSessions.flatMap(session => session.plants.map(plant => ({
      Year: session.monitoringYear,
      Week: session.monitoringWeek,
      Date: session.observedAt,
      [config.sectorLabel]: session.sectorName,
      [config.plotLabel]: session.plotName,
      Status: session.status,
      Observer: session.observerName,
      [config.plantLabel]: plant.plantNumber,
      [`${config.plantLabel} code`]: plant.sentinelPlantCode ?? '',
      'OLN (Old Leaf Number)': plant.previousLeafReading,
      'NLN (New Leaf Number)': plant.currentLeafReading,
      'FER (Foliar Emission Rhythm)': Number((plant.currentLeafReading - plant.previousLeafReading).toFixed(4)),
      'Leaf II': diseaseClassLabel(plant.leaf2),
      'Leaf III': diseaseClassLabel(plant.leaf3),
      'Leaf IV': diseaseClassLabel(plant.leaf4),
      'Plant YIL': plant.youngestInfestedLeaf,
      'Plant YNL': plant.youngestNecroticLeaf,
      'Plant NLF': plant.leavesAtFlowering,
      'Plant NLH': plant.leavesAtHarvest,
      'SED': Number(session.metrics.sed.toFixed(4)),
      'SED risk': riskLabel(session.metrics.sed),
      'Final FER': Number(session.metrics.finalFer.toFixed(6)),
      'Historical mean FER override': session.meanRawFerOverride ?? '',
      'Gross coefficient': session.metrics.grossCoefficient,
      'YIL': session.metrics.averageYil,
      'YNL': session.metrics.averageYnl,
      'NLF': session.metrics.averageNlf,
      'NLH': session.metrics.averageNlh,
      'D+': session.metrics.highDensityCount,
      'D+ possible': session.plants.length * 3,
      'Rainfall mm': session.rainfallMm,
      'Treatment': session.treatment?.product ?? '',
      'Active ingredient': session.treatment?.activeIngredient ?? '',
      'Treatment dose': session.treatment?.dose ?? '',
      Notes: session.notes ?? '',
      'Calculation version': session.metrics.calculationVersion,
    }))), `sigatoka-report-${reportPlot}-${reportPeriod}-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  function downloadImportTemplate() {
    const url = URL.createObjectURL(new Blob([createSigatokaImportTemplateCsv()], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'sigatoka-observation-import-template.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function downloadImportIssues() {
    exportToCSV(importIssues.map((issue, index) => ({ Issue: index + 1, Details: issue })), `sigatoka-import-issues-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  async function importObservations(file: File) {
    if (!organization?.id || !user || !canManage) return;
    setImporting(true);
    setImportIssues([]);
    setMessage('Checking import file...');
    try {
      const result = await parseSigatokaImport(file, { id: user.id, name: user.name }, profile.weekStartsOn, config.initialFerBaseline);
      const existingKeys = new Set(sessions.filter(session => session.status !== 'draft').map(session => `${session.plotName.toLowerCase()}|${session.monitoringYear}|${session.monitoringWeek}`));
      const accepted = result.sessions.filter(session => {
        const key = `${session.plotName.toLowerCase()}|${session.monitoringYear}|${session.monitoringWeek}`;
        if (existingKeys.has(key)) { result.errors.push(`${session.plotName}, ${session.observedAt}: that farm week already has an observation`); return false; }
        existingKeys.add(key);
        return true;
      });
      setImportIssues(result.errors);
      if (!accepted.length) {
        setMessage(`No observations were imported. ${result.errors.length} issue${result.errors.length === 1 ? '' : 's'} require attention; download the issue report for exact locations.`);
        return;
      }
      await addSigatokaSessions(organization.id, accepted);
      const skipped = result.skippedRows ? ` ${result.skippedRows} empty future-template row${result.skippedRows === 1 ? ' was' : 's were'} ignored.` : '';
      const issues = result.errors.length ? ` ${result.errors.length} issue${result.errors.length === 1 ? '' : 's'} in affected observations were quarantined; download the issue report to correct them.` : '';
      setMessage(`${accepted.length} historical observation${accepted.length === 1 ? '' : 's'} imported from ${result.totalRows} plant rows.${skipped}${issues} Calculations were rebuilt by the verified engine.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The observation import failed.');
    } finally { setImporting(false); }
  }

  async function printReport() {
    if (!reportSessions.length) return setMessage('There are no submitted observations to print.');
    try {
      await exportToPDF('sigatoka-report', 'sigatoka-report.pdf', `${organization?.name ?? 'Farm'} - Sigatoka Monitoring Report (${reportRangeLabel})`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The report could not be opened for printing.');
    }
  }

  function printFieldReport(session: SigatokaSessionRecord) {
    try {
      printSigatokaFieldReport(session, fieldReportOptions);
      setMessage(`Field report opened for ${session.plotName}, week ${session.monitoringWeek}. Use the print dialog to print or save it as PDF.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The field report could not be opened.');
    }
  }

  async function downloadFieldReport(session: SigatokaSessionRecord) {
    setMessage(`Preparing the field report workbook for ${session.plotName}...`);
    try {
      await downloadSigatokaFieldWorkbook(session, fieldReportOptions);
      setMessage(`Field report workbook downloaded for ${session.plotName}, week ${session.monitoringWeek}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The field report workbook could not be generated.');
    }
  }

  function canEditObservation(session: SigatokaSessionRecord): boolean {
    if (!canRecord || !user) return false;
    if (canManage) return true;
    return session.observerId === user.id && session.status !== 'verified';
  }

  function prepareArchive(records: SigatokaSessionRecord[], scope: string) {
    setArchiveSelectionIds(records.map(record => record.id));
    setArchiveScope(scope);
    setArchiveConfirmation('');
    setArchiveReason('');
  }

  async function confirmArchive() {
    const selectedRecords = sessions.filter(session => archiveSelectionIds.includes(session.id));
    if (!organization?.id || !user || archiveSelectionIds.length === 0 || selectedRecords.length !== archiveSelectionIds.length || !selectedRecords.every(canEditObservation)) return;
    const requiredPhrase = `ARCHIVE ${archiveSelectionIds.length}`;
    if (archiveConfirmation.trim().toUpperCase() !== requiredPhrase || archiveReason.trim().length < 5) return;
    setArchiveBusy(true);
    try {
      await archiveSigatokaSessions(organization.id, archiveSelectionIds, user.id, archiveReason.trim());
      setMessage(`${archiveSelectionIds.length} observation${archiveSelectionIds.length === 1 ? '' : 's'} moved to the recoverable archive for ${SIGATOKA_ARCHIVE_DAYS} days.`);
      setArchiveSelectionIds([]);
      setArchiveConfirmation('');
      setArchiveReason('');
      setShowArchive(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The selected observations could not be archived.');
    } finally { setArchiveBusy(false); }
  }

  async function restoreArchivedObservation(session: SigatokaSessionRecord) {
    if (!organization?.id || !user || !(canManage || (canRecord && session.observerId === user.id && session.status !== 'verified'))) return;
    const duplicate = sessions.find(active => active.status !== 'draft' && session.status !== 'draft' && active.plotName.toLowerCase() === session.plotName.toLowerCase() && active.monitoringYear === session.monitoringYear && active.monitoringWeek === session.monitoringWeek);
    if (duplicate) {
      setMessage(`Restore blocked: ${session.plotName} already has an active observation for week ${session.monitoringWeek}, ${session.monitoringYear}. Archive or resolve that record first.`);
      return;
    }
    try {
      await restoreSigatokaSession(organization.id, session.id, user.id);
      setMessage(`${session.plotName}, ${session.observedAt} was restored to active records.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The observation could not be restored.');
    }
  }

  async function permanentlyDeleteExpiredObservation(session: SigatokaSessionRecord) {
    if (!organization?.id || !user || !canManage) return;
    const expires = archiveExpiry(session);
    if (!expires || expires.getTime() > Date.now()) {
      setMessage(`This observation remains protected until ${expires?.toLocaleDateString() ?? 'its retention date'}.`);
      return;
    }
    try {
      await permanentlyDeleteExpiredSigatokaSession(organization.id, session.id, user.id);
      setMessage(`${session.plotName}, ${session.observedAt} was permanently deleted after its recovery period.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The expired observation could not be permanently deleted.');
    }
  }

  async function saveObservation(status: 'draft' | 'submitted') {
    if (!organization?.id || !user || !metrics || !plotName.trim() || !sectorName.trim()) return;
    if (status === 'submitted' && (completedPlants !== plants.length || validation.some(issue => issue.severity === 'error'))) {
      setMessage('Complete every plant and correct blocking validation issues before submitting.');
      return;
    }
    if (status === 'submitted' && treatmentApplied && !treatmentProduct.trim()) {
      setMessage('Enter the treatment product before submitting, or turn off treatment applied.');
      return;
    }
    if (status === 'submitted' && treatmentApplied && (!treatmentDate || treatmentDate > observedAt)) {
      setMessage('Treatment date is required and cannot be after the observation date.');
      return;
    }
    if (status === 'submitted' && observedAt > today) {
      setMessage('Observation date cannot be in the future.');
      return;
    }
    const recordWeek = editingSession && observedAt === editingSession.observedAt
      ? { year: editingSession.monitoringYear, week: editingSession.monitoringWeek }
      : farmWeek;
    const duplicate = sessions.find(session => session.id !== editingSessionId && session.status !== 'draft' && session.plotName.toLocaleLowerCase() === plotName.trim().toLocaleLowerCase() && session.monitoringYear === recordWeek.year && session.monitoringWeek === recordWeek.week);
    if (status === 'submitted' && duplicate) {
      setMessage(`${config.plotLabel} ${plotName.trim()} already has a submitted observation for week ${recordWeek.week}. Review the existing record instead of creating a duplicate.`);
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const enteredPlotArea = optionalNumber(plotArea);
      const record = {
        sectorName: sectorName.trim(),
        plotName: plotName.trim(),
        plotArea: enteredPlotArea,
        plotAreaSquareMetres: enteredPlotArea === null ? null : enteredPlotArea * squareMetresPerUnit,
        areaUnit: areaLabel,
        observedAt,
        monitoringWeek: recordWeek.week,
        monitoringYear: recordWeek.year,
        observerId: editingSession?.observerId ?? user.id,
        observerName: editingSession?.observerName ?? user.name,
        intervalDays,
        meanRawFerOverride: optionalNumber(meanRawFerOverride),
        status,
        plants,
        metrics,
        rainfallMm: optionalNumber(rainfallMm),
        treatment: treatmentApplied ? {
          appliedAt: treatmentDate,
          product: treatmentProduct.trim(),
          activeIngredient: treatmentActiveIngredient.trim(),
          dose: treatmentDose.trim(),
          method: treatmentMethod.trim(),
        } : null,
        notes: notes.trim(),
      };
      if (editingSessionId) await updateSigatokaSession(organization.id, editingSessionId, record, editingSession?.status === 'verified');
      else await addSigatokaSession(organization.id, record);
      setMessage(online ? (status === 'draft' ? 'Draft saved.' : editingSessionId ? 'Observation changes saved. A changed verified record returns to submitted status for review.' : 'Observation submitted.') : 'Saved offline. It will sync automatically when connectivity returns.');
      setShowObservation(false);
      resetObservationForm();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Observation could not be saved.');
    } finally { setSaving(false); }
  }

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div><div className="mb-1 flex items-center gap-2 text-sm font-medium text-green-700"><Bug className="h-4 w-4" /> Crop health intelligence</div><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Sigatoka Monitoring</h1><p className="max-w-3xl text-sm text-muted-foreground sm:text-base">Mobile field observations, validated SED calculations, plot trends, and transparent quality checks.</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={exportReportCsv}><Download className="mr-2 h-4 w-4" />Export CSV</Button><Button variant="outline" onClick={() => void printReport()}><Printer className="mr-2 h-4 w-4" />Print dashboard</Button>{latestReport && <Button variant="outline" onClick={() => printFieldReport(latestReport)}><FileSpreadsheet className="mr-2 h-4 w-4" />Latest field sheet</Button>}{latestReport && <Button variant="outline" onClick={() => void downloadFieldReport(latestReport)}><Download className="mr-2 h-4 w-4" />Latest Excel</Button>}{canManage && <Button variant="outline" onClick={downloadImportTemplate}><Download className="mr-2 h-4 w-4" />Import template</Button>}{canManage && importIssues.length > 0 && <Button variant="outline" onClick={downloadImportIssues}><AlertTriangle className="mr-2 h-4 w-4" />Import issues ({importIssues.length})</Button>}{canManage && <label className={`inline-flex h-10 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium shadow-sm hover:bg-accent ${importing ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}><Upload className="mr-2 h-4 w-4" />{importing ? 'Importing...' : 'Import history'}<input className="sr-only" type="file" accept=".csv,.xlsx" disabled={importing} onChange={event => { const file = event.target.files?.[0]; if (file) void importObservations(file); event.target.value = ''; }} /></label>}{canRecord && <Button onClick={() => { resetObservationForm(); setShowObservation(true); }}><Plus className="mr-2 h-4 w-4" />New observation</Button>}</div>
    </div>

    <div className="flex flex-wrap items-center gap-2 text-xs">
      <Badge variant="outline" className="gap-1.5">{online ? <Wifi className="h-3.5 w-3.5 text-green-600" /> : <CloudOff className="h-3.5 w-3.5 text-amber-600" />}{online ? 'Online' : 'Offline mode'}</Badge>
      {pendingWrites ? <Badge variant="outline" className="text-amber-700">Waiting to sync</Badge> : <Badge variant="outline" className="text-green-700">Records synced</Badge>}
      <Badge variant="outline">Protocol: SED v1</Badge>
    </div>

    {message && <div className="rounded-lg border bg-muted/40 p-3 text-sm">{message}</div>}
    {loadError && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{loadError}</div>}

    {archiveSelectionIds.length > 0 && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="archive-confirmation-title"><Card className="w-full max-w-lg shadow-xl"><CardHeader><CardTitle id="archive-confirmation-title" className="flex items-center gap-2"><Archive className="h-5 w-5 text-amber-600" />Move data to recovery archive</CardTitle></CardHeader><CardContent className="space-y-4"><div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"><p className="font-semibold">{archiveSelectionIds.length} observation{archiveSelectionIds.length === 1 ? '' : 's'} selected</p><p className="mt-1 text-amber-900">{archiveScope}. These records will disappear from active reports but can be restored for {SIGATOKA_ARCHIVE_DAYS} days before automatic permanent deletion.</p></div><div className="space-y-1.5"><Label>Reason for archiving</Label><Input value={archiveReason} onChange={event => setArchiveReason(event.target.value)} placeholder="Required, at least 5 characters" /></div><div className="space-y-1.5"><Label>Type <span className="font-mono">ARCHIVE {archiveSelectionIds.length}</span> to confirm</Label><Input autoFocus value={archiveConfirmation} onChange={event => setArchiveConfirmation(event.target.value)} autoComplete="off" /></div><div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="outline" disabled={archiveBusy} onClick={() => { setArchiveSelectionIds([]); setArchiveConfirmation(''); setArchiveReason(''); }}>Cancel</Button><Button variant="destructive" disabled={archiveBusy || archiveReason.trim().length < 5 || archiveConfirmation.trim().toUpperCase() !== `ARCHIVE ${archiveSelectionIds.length}`} onClick={() => void confirmArchive()}>{archiveBusy ? 'Archiving...' : 'Archive selected data'}</Button></div></CardContent></Card></div>}

    {decisionAlerts.length > 0 && <Card className="border-amber-200"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-5 w-5 text-amber-600" />Decision alerts</CardTitle></CardHeader><CardContent className="grid gap-3 lg:grid-cols-2">{decisionAlerts.slice(0, 6).map(alert => <div key={alert.id} className={`rounded-lg border p-3 ${alert.severity === 'critical' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}><div className="flex items-center justify-between gap-2"><p className="font-semibold">{alert.plotName}: {alert.title}</p><Badge variant="outline" className="capitalize">{alert.severity}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{alert.explanation}</p></div>)}</CardContent></Card>}

    {canRecord && myDrafts.length > 0 && !showObservation && <Card className="border-amber-200 bg-amber-50/40"><CardHeader><CardTitle className="text-base">Continue an unfinished observation</CardTitle></CardHeader><CardContent className="space-y-2">{myDrafts.map(draft => <div key={draft.id} className="flex flex-col gap-3 rounded-lg border bg-background p-3 sm:flex-row sm:items-center"><div className="flex-1"><p className="font-semibold">{draft.sectorName} / {draft.plotName}</p><p className="text-xs text-muted-foreground">{draft.observedAt} · {draft.plants.filter(plant => plant.previousLeafReading > 0 && plant.currentLeafReading > 0).length}/{draft.plants.length} plants complete</p></div><div className="flex gap-2"><Button size="sm" onClick={() => editObservation(draft)}>Continue</Button><Button size="icon" variant="ghost" aria-label="Archive draft" onClick={() => prepareArchive([draft], `draft for ${draft.plotName} on ${draft.observedAt}`)}><Archive className="h-4 w-4 text-amber-700" /></Button></div></div>)}</CardContent></Card>}

    {canRecord && showObservation && <Card className="border-green-200 shadow-sm">
      <CardHeader><CardTitle className="flex items-center justify-between"><span>{editingSession ? editingSession.status === 'draft' ? 'Continue field observation' : 'Edit field observation' : 'New field observation'}</span><Badge variant="outline">Week {editingSession && observedAt === editingSession.observedAt ? editingSession.monitoringWeek : farmWeek.week}</Badge></CardTitle></CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5"><Label>{config.sectorLabel}</Label><Input value={sectorName} onChange={event => setSectorName(event.target.value)} /></div>
          <div className="space-y-1.5"><Label>{config.plotLabel}</Label><Input list="sigatoka-plots" value={plotName} onChange={event => setPlotName(event.target.value)} onBlur={event => applyRegisteredPlot(event.target.value)} placeholder={`Select or enter ${config.plotLabel.toLowerCase()}`} /><datalist id="sigatoka-plots">{knownPlots.map(zone => <option key={zone} value={zone} />)}</datalist></div>
          <div className="space-y-1.5"><Label>{config.plotLabel} area ({areaLabel})</Label><Input type="number" min={0} step="any" value={plotArea} onChange={event => setPlotArea(event.target.value)} /><p className="text-xs text-muted-foreground">1 {areaLabel} = {metric(squareMetresPerUnit, 4)} m2</p></div>
          <div className="space-y-1.5"><Label>Observation date</Label><Input type="date" value={observedAt} onChange={event => { const date = event.target.value; setObservedAt(date); if (!editingSessionId) setObservationContext(plotName, date); }} /></div>
          <div className="space-y-1.5"><Label>Days since previous observation</Label><Input type="number" min={1} value={intervalDays} onChange={event => setIntervalDays(Math.max(1, Number(event.target.value) || 1))} /></div>
          <div className="space-y-1.5"><Label>Previous final FER</Label><Input value={metric(previousFinalFer, 4)} disabled /><p className="text-xs text-muted-foreground">From the latest submitted {config.plotLabel.toLowerCase()} record, or the configured initial baseline.</p></div>
          {(canManage || meanRawFerOverride !== '') && <div className="space-y-1.5"><Label>Verified mean FER override</Label><Input type="number" min={0} step="0.001" value={meanRawFerOverride} disabled={!canManage} onChange={event => setMeanRawFerOverride(event.target.value)} placeholder="Historical imports only" /><p className="text-xs text-muted-foreground">Use only when an imported historical sheet records a verified FER despite a plant-number reset.</p></div>}
        </div>

        <div className="rounded-xl border p-4">
          <div className="mb-4"><p className="flex items-center gap-2 font-semibold"><Droplets className="h-4 w-4 text-blue-600" />Weather and treatment context</p><p className="text-sm text-muted-foreground">Record context for this observation interval so reports can show disease response alongside rainfall and interventions.</p></div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5"><Label>Rainfall since previous observation (mm)</Label><Input type="number" min={0} step="0.1" value={rainfallMm} onChange={event => setRainfallMm(event.target.value)} placeholder="Optional" /><Button type="button" size="sm" variant="ghost" className="h-8 px-1 text-xs" disabled={loadingRainfall} onClick={() => void fillRainfallFromWeather()}>{loadingRainfall ? 'Loading weather...' : 'Fill from farm weather history'}</Button></div>
            <label className="flex min-h-10 items-center gap-3 rounded-md border px-3 py-2 text-sm font-medium"><input type="checkbox" className="h-4 w-4" checked={treatmentApplied} onChange={event => setTreatmentApplied(event.target.checked)} />Treatment applied in this interval</label>
            {treatmentApplied && <>
              <div className="space-y-1.5"><Label>Product</Label><Input value={treatmentProduct} onChange={event => setTreatmentProduct(event.target.value)} placeholder="Required" /></div>
              <div className="space-y-1.5"><Label>Application date</Label><Input type="date" max={observedAt} value={treatmentDate} onChange={event => setTreatmentDate(event.target.value)} /></div>
              {matchingPlanApplications[0] && <div className="flex items-end"><Button type="button" variant="outline" className="w-full" onClick={() => { const linked = matchingPlanApplications[0]; setTreatmentDate(linked.application.appliedAt); setTreatmentProduct(linked.plan.items.map(item => item.itemName).join(', ')); setTreatmentMethod(`Spray Planner: ${linked.plan.planName}`); }}>Use latest Spray Planner record</Button></div>}
              <div className="space-y-1.5"><Label>Active ingredient</Label><Input value={treatmentActiveIngredient} onChange={event => setTreatmentActiveIngredient(event.target.value)} /></div>
              <div className="space-y-1.5"><Label>Dose</Label><Input value={treatmentDose} onChange={event => setTreatmentDose(event.target.value)} placeholder="e.g. 0.4 L/ha" /></div>
              <div className="space-y-1.5"><Label>Application method</Label><Input value={treatmentMethod} onChange={event => setTreatmentMethod(event.target.value)} placeholder="Ground, aerial, mist blower" /></div>
            </>}
          </div>
        </div>

        <div className="rounded-xl border bg-muted/20 p-3 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3"><div><p className="font-semibold">{config.plantLabel} {currentPlant + 1}</p><p className="text-xs text-muted-foreground">{completedPlants}/{plants.length} leaf readings complete</p></div><div className="flex gap-2"><Button size="icon" variant="outline" disabled={currentPlant === 0} onClick={() => setCurrentPlant(index => index - 1)}><ChevronLeft className="h-4 w-4" /></Button><Button size="icon" variant="outline" disabled={currentPlant === plants.length - 1} onClick={() => setCurrentPlant(index => index + 1)}><ChevronRight className="h-4 w-4" /></Button></div></div>
          <div className="mb-5 flex gap-1 overflow-x-auto pb-1">{plants.map((plant, index) => <button type="button" key={plant.plantNumber} onClick={() => setCurrentPlant(index)} className={`h-9 min-w-9 rounded-full border text-xs font-semibold ${index === currentPlant ? 'border-green-600 bg-green-600 text-white' : plant.previousLeafReading > 0 && plant.currentLeafReading > 0 ? 'border-green-300 bg-green-50 text-green-800' : 'bg-background'}`}>{plant.plantNumber}</button>)}</div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5"><Label>Previous leaf number (OLN)</Label><Input type="number" min={0} step="0.1" value={plants[currentPlant].previousLeafReading || ''} onChange={event => updatePlant({ previousLeafReading: Number(event.target.value) })} />{carriedFromPlant ? <p className="text-xs text-green-700">Carried forward from the new leaf number recorded on {previousSession?.observedAt}.{selectedPlant.previousLeafReading !== carriedFromPlant.currentLeafReading ? ' This value has been adjusted.' : ''}</p> : <p className="text-xs text-muted-foreground">No earlier reading is available for this plant. Enter its starting leaf number.</p>}</div>
            <div className="space-y-1.5"><Label>Current leaf reading (NLN)</Label><Input type="number" min={0} step="0.1" value={plants[currentPlant].currentLeafReading || ''} onChange={event => updatePlant({ currentLeafReading: Number(event.target.value) })} /></div>
            <div className="rounded-lg border bg-background p-3"><p className="text-xs text-muted-foreground">Plant FER</p><p className="mt-1 text-xl font-bold">{metric(plants[currentPlant].currentLeafReading - plants[currentPlant].previousLeafReading, 2)}</p></div>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-3"><ScoreSelect label="Leaf II" value={plants[currentPlant].leaf2} onChange={leaf2 => updatePlant({ leaf2 })} /><ScoreSelect label="Leaf III" value={plants[currentPlant].leaf3} onChange={leaf3 => updatePlant({ leaf3 })} /><ScoreSelect label="Leaf IV" value={plants[currentPlant].leaf4} onChange={leaf4 => updatePlant({ leaf4 })} /></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5"><Label>Youngest infested leaf (YIL)</Label><Input type="number" min={1} step="0.1" value={plants[currentPlant].youngestInfestedLeaf ?? ''} onChange={event => updatePlant({ youngestInfestedLeaf: optionalNumber(event.target.value) })} /></div>
            <div className="space-y-1.5"><Label>Youngest necrotic leaf (YNL)</Label><Input type="number" min={1} step="0.1" value={plants[currentPlant].youngestNecroticLeaf ?? ''} onChange={event => updatePlant({ youngestNecroticLeaf: optionalNumber(event.target.value) })} /></div>
            <div className="space-y-1.5"><Label>Leaves at flowering (NLF)</Label><Input type="number" min={0} step="0.1" value={plants[currentPlant].leavesAtFlowering ?? ''} onChange={event => updatePlant({ leavesAtFlowering: optionalNumber(event.target.value) })} /></div>
            <div className="space-y-1.5"><Label>Leaves at harvest (NLH)</Label><Input type="number" min={0} step="0.1" value={plants[currentPlant].leavesAtHarvest ?? ''} onChange={event => updatePlant({ leavesAtHarvest: optionalNumber(event.target.value) })} /></div>
          </div>
        </div>

        {validation.length > 0 && <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-semibold">Quality checks</p>{validation.slice(0, 6).map((issue, index) => <p key={`${issue.plantNumber}-${index}`}><AlertTriangle className="mr-1 inline h-4 w-4" />{config.plantLabel} {issue.plantNumber}: {issue.message}</p>)}</div>}

        {metrics && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[
          ['SED', metric(metrics.sed, 1)], ['Final FER', metric(metrics.finalFer, 4)], ['Gross score', metric(metrics.grossCoefficient, 0)], ['YIL', metric(metrics.averageYil, 1)], ['D+ high density', `${metrics.highDensityCount}/${plants.length * 3}`],
        ].map(([label, value]) => <div key={label} className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-bold">{value}</p></div>)}</div>}
        <div className="space-y-1.5"><Label>Observation notes</Label><Input value={notes} onChange={event => setNotes(event.target.value)} placeholder="Conditions, anomalies, or follow-up required" /></div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => { setShowObservation(false); resetObservationForm(); }}>Cancel</Button>{(!editingSession || editingSession.status === 'draft') && <Button variant="outline" disabled={saving || !plotName.trim()} onClick={() => void saveObservation('draft')}><Save className="mr-2 h-4 w-4" />Save draft</Button>}<Button disabled={saving || !plotName.trim()} onClick={() => void saveObservation('submitted')}><CheckCircle2 className="mr-2 h-4 w-4" />{editingSession && editingSession.status !== 'draft' ? 'Save changes' : 'Submit observation'}</Button></div>
      </CardContent>
    </Card>}

    <Card><CardHeader><CardTitle className="text-base">Report range</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">Charts, tables, CSV, dashboard printing and bulk data actions follow this selection.</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6"><div className="space-y-1.5"><Label>{config.plotLabel}</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={reportPlot} onChange={event => setReportPlot(event.target.value)}><option value="all">All {config.plotLabel.toLowerCase()}s</option>{knownPlots.map(plot => <option key={plot} value={plot}>{plot}</option>)}</select></div><div className="space-y-1.5"><Label>Period</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={reportPeriod} onChange={event => setReportPeriod(event.target.value as ReportPeriod)}><option value="all">All dates</option><option value="week">Particular week</option><option value="month">Particular month</option><option value="year">Particular year</option><option value="custom">Custom date range</option></select></div>{(reportPeriod === 'week' || reportPeriod === 'year') && <div className="space-y-1.5"><Label>Year</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={reportYear} onChange={event => setReportYear(Number(event.target.value))}>{availableYears.map(year => <option key={year} value={year}>{year}</option>)}</select></div>}{reportPeriod === 'week' && <div className="space-y-1.5"><Label>Farm week</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={reportWeek} onChange={event => setReportWeek(Number(event.target.value))}>{Array.from({ length: 52 }, (_, index) => index + 1).map(week => <option key={week} value={week}>Week {week}</option>)}</select></div>}{reportPeriod === 'month' && <div className="space-y-1.5"><Label>Month</Label><Input type="month" value={reportMonth} onChange={event => setReportMonth(event.target.value)} /></div>}{reportPeriod === 'custom' && <><div className="space-y-1.5"><Label>From</Label><Input type="date" max={reportEndDate || today} value={reportStartDate} onChange={event => setReportStartDate(event.target.value)} /></div><div className="space-y-1.5"><Label>To</Label><Input type="date" min={reportStartDate} max={today} value={reportEndDate} onChange={event => setReportEndDate(event.target.value)} /></div></>}</div><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{reportRangeLabel}</Badge><Badge variant="outline">{reportSessions.length} submitted observation{reportSessions.length === 1 ? '' : 's'}</Badge>{filteredActiveSessions.some(session => session.status === 'draft') && <Badge variant="outline">{filteredActiveSessions.filter(session => session.status === 'draft').length} draft{filteredActiveSessions.filter(session => session.status === 'draft').length === 1 ? '' : 's'}</Badge>}{canManage && <Button size="sm" variant="outline" disabled={filteredActiveSessions.length === 0} onClick={() => prepareArchive(filteredActiveSessions, `${reportRangeLabel}, ${reportPlot === 'all' ? `all ${config.plotLabel.toLowerCase()}s` : `${config.plotLabel} ${reportPlot}`}`)}><Archive className="mr-2 h-4 w-4" />Clear / archive filtered data</Button>}{recoverableArchivedSessions.length > 0 && <Button size="sm" variant="outline" onClick={() => setShowArchive(current => !current)}><RotateCcw className="mr-2 h-4 w-4" />Recovery archive ({recoverableArchivedSessions.length})</Button>}</div></CardContent></Card>

    {showArchive && <Card className="border-amber-200"><CardHeader><CardTitle className="flex items-center justify-between gap-3 text-base"><span>Recovery archive</span><Button size="sm" variant="ghost" onClick={() => setShowArchive(false)}>Close</Button></CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">Archived observations stay recoverable for {SIGATOKA_ARCHIVE_DAYS} days. Their expiry timestamp is managed by Firestore TTL, after which deletion occurs automatically.</p>{recoverableArchivedSessions.length === 0 ? <p className="rounded-lg border p-4 text-sm">The archive is empty.</p> : recoverableArchivedSessions.map(session => { const expires = archiveExpiry(session); const expired = Boolean(expires && expires.getTime() <= Date.now()); return <div key={session.id} className="flex flex-col gap-3 rounded-lg border p-3 lg:flex-row lg:items-center"><div className="min-w-0 flex-1"><p className="font-semibold">{session.sectorName} / {session.plotName}</p><p className="text-xs text-muted-foreground">{session.observedAt} · Week {session.monitoringWeek}, {session.monitoringYear} · {session.archiveReason || 'No archive reason recorded'}</p><p className={`mt-1 text-xs ${expired ? 'font-semibold text-red-700' : 'text-amber-700'}`}>{expired ? 'Recovery period ended; pending automatic deletion.' : `Recoverable until ${expires?.toLocaleString() ?? 'the recorded expiry time'}.`}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => void restoreArchivedObservation(session)}><RotateCcw className="mr-2 h-4 w-4" />Restore</Button>{canManage && expired && <Button size="sm" variant="destructive" onClick={() => void permanentlyDeleteExpiredObservation(session)}><Trash2 className="mr-2 h-4 w-4" />Delete expired record</Button>}</div></div>; })}</CardContent></Card>}
    <div className="flex flex-wrap gap-2"><Link href="/dashboard/agriculture/weather"><Button size="sm" variant="outline"><Leaf className="mr-2 h-4 w-4" />Weather</Button></Link><Link href="/dashboard/agriculture/planner"><Button size="sm" variant="outline"><FlaskConical className="mr-2 h-4 w-4" />Spray plans</Button></Link><Link href="/dashboard/settings"><Button size="sm" variant="outline"><ShieldCheck className="mr-2 h-4 w-4" />Scouting settings</Button></Link></div>

    <div id="sigatoka-report" className="space-y-6">
    <div className="rounded-lg border bg-background p-4"><p className="text-xs font-semibold uppercase tracking-wide text-green-700">Selected report period</p><p className="mt-1 text-xl font-bold">{reportRangeLabel}</p><p className="text-sm text-muted-foreground">{reportPlot === 'all' ? `All ${config.plotLabel.toLowerCase()}s` : `${config.plotLabel}: ${reportPlot}`} · {reportSessions.length} submitted observation{reportSessions.length === 1 ? '' : 's'}</p></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card><CardContent className="pt-5"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Latest SED</p><p className="mt-2 text-3xl font-bold">{metric(latestReport?.metrics.sed, 0)}</p><p className="mt-1 text-xs text-muted-foreground">{riskLabel(latestReport?.metrics.sed)}</p></CardContent></Card>
      <Card><CardContent className="pt-5"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Youngest infested leaf</p><p className="mt-2 text-3xl font-bold">{metric(latestReport?.metrics.averageYil, 1)}</p><p className="mt-1 text-xs text-muted-foreground">Lower values mean younger leaves are affected.</p></CardContent></Card>
      <Card><CardContent className="pt-5"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">High-density observations</p><p className="mt-2 text-3xl font-bold">{latestReport ? `${latestReport.metrics.highDensityCount}/${latestReport.plants.length * 3}` : 'None'}</p><p className="mt-1 text-xs text-muted-foreground">D+ across leaves II, III and IV.</p></CardContent></Card>
      <Card><CardContent className="pt-5"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Range coverage</p><p className="mt-2 text-3xl font-bold">{filteredReportCoverage}/{reportPlots.length || '—'}</p><p className="mt-1 text-xs text-muted-foreground">{config.plotLabel}s represented in {reportRangeLabel.toLowerCase()}.</p></CardContent></Card>
    </div>

    <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
      <Card><CardHeader><CardTitle>Disease evolution and rainfall</CardTitle></CardHeader><CardContent>{chartData.length > 1 ? <div className="h-80 w-full"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={chartData} margin={{ left: 4, right: 8 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="week" tick={{ fontSize: 11 }} /><YAxis yAxisId="sed" tick={{ fontSize: 11 }} width={56} /><YAxis yAxisId="rain" orientation="right" tick={{ fontSize: 11 }} width={42} /><Tooltip /><Legend /><Bar yAxisId="rain" dataKey="rainfall" fill="#93c5fd" opacity={0.65} name="Rainfall (mm)" /><Line yAxisId="sed" type="monotone" dataKey="sedMin" stroke="#86efac" strokeDasharray="4 4" dot={false} name="Stage of Evolution of Disease (SED) minimum" /><Line yAxisId="sed" type="monotone" dataKey="sedMax" stroke="#fca5a5" strokeDasharray="4 4" dot={false} name="Stage of Evolution of Disease (SED) maximum" /><Line yAxisId="sed" type="monotone" dataKey="sed" stroke="#15803d" strokeWidth={3} dot={{ r: 3 }} name="Stage of Evolution of Disease (SED) mean" /></ComposedChart></ResponsiveContainer></div> : <div className="py-16 text-center text-sm text-muted-foreground">Submit observations across two farm weeks to see sector SED, range, and rainfall.</div>}</CardContent></Card>
      <Card><CardHeader><CardTitle>Treatment timeline</CardTitle></CardHeader><CardContent className="space-y-3">{weeklySummaries.flatMap(summary => summary.treatments.map(treatment => ({ ...treatment, week: summary.week }))).slice(-8).reverse().map((treatment, index) => <div key={`${treatment.appliedAt}-${treatment.product}-${index}`} className="rounded-lg border p-3"><div className="flex items-center justify-between gap-2"><p className="font-semibold">{treatment.product}</p><Badge variant="outline">W{treatment.week}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{treatment.appliedAt}{treatment.activeIngredient ? ` · ${treatment.activeIngredient}` : ''}</p>{treatment.dose && <p className="mt-1 text-xs">Dose: {treatment.dose}</p>}</div>)}{weeklySummaries.every(summary => summary.treatments.length === 0) && <div className="py-10 text-center text-sm text-muted-foreground">No treatment events recorded for this report view.</div>}</CardContent></Card>
    </div>

    <div className="grid gap-5 xl:grid-cols-2">
      <Card><CardHeader><CardTitle>Youngest affected and functional leaves</CardTitle></CardHeader><CardContent>{chartData.some(item => item.yil !== null || item.ynl !== null) ? <div className="h-72"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="week" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Legend /><Line type="monotone" dataKey="yil" stroke="#dc2626" strokeWidth={2} name="Youngest Infested Leaf (YIL, lower is worse)" /><Line type="monotone" dataKey="ynl" stroke="#7c3aed" strokeWidth={2} name="Youngest Necrotic Leaf (YNL, lower is worse)" /><Line type="monotone" dataKey="nlf" stroke="#16a34a" strokeWidth={2} name="Number of Leaves at Flowering (NLF)" /><Line type="monotone" dataKey="nlh" stroke="#0284c7" strokeWidth={2} name="Number of Leaves at Harvest (NLH)" /></LineChart></ResponsiveContainer></div> : <div className="py-14 text-center text-sm text-muted-foreground">Record YIL, YNL, NLF or NLH to build this analysis.</div>}</CardContent></Card>
      <Card><CardHeader><CardTitle>Functional leaves at harvest</CardTitle></CardHeader><CardContent>{harvestChartData.some(item => item.under3 + item.from3To5 + item.over5 > 0) ? <div className="h-72"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={harvestChartData}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="week" tick={{ fontSize: 11 }} /><YAxis domain={[0, 100]} tickFormatter={value => `${value}%`} tick={{ fontSize: 11 }} /><Tooltip formatter={value => `${Number(value).toFixed(1)}%`} /><Legend /><Bar dataKey="under3" stackId="harvest" fill="#dc2626" name="NLH under 3" /><Bar dataKey="from3To5" stackId="harvest" fill="#f59e0b" name="NLH 3-5" /><Bar dataKey="over5" stackId="harvest" fill="#16a34a" name="NLH over 5" /></ComposedChart></ResponsiveContainer></div> : <div className="py-14 text-center text-sm text-muted-foreground">Record leaves at harvest to see the workbook-style percentage distribution.</div>}</CardContent></Card>
    </div>

    <Card><CardHeader><CardTitle>{config.plotLabel} monitoring matrix</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[640px] border-collapse text-sm"><thead><tr><th className="border-b p-2 text-left">{config.plotLabel}</th>{recentWeeks.map(summary => <th key={summary.key} className="border-b p-2 text-center">W{summary.week}</th>)}</tr></thead><tbody>{reportPlots.map(plot => <tr key={plot}><td className="border-b p-2 font-medium">{plot}</td>{recentWeeks.map(summary => { const record = reportSessions.find(session => session.plotName === plot && session.monitoringYear === summary.year && session.monitoringWeek === summary.week); return <td key={summary.key} className="border-b p-2 text-center">{record ? <span className={`inline-flex min-w-16 justify-center rounded-full px-2 py-1 text-xs font-semibold ${riskTone(record.metrics.sed)}`} title={`SED ${metric(record.metrics.sed, 0)} · ${riskLabel(record.metrics.sed)}`}>{metric(record.metrics.sed, 0)}</span> : <span className="text-muted-foreground">Not done</span>}</td>; })}</tr>)}</tbody></table></div>{reportPlots.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Add farm zones in Settings to monitor weekly completion.</p>}</CardContent></Card>

    <Card><CardHeader><CardTitle>Weekly sector synthesis</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[900px] border-collapse text-sm"><thead><tr>{['Week', 'Coverage', 'SED mean', 'SED min', 'SED max', 'FER', 'YIL', 'YNL', 'NLF', 'NLH', 'D+', 'Rainfall'].map(label => <th key={label} className="border-b p-2 text-right first:text-left">{label}</th>)}</tr></thead><tbody>{weeklySummaries.slice().reverse().map(summary => <tr key={summary.key}><td className="border-b p-2 font-medium">{summary.year} W{summary.week}</td><td className="border-b p-2 text-right">{summary.plots}/{reportPlots.length || summary.plots}</td><td className="border-b p-2 text-right font-semibold">{metric(summary.sedMean, 0)}</td><td className="border-b p-2 text-right">{metric(summary.sedMin, 0)}</td><td className="border-b p-2 text-right">{metric(summary.sedMax, 0)}</td><td className="border-b p-2 text-right">{metric(summary.averageFer, 3)}</td><td className="border-b p-2 text-right">{metric(summary.averageYil, 1)}</td><td className="border-b p-2 text-right">{metric(summary.averageYnl, 1)}</td><td className="border-b p-2 text-right">{metric(summary.averageNlf, 1)}</td><td className="border-b p-2 text-right">{metric(summary.averageNlh, 1)}</td><td className="border-b p-2 text-right">{summary.highDensityCount}/{summary.possibleHighDensityCount}</td><td className="border-b p-2 text-right">{summary.rainfallMm === null ? '—' : `${metric(summary.rainfallMm, 1)} mm`}</td></tr>)}</tbody></table></div>{weeklySummaries.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No submitted observations in this report view.</p>}</CardContent></Card>

    <Card><CardHeader><CardTitle>Observation history</CardTitle></CardHeader><CardContent>{reportSessions.length === 0 ? <div className="py-12 text-center"><Bug className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p className="font-medium">No submitted observations</p><p className="text-sm text-muted-foreground">Start with one monitoring {config.plotLabel.toLowerCase()}, or change the report filter.</p></div> : <div className="space-y-2">{reportSessions.map(session => <div key={session.id} className="flex flex-col gap-3 rounded-lg border p-3 xl:flex-row xl:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{session.sectorName} / {session.plotName}</p><Badge variant="outline" className="capitalize">{session.status}</Badge>{session.treatment && <Badge variant="outline">Treatment: {session.treatment.product}</Badge>}</div><p className="text-xs text-muted-foreground">Week {session.monitoringWeek}, {session.monitoringYear} · {session.observedAt} · {session.observerName}{session.rainfallMm !== null && session.rainfallMm !== undefined ? ` · ${session.rainfallMm} mm rain` : ''}</p></div><div className="grid grid-cols-3 gap-4 text-sm xl:text-right"><div><p className="text-xs text-muted-foreground">SED</p><p className="font-bold">{metric(session.metrics.sed, 0)}</p></div><div><p className="text-xs text-muted-foreground">YIL</p><p className="font-bold">{metric(session.metrics.averageYil, 1)}</p></div><div><p className="text-xs text-muted-foreground">D+</p><p className="font-bold">{session.metrics.highDensityCount}</p></div></div><div className="flex flex-wrap gap-2">{canEditObservation(session) && <Button size="sm" variant="outline" onClick={() => editObservation(session)}><Pencil className="mr-2 h-4 w-4" />Edit</Button>}<Button size="sm" variant="outline" onClick={() => printFieldReport(session)}><Printer className="mr-2 h-4 w-4" />Field sheet</Button><Button size="sm" variant="outline" onClick={() => void downloadFieldReport(session)}><FileSpreadsheet className="mr-2 h-4 w-4" />Excel</Button>{canManage && session.status === 'submitted' && <Button size="sm" variant="outline" onClick={() => organization?.id && user?.id && void updateSigatokaSessionStatus(organization.id, session.id, 'verified', session.metrics, user.id)}>Verify result</Button>}{canEditObservation(session) && <Button size="icon" variant="ghost" aria-label="Archive observation" onClick={() => prepareArchive([session], `${session.plotName} observation for ${session.observedAt}`)}><Archive className="h-4 w-4 text-amber-700" /></Button>}</div></div>)}</div>}</CardContent></Card>
    </div>

    <Card><CardHeader><CardTitle>Metric guide</CardTitle></CardHeader><CardContent className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">{[
      ['BTN', 'Banana Tree Number', `Identifier assigned to each monitored banana plant. Daily screens use your organization’s chosen label: ${config.plantLabel}.`],
      ['OLN', 'Old Leaf Number', 'Leaf-emission reading carried forward from the previous observation.'],
      ['NLN', 'New Leaf Number', 'Leaf-emission reading recorded during the current observation.'],
      ['FER', 'Foliar Emission Rhythm', 'Difference between new and old leaf readings, standardized across the observation interval.'],
      ['SED', 'Stage of Evolution of Disease', 'Overall disease pressure calculated from weighted symptoms and foliar emission.'],
      ['YIL', 'Youngest Infested Leaf', 'Youngest leaf showing early disease symptoms. Lower values indicate disease on younger leaves.'],
      ['YNL', 'Youngest Necrotic Leaf', 'Youngest leaf showing necrotic or dead disease tissue. Lower values are more concerning.'],
      ['NLF', 'Number of Leaves at Flowering', 'Functional leaf count when the plant flowers.'],
      ['NLH', 'Number of Leaves at Harvest', 'Functional leaf count at harvest.'],
      ['D+', 'High-density Disease Count', 'Number of leaf observations with approximately more than 50 lesions.'],
    ].map(([short, full, meaning]) => <div key={short} className="rounded-lg border p-3"><p className="font-semibold"><abbr className="no-underline" title={full}>{short}</abbr> · {full}</p><p className="mt-1 text-xs text-muted-foreground">{meaning}</p></div>)}</CardContent></Card>

    <Card><CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5" />Protocol reference</CardTitle></CardHeader><CardContent className="grid gap-4 text-sm md:grid-cols-3"><div><p className="font-semibold">Disease class</p><p className="text-muted-foreground">Stages 1-6 describe symptom development. Minus means lower lesion density; plus means over approximately 50 lesions.</p></div><div><p className="font-semibold">Leaf position</p><p className="text-muted-foreground">The same class carries more weight on leaf II than leaf III or IV because symptoms are appearing on a younger leaf.</p></div><div><p className="font-semibold">SED calculation</p><p className="text-muted-foreground">Weighted disease coefficient × smoothed ten-day foliar emission rate. Raw plant records and the calculation version are stored together.</p></div><div className="md:col-span-3 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">Example selector output: {diseaseClassLabel({ stage: 3, density: 'high' })}. The configured coefficient matrix and smoothing logic are versioned, while farm labels, area conversion, sampling count, weeks, and attention thresholds remain organization-specific.</div></CardContent></Card>
  </div>;
}
