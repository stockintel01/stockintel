import { addDoc, collection, deleteDoc, doc, increment, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { isSupabaseBackendActive } from '@/lib/supabase/config';
import type { PackingCrewProfile, PackingFulfilmentPlan, PackingInspectionStatus, PackingQualityConfig, PackingQualityEvent, PackingStation, PackingTransportProfile } from './types';
import {
  deleteSupabasePackingCrewProfile,
  deleteSupabasePackingStation,
  deleteSupabasePackingTransportProfile,
  loadSupabasePackingTeamMembers,
  recordSupabasePackingQualityEvent,
  saveSupabasePackingCrewProfile,
  saveSupabasePackingFulfilmentPlan,
  saveSupabasePackingQualityConfig,
  saveSupabasePackingStation,
  saveSupabasePackingTransportProfile,
  setSupabasePackingPlanStatus,
  subscribeSupabasePackingCrewProfiles,
  subscribeSupabasePackingFulfilmentPlans,
  subscribeSupabasePackingQualityConfig,
  subscribeSupabasePackingQualityEvents,
  subscribeSupabasePackingStations,
  subscribeSupabasePackingTransportProfiles,
} from './supabase-packing-service';

type Unsub = () => void;

const collectionFor = (orgId: string, name: string) => collection(db, `organizations/${orgId}/${name}`);
const documentFor = (orgId: string, name: string, id: string) => doc(db, `organizations/${orgId}/${name}/${id}`);

function clean<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as Partial<T>;
}

function subscribeCollection<T>(orgId: string, name: string, sortField: string, onData: (items: T[]) => void, onError?: (error: Error) => void): Unsub {
  return onSnapshot(query(collectionFor(orgId, name), orderBy(sortField)), snapshot => {
    onData(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as T)));
  }, error => onError?.(error));
}

export const subscribePackingFulfilmentPlans = (orgId: string, onData: (items: PackingFulfilmentPlan[]) => void, onError?: (error: Error) => void) =>
  isSupabaseBackendActive() ? subscribeSupabasePackingFulfilmentPlans(orgId, onData, onError) : subscribeCollection<PackingFulfilmentPlan>(orgId, 'agric_packing_plans', 'startDate', onData, onError);

export const subscribePackingCrewProfiles = (orgId: string, onData: (items: PackingCrewProfile[]) => void, onError?: (error: Error) => void) =>
  isSupabaseBackendActive() ? subscribeSupabasePackingCrewProfiles(orgId, onData, onError) : subscribeCollection<PackingCrewProfile>(orgId, 'agric_packing_crews', 'name', onData, onError);

export const subscribePackingTransportProfiles = (orgId: string, onData: (items: PackingTransportProfile[]) => void, onError?: (error: Error) => void) =>
  isSupabaseBackendActive() ? subscribeSupabasePackingTransportProfiles(orgId, onData, onError) : subscribeCollection<PackingTransportProfile>(orgId, 'agric_packing_transport', 'label', onData, onError);

export const subscribePackingQualityEvents = (orgId: string, onData: (items: PackingQualityEvent[]) => void, onError?: (error: Error) => void) =>
  isSupabaseBackendActive() ? subscribeSupabasePackingQualityEvents(orgId, onData, onError) : subscribeCollection<PackingQualityEvent>(orgId, 'agric_packing_inspections', 'inspectedAt', items => onData(items.reverse()), onError);

export function subscribePackingQualityConfig(orgId: string, onData: (config: PackingQualityConfig | null) => void, onError?: (error: Error) => void): Unsub {
  if (isSupabaseBackendActive()) return subscribeSupabasePackingQualityConfig(orgId, onData, onError);
  return onSnapshot(documentFor(orgId, 'agric_packing_quality_config', 'main'), snapshot => {
    onData(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } as PackingQualityConfig : null);
  }, error => onError?.(error));
}

async function saveProfile<T extends object>(orgId: string, collectionName: string, value: T, id?: string): Promise<string> {
  const payload = { ...clean(value), updatedAt: serverTimestamp() };
  if (id) {
    await setDoc(documentFor(orgId, collectionName, id), payload, { merge: true });
    return id;
  }
  const created = await addDoc(collectionFor(orgId, collectionName), { ...payload, createdAt: serverTimestamp() });
  return created.id;
}

export const savePackingFulfilmentPlan = (orgId: string, plan: Omit<PackingFulfilmentPlan, 'id' | 'createdAt' | 'updatedAt'>, id?: string) =>
  isSupabaseBackendActive() ? saveSupabasePackingFulfilmentPlan(orgId, plan, id) : saveProfile(orgId, 'agric_packing_plans', plan, id);

export const savePackingCrewProfile = (orgId: string, profile: Omit<PackingCrewProfile, 'id' | 'createdAt' | 'updatedAt'>, id?: string) =>
  isSupabaseBackendActive() ? saveSupabasePackingCrewProfile(orgId, profile, id) : saveProfile(orgId, 'agric_packing_crews', profile, id);

export const savePackingTransportProfile = (orgId: string, profile: Omit<PackingTransportProfile, 'id' | 'createdAt' | 'updatedAt'>, id?: string) =>
  isSupabaseBackendActive() ? saveSupabasePackingTransportProfile(orgId, profile, id) : saveProfile(orgId, 'agric_packing_transport', profile, id);

export async function setPackingPlanStatus(orgId: string, id: string, status: PackingFulfilmentPlan['status']): Promise<void> {
  if (isSupabaseBackendActive()) return setSupabasePackingPlanStatus(orgId, id, status);
  await updateDoc(documentFor(orgId, 'agric_packing_plans', id), { status, updatedAt: serverTimestamp() });
}

export const savePackingQualityConfig = (orgId: string, config: Omit<PackingQualityConfig, 'id' | 'updatedAt'>) =>
  isSupabaseBackendActive() ? saveSupabasePackingQualityConfig(orgId, config) : setDoc(documentFor(orgId, 'agric_packing_quality_config', 'main'), { ...clean(config), updatedAt: serverTimestamp() }, { merge: true });

export async function recordPackingQualityEvent(
  orgId: string,
  event: Omit<PackingQualityEvent, 'id' | 'createdAt'>,
  status: PackingInspectionStatus,
): Promise<void> {
  if (isSupabaseBackendActive()) return recordSupabasePackingQualityEvent(orgId, event, status);
  const batch = writeBatch(db);
  const eventRef = doc(collectionFor(orgId, 'agric_packing_inspections'));
  batch.set(eventRef, { ...clean(event), createdAt: serverTimestamp() });
  batch.update(documentFor(orgId, 'agric_packing', event.packingRecordId), clean({
    packageType: event.packageType,
    packageSize: event.packageSize || '',
    qualityGrade: event.qualityGrade,
    lotNumber: event.lotNumber,
    palletId: event.palletId || '',
    storageLocation: event.storageLocation || '',
    market: event.market,
    destinationCountry: event.destinationCountry,
    qualityStandardId: event.qualityStandardId,
    qualityStandardName: event.qualityStandardName,
    qualityStandardAuthority: event.qualityStandardAuthority,
    qualityStandardReference: event.qualityStandardReference,
    qualityStandardVersion: event.qualityStandardVersion,
    qualityStandardSourceUrl: event.qualityStandardSourceUrl,
    inspectionStatus: status,
    packedBoxes: increment(event.packedDelta),
    inspectedBoxes: increment(event.inspectedDelta),
    acceptedBoxes: increment(event.acceptedDelta),
    rejectedBoxes: increment(event.rejectedDelta),
    reworkBoxes: increment(event.reworkDelta),
    inspectorId: event.inspectorId,
    inspectorName: event.inspectorName,
    inspectedAt: event.inspectedAt,
    inspectionNotes: event.notes || '',
    lastQualityEventId: eventRef.id,
  }));
  await batch.commit();
}

export const deletePackingCrewProfile = (orgId: string, id: string) => isSupabaseBackendActive() ? deleteSupabasePackingCrewProfile(orgId, id) : deleteDoc(documentFor(orgId, 'agric_packing_crews', id));
export const deletePackingTransportProfile = (orgId: string, id: string) => isSupabaseBackendActive() ? deleteSupabasePackingTransportProfile(orgId, id) : deleteDoc(documentFor(orgId, 'agric_packing_transport', id));

export const deletePackingStation = (orgId: string, id: string) => isSupabaseBackendActive()
  ? deleteSupabasePackingStation(orgId, id)
  : deleteDoc(documentFor(orgId, 'agric_packing_stations', id));

export function subscribePackingStations(orgId: string, onData: (items: PackingStation[]) => void, onError?: (error: Error) => void): Unsub {
  if (isSupabaseBackendActive()) return subscribeSupabasePackingStations(orgId, onData, onError);
  return subscribeCollection<PackingStation>(orgId, 'agric_packing_stations', 'name', onData, onError);
}

export async function loadPackingTeamMembers(orgId: string): Promise<Array<{ id: string; name: string; email: string }>> {
  if (isSupabaseBackendActive()) return loadSupabasePackingTeamMembers(orgId);
  throw new Error('Firebase team members continue to load through the existing page listener.');
}

export async function savePackingStation(orgId: string, station: { id?: string; name: string; storageName?: string; assignedUserIds: string[]; assignedUserNames?: string[] }): Promise<string> {
  if (isSupabaseBackendActive()) return saveSupabasePackingStation(orgId, station);
  const payload = { name: station.name, storageName: station.storageName ?? '', assignedUserIds: station.assignedUserIds, assignedUserNames: station.assignedUserNames ?? [], isActive: true, updatedAt: serverTimestamp() };
  if (station.id) {
    await setDoc(documentFor(orgId, 'agric_packing_stations', station.id), payload, { merge: true });
    return station.id;
  }
  const created = await addDoc(collectionFor(orgId, 'agric_packing_stations'), { ...payload, createdAt: serverTimestamp() });
  return created.id;
}
