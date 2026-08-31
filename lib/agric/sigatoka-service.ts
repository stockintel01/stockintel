import {
  addDoc,
  collection,
  deleteField,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { calculateSigatokaMetrics, type SigatokaSessionRecord } from './sigatoka';

const collectionPath = (orgId: string) => collection(db, `organizations/${orgId}/agric_sigatoka_observations`);
const auditCollectionPath = (orgId: string) => collection(db, `organizations/${orgId}/agric_deletion_log`);
export const SIGATOKA_ARCHIVE_DAYS = 30;

function normalizeSession(documentId: string, data: Record<string, unknown>): SigatokaSessionRecord {
  const session = { id: documentId, ...data } as SigatokaSessionRecord;
  try {
    return {
      ...session,
      metrics: calculateSigatokaMetrics(session.plants, session.intervalDays, session.metrics.previousFinalFer, session.meanRawFerOverride),
    };
  } catch {
    return session;
  }
}

export function subscribeSigatokaSessions(
  orgId: string,
  onData: (sessions: SigatokaSessionRecord[], hasPendingWrites: boolean) => void,
  onError?: (error: Error) => void,
): () => void {
  return onSnapshot(
    query(collectionPath(orgId), orderBy('observedAt', 'desc')),
    { includeMetadataChanges: true },
    snapshot => onData(
      snapshot.docs.map(document => normalizeSession(document.id, document.data())),
      snapshot.metadata.hasPendingWrites,
    ),
    error => onError?.(error),
  );
}

export async function addSigatokaSession(
  orgId: string,
  session: Omit<SigatokaSessionRecord, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<string> {
  const result = await addDoc(collectionPath(orgId), {
    ...session,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return result.id;
}

export async function addSigatokaSessions(
  orgId: string,
  sessions: Array<Omit<SigatokaSessionRecord, 'id' | 'createdAt' | 'updatedAt'>>,
): Promise<void> {
  for (let start = 0; start < sessions.length; start += 400) {
    const batch = writeBatch(db);
    for (const session of sessions.slice(start, start + 400)) {
      batch.set(doc(collectionPath(orgId)), { ...session, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    }
    await batch.commit();
  }
}

export async function updateSigatokaSessionStatus(
  orgId: string,
  sessionId: string,
  status: SigatokaSessionRecord['status'],
  metrics?: SigatokaSessionRecord['metrics'],
  verifiedBy?: string,
): Promise<void> {
  await updateDoc(doc(db, `organizations/${orgId}/agric_sigatoka_observations/${sessionId}`), {
    status,
    ...(status === 'verified' && metrics && verifiedBy ? { metrics, verifiedBy, verifiedAt: serverTimestamp() } : {}),
    updatedAt: serverTimestamp(),
  });
}

export async function updateSigatokaSession(
  orgId: string,
  sessionId: string,
  session: Partial<Omit<SigatokaSessionRecord, 'id' | 'createdAt' | 'updatedAt'>>,
  clearVerification = false,
): Promise<void> {
  await updateDoc(doc(db, `organizations/${orgId}/agric_sigatoka_observations/${sessionId}`), {
    ...session,
    ...(clearVerification ? { verifiedBy: deleteField(), verifiedAt: deleteField() } : {}),
    updatedAt: serverTimestamp(),
  });
}

function archiveMetadata(userId: string, reason: string, batchId: string) {
  const archivedAt = new Date();
  const expireAt = new Date(archivedAt);
  expireAt.setUTCDate(expireAt.getUTCDate() + SIGATOKA_ARCHIVE_DAYS);
  return {
    archivedAt: serverTimestamp(),
    archivedAtIso: archivedAt.toISOString(),
    archivedBy: userId,
    archiveReason: reason,
    archiveBatchId: batchId,
    expireAt: Timestamp.fromDate(expireAt),
    updatedAt: serverTimestamp(),
  };
}

export async function archiveSigatokaSessions(orgId: string, sessionIds: string[], userId: string, reason: string): Promise<void> {
  const uniqueIds = Array.from(new Set(sessionIds.filter(Boolean)));
  const normalizedReason = reason.trim();
  if (uniqueIds.length === 0) throw new Error('Select at least one observation to archive.');
  if (normalizedReason.length < 5) throw new Error('Enter a clear reason for archiving these observations.');
  const batchId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `archive-${Date.now()}`;
  for (let start = 0; start < uniqueIds.length; start += 350) {
    const ids = uniqueIds.slice(start, start + 350);
    const batch = writeBatch(db);
    const metadata = archiveMetadata(userId, normalizedReason, batchId);
    ids.forEach(sessionId => batch.update(doc(db, `organizations/${orgId}/agric_sigatoka_observations/${sessionId}`), metadata));
    batch.set(doc(auditCollectionPath(orgId)), {
      action: 'sigatoka_archive',
      entityType: 'sigatoka_observation',
      recordIds: ids,
      recordCount: ids.length,
      batchId,
      reason: normalizedReason,
      performedBy: userId,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  }
}

export async function restoreSigatokaSession(orgId: string, sessionId: string, userId: string): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, `organizations/${orgId}/agric_sigatoka_observations/${sessionId}`), {
    archivedAt: deleteField(),
    archivedAtIso: deleteField(),
    archivedBy: deleteField(),
    archiveReason: deleteField(),
    archiveBatchId: deleteField(),
    expireAt: deleteField(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(auditCollectionPath(orgId)), {
    action: 'sigatoka_restore',
    entityType: 'sigatoka_observation',
    recordIds: [sessionId],
    recordCount: 1,
    performedBy: userId,
    createdAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function permanentlyDeleteSigatokaSessions(orgId: string, sessionIds: string[], userId: string, reason: string): Promise<void> {
  const uniqueIds = Array.from(new Set(sessionIds.filter(Boolean)));
  const normalizedReason = reason.trim();
  if (uniqueIds.length === 0) throw new Error('Select at least one observation to delete.');
  if (normalizedReason.length < 5) throw new Error('Enter a clear reason for permanently deleting these observations.');
  const batchId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `delete-${Date.now()}`;
  for (let start = 0; start < uniqueIds.length; start += 350) {
    const ids = uniqueIds.slice(start, start + 350);
    const batch = writeBatch(db);
    ids.forEach(sessionId => batch.delete(doc(db, `organizations/${orgId}/agric_sigatoka_observations/${sessionId}`)));
    batch.set(doc(auditCollectionPath(orgId)), {
      action: 'sigatoka_permanent_delete',
      entityType: 'sigatoka_observation',
      recordIds: ids,
      recordCount: ids.length,
      batchId,
      reason: normalizedReason,
      deletionMode: 'user_selected',
      performedBy: userId,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  }
}
