import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { calculateSigatokaMetrics, type SigatokaSessionRecord } from './sigatoka';

const collectionPath = (orgId: string) => collection(db, `organizations/${orgId}/agric_sigatoka_observations`);

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
): Promise<void> {
  await updateDoc(doc(db, `organizations/${orgId}/agric_sigatoka_observations/${sessionId}`), {
    ...session,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteSigatokaSession(orgId: string, sessionId: string): Promise<void> {
  await deleteDoc(doc(db, `organizations/${orgId}/agric_sigatoka_observations/${sessionId}`));
}
