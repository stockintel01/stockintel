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
import { isSupabaseBackendActive } from '@/lib/supabase/config';
import { calculateSigatokaMetrics, normalizeSigatokaAdvancedStageObservation, type SigatokaSessionRecord } from './sigatoka';
import { loadSupabaseSigatokaSessions, manageSupabaseSigatokaSession, saveSupabaseSigatokaSession, subscribeSupabaseSigatokaSessions, updateSupabaseSigatokaSession, updateSupabaseSigatokaStatus } from './supabase-sigatoka-service';

const collectionPath = (orgId: string) => collection(db, `organizations/${orgId}/agric_sigatoka_observations`);
const auditCollectionPath = (orgId: string) => collection(db, `organizations/${orgId}/agric_deletion_log`);
export const SIGATOKA_ARCHIVE_DAYS = 30;

function normalizeSession(documentId: string, data: Record<string, unknown>): SigatokaSessionRecord {
  const session = { id: documentId, ...data } as SigatokaSessionRecord;
  try {
    return {
      ...session,
      advancedStageObservation: normalizeSigatokaAdvancedStageObservation(session.advancedStageObservation, session.plants),
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
  if (isSupabaseBackendActive()) return subscribeSupabaseSigatokaSessions(orgId, onData, onError);
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
  if (isSupabaseBackendActive()) return saveSupabaseSigatokaSession(orgId, session);
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
  if (isSupabaseBackendActive()) {
    for (const session of sessions) await saveSupabaseSigatokaSession(orgId, session);
    return;
  }
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
  if (isSupabaseBackendActive()) return updateSupabaseSigatokaStatus(orgId, sessionId, status, metrics);
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
  if (isSupabaseBackendActive()) return updateSupabaseSigatokaSession(orgId, sessionId, session, clearVerification);
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
  if (isSupabaseBackendActive()) {
    for (const sessionId of uniqueIds) await manageSupabaseSigatokaSession(orgId, sessionId, 'archive', normalizedReason, batchId);
    return;
  }
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
  if (isSupabaseBackendActive()) return manageSupabaseSigatokaSession(orgId, sessionId, 'restore');
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
  if (isSupabaseBackendActive()) {
    for (const sessionId of uniqueIds) await manageSupabaseSigatokaSession(orgId, sessionId, 'permanent_delete', normalizedReason, batchId);
    return;
  }
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
