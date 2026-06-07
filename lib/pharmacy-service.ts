/**
 * FIRESTORE INDEXES REQUIRED:
 *
 * patients collection:
 *   - fullName ASC (single field — auto-created)
 *   - contactNumber ASC (single field — auto-created)
 *
 * organizations/{orgId}/prescriptions:
 *   - createdAt DESC (single field — auto-created)
 *   - (createdAt >= today) — requires composite if combined with other fields
 *
 * organizations/{orgId}/inventory:
 *   - expiryDate ASC + quantity DESC (composite — create in Firebase Console)
 *   - quantity ASC (single field — auto-created)
 *
 * Deploy indexes via: firebase deploy --only firestore:indexes
 */

/**
 * pharmacy-service.ts
 *
 * Firestore service layer for the Pharmacy module.
 *
 * Collections:
 *   patients/                              (global — shared across all pharmacies)
 *   organizations/{orgId}/prescriptions/{rxId}
 *   organizations/{orgId}/pharmacy_stats/{date}   (daily aggregates)
 */

import {
  collection, doc, addDoc, updateDoc, getDocs, getDoc,
  onSnapshot, query, where, orderBy, limit, serverTimestamp,
  runTransaction, writeBatch, increment, Timestamp, startAt, endAt,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Patient, PatientHistoryRecord } from '@/types/patient';

type Unsub = () => void;

function clean<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null)
  ) as Partial<T>;
}

// ─────────────────────────────────────────────────────────────
// PATIENTS  (global collection — cross-pharmacy)
// ─────────────────────────────────────────────────────────────

/** Search patients by name prefix (Firestore range query) */
export async function searchPatients(orgId: string, term: string, maxResults = 10): Promise<Patient[]> {
  if (!term.trim()) return [];
  const ref = collection(db, `organizations/${orgId}/patients`);

  // Name prefix search
  const nameQ = query(
    ref,
    orderBy('fullName'),
    startAt(term),
    endAt(term + '\uf8ff'),
    limit(maxResults),
  );

  // Also search by contact number if term looks like a phone
  const isPhone = /^\d+$/.test(term.replace(/\s+/g, ''));
  const promises: Promise<Patient[]>[] = [
    getDocs(nameQ).then(s => s.docs.map(d => ({ id: d.id, ...d.data() } as Patient))),
  ];

  if (isPhone) {
    const phoneQ = query(
      ref,
      where('contactNumber', '>=', term),
      where('contactNumber', '<=', term + '\uf8ff'),
      limit(maxResults),
    );
    promises.push(getDocs(phoneQ).then(s => s.docs.map(d => ({ id: d.id, ...d.data() } as Patient))));
  }

  const results = await Promise.all(promises);
  const seen = new Set<string>();
  return results.flat().filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
}

/** Register a new patient (global) */
export async function registerPatient(
  orgId: string,
  patient: Omit<Patient, 'id' | 'createdAt' | 'history'>,
): Promise<string> {
  const r = await addDoc(collection(db, `organizations/${orgId}/patients`), {
    ...clean(patient),
    history: [],
    createdAt: new Date().toISOString(),
    updatedAt: serverTimestamp(),
  });
  return r.id;
}

/** Add a visit/prescription record to a patient's global history */
export async function addPatientRecord(
  orgId: string,
  patientId: string,
  record: Omit<PatientHistoryRecord, 'id'>,
): Promise<void> {
  const newRecord: PatientHistoryRecord = {
    ...record,
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
  };
  const patientRef = doc(db, `organizations/${orgId}/patients/${patientId}`);
  await updateDoc(patientRef, {
    history: (await getDoc(patientRef)).data()?.history
      ? [...((await getDoc(patientRef)).data()?.history ?? []), newRecord]
      : [newRecord],
    updatedAt: serverTimestamp(),
  });
}

// ─────────────────────────────────────────────────────────────
// PRESCRIPTIONS
// ─────────────────────────────────────────────────────────────

export interface Prescription {
  id: string;
  rxNumber: string;           // e.g. RX-2026-001
  patientId?: string;
  patientName: string;
  patientAge?: string;
  patientType: 'OP' | 'IP';
  ward?: string;
  drugs: Array<{
    name: string;
    dosage: string;
    duration: string;
    qty?: number;
    unitPrice?: number;
  }>;
  status: 'pending' | 'dispensed' | 'cancelled';
  prescribedBy?: string;      // doctor name
  dispensedBy?: string;       // pharmacist name
  dispensedAt?: string;
  source: 'manual' | 'ai_scan' | 'digital';
  scannedImageUrl?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: any;
}

export function subscribePrescriptions(
  orgId: string,
  onData: (rxs: Prescription[]) => void,
  onErr?: (e: Error) => void,
): Unsub {
  const q = query(
    collection(db, `organizations/${orgId}/prescriptions`),
    orderBy('createdAt', 'desc'),
    limit(100),
  );
  return onSnapshot(q,
    snap => onData(snap.docs.map(d => ({ id: d.id, ...d.data() } as Prescription))),
    err => { console.error('[pharmacy] prescriptions:', err); onErr?.(err); },
  );
}

export async function createPrescription(
  orgId: string,
  rx: Omit<Prescription, 'id' | 'rxNumber' | 'createdAt'>,
): Promise<string> {
  const year = new Date().getFullYear();
  const existing = await getDocs(collection(db, `organizations/${orgId}/prescriptions`));
  const num = String(existing.size + 1).padStart(4, '0');
  const r = await addDoc(collection(db, `organizations/${orgId}/prescriptions`), {
    ...clean(rx),
    rxNumber: `RX-${year}-${num}`,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: serverTimestamp(),
  });

  // If linked to a patient, add to their global history
  if (rx.patientId) {
    await addPatientRecord(orgId, rx.patientId, {
      date: new Date().toISOString(),
      pharmacyId: orgId,
      pharmacyName: rx.prescribedBy ?? 'Pharmacy',
      prescription: rx.drugs.map(d => `${d.name} ${d.dosage}`).join(', '),
      notes: rx.notes,
    });
  }

  return r.id;
}

export async function dispensePrescription(
  orgId: string,
  rxId: string,
  dispensedBy: string,
  /** inventory item ids to decrement */
  stockDeductions: Array<{ itemId: string; qty: number }>,
): Promise<void> {
  await runTransaction(db, async tx => {
    // Decrement inventory for each drug
    for (const d of stockDeductions) {
      const invRef = doc(db, `organizations/${orgId}/inventory/${d.itemId}`);
      const snap = await tx.get(invRef);
      if (!snap.exists()) continue;
      const cur = (snap.data().quantity as number) ?? 0;
      if (cur - d.qty < 0) throw new Error(`Insufficient stock: ${snap.data().name}`);
      tx.update(invRef, { quantity: increment(-d.qty), updatedAt: serverTimestamp() });
    }
    // Mark prescription dispensed
    tx.update(doc(db, `organizations/${orgId}/prescriptions/${rxId}`), {
      status: 'dispensed',
      dispensedBy,
      dispensedAt: new Date().toISOString(),
      updatedAt: serverTimestamp(),
    });
  });
}

export async function cancelPrescription(orgId: string, rxId: string): Promise<void> {
  await updateDoc(doc(db, `organizations/${orgId}/prescriptions/${rxId}`), {
    status: 'cancelled', updatedAt: serverTimestamp(),
  });
}

// ─────────────────────────────────────────────────────────────
// PHARMACY STATS (daily KPIs)
// ─────────────────────────────────────────────────────────────

export interface PharmacyDailyStats {
  date: string;
  prescriptionsFilled: number;
  patientsServed: number;
  followUpsPending: number;
  revenue: number;
}

export async function getDailyStats(orgId: string): Promise<PharmacyDailyStats> {
  const today = new Date().toISOString().slice(0, 10);
  const rxSnap = await getDocs(query(
    collection(db, `organizations/${orgId}/prescriptions`),
    where('createdAt', '>=', today),
  ));
  const filled = rxSnap.docs.filter(d => d.data().status === 'dispensed').length;
  const total = rxSnap.size;
  const patients = new Set(rxSnap.docs.map(d => d.data().patientId).filter(Boolean)).size;

  return {
    date: today,
    prescriptionsFilled: filled,
    patientsServed: patients || total,
    followUpsPending: total - filled,
    revenue: 0, // Computed from sales module
  };
}

// ─────────────────────────────────────────────────────────────
// DRUG ANALYTICS — computed from inventory + sales
// ─────────────────────────────────────────────────────────────

export interface DrugPerformance {
  id: string;
  name: string;
  sku: string;
  currentStock: number;
  reorderPoint: number;
  avgDailySales: number;
  daysUntilStockout: number;
  status: 'healthy' | 'warning' | 'critical';
  trend: 'up' | 'down' | 'stable';
  trendPercent: number;
  category: string;
  expiryDate?: string;
}

export async function getDrugPerformance(orgId: string): Promise<DrugPerformance[]> {
  const invSnap = await getDocs(query(
    collection(db, `organizations/${orgId}/inventory`),
    where('quantity', '>=', 0),
    orderBy('quantity'),
  ));

  return invSnap.docs.map(d => {
    const item = d.data();
    const stock = item.quantity as number ?? 0;
    const reorder = item.reorderLevel as number ?? 50;
    const avgDaily = item.avgDailySales as number ?? 1;
    const days = avgDaily > 0 ? Math.floor(stock / avgDaily) : 999;
    const status: DrugPerformance['status'] = days <= 7 ? 'critical' : days <= 14 ? 'warning' : 'healthy';

    return {
      id: d.id,
      name: item.name ?? '',
      sku: item.sku ?? '',
      currentStock: stock,
      reorderPoint: reorder,
      avgDailySales: avgDaily,
      daysUntilStockout: days,
      status,
      trend: 'stable' as const,
      trendPercent: 0,
      category: item.category ?? 'General',
      expiryDate: item.expiryDate,
    };
  });
}

// ─────────────────────────────────────────────────────────────
// EXPIRY ALERTS
// ─────────────────────────────────────────────────────────────

export async function getExpiryAlerts(
  orgId: string,
  warningDays = 90,
): Promise<Array<{ id: string; name: string; sku: string; expiryDate: string; quantity: number; daysLeft: number }>> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + warningDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const snap = await getDocs(query(
    collection(db, `organizations/${orgId}/inventory`),
    where('expiryDate', '<=', cutoffStr),
    where('quantity', '>', 0),
    orderBy('expiryDate'),
    limit(50),
  ));

  const today = new Date();
  return snap.docs.map(d => {
    const data = d.data();
    const expiry = new Date(data.expiryDate);
    const daysLeft = Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
    return {
      id: d.id,
      name: data.name ?? '',
      sku: data.sku ?? '',
      expiryDate: data.expiryDate ?? '',
      quantity: data.quantity ?? 0,
      daysLeft,
    };
  });
}
