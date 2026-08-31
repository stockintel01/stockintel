import { addDoc, collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { WaterRecord, WaterRecordInput } from './water-balance';

const recordsPath = (orgId: string) => collection(db, `organizations/${orgId}/agric_water_records`);

export function subscribeWaterRecords(orgId: string, onData: (records: WaterRecord[], pending: boolean) => void, onError: (error: Error) => void) {
  return onSnapshot(query(recordsPath(orgId), orderBy('date', 'desc')), { includeMetadataChanges: true }, snapshot => {
    onData(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as WaterRecord)), snapshot.metadata.hasPendingWrites);
  }, onError);
}

export async function addWaterRecord(orgId: string, record: WaterRecordInput, user: { id: string; name: string }, source: WaterRecord['source'] = 'manual') {
  await addDoc(recordsPath(orgId), { ...record, source, createdBy: user.id, createdByName: user.name, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

export async function addWaterRecords(orgId: string, records: WaterRecordInput[], user: { id: string; name: string }) {
  for (let start = 0; start < records.length; start += 400) {
    const batch = writeBatch(db);
    records.slice(start, start + 400).forEach(record => batch.set(doc(recordsPath(orgId)), { ...record, source: 'import', createdBy: user.id, createdByName: user.name, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    await batch.commit();
  }
}

export async function updateWaterRecord(orgId: string, recordId: string, record: WaterRecordInput) {
  await updateDoc(doc(db, `organizations/${orgId}/agric_water_records/${recordId}`), { ...record, updatedAt: serverTimestamp() });
}

export async function deleteWaterRecord(orgId: string, recordId: string) {
  const batch = writeBatch(db);
  batch.delete(doc(db, `organizations/${orgId}/agric_water_records/${recordId}`));
  await batch.commit();
}
