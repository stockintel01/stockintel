import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { effectiveAccessForUser, type AccessKey } from '@/lib/access-permissions';
import type { DirectoryMember, MemberRole } from '@/lib/comms/events';
import type { InventoryLevel } from '@/lib/comms/low-stock';
import type { OrganizationContext } from '@/lib/comms/server/repository';
import { adminDb } from '@/lib/firebase-admin';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getDataBackend } from '@/lib/supabase/config';

/** Reads team members and stock levels from whichever backend currently holds farm data. */
export interface TenantDirectory {
  listMembers(): Promise<DirectoryMember[]>;
  listInventoryLevels(): Promise<InventoryLevel[]>;
}

const MEMBER_ROLES = new Set<MemberRole>(['owner', 'manager', 'worker']);

function asRole(value: unknown): MemberRole | null {
  return typeof value === 'string' && MEMBER_ROLES.has(value as MemberRole) ? value as MemberRole : null;
}

function asNumber(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : Number.NaN;
}

function firebaseDirectory(firebaseOrganizationId: string): TenantDirectory {
  const organizationRef = adminDb.collection('organizations').doc(firebaseOrganizationId);

  return {
    async listMembers() {
      const [organization, tenantMembers, legacyMembers] = await Promise.all([
        organizationRef.get(),
        organizationRef.collection('members').get(),
        adminDb.collection('users').where('organizationId', '==', firebaseOrganizationId).get(),
      ]);

      const records = new Map<string, Record<string, unknown>>();
      for (const snapshot of legacyMembers.docs) records.set(snapshot.id, snapshot.data());
      // The organization's members subcollection is authoritative where both exist.
      for (const snapshot of tenantMembers.docs) records.set(snapshot.id, { ...records.get(snapshot.id), ...snapshot.data() });

      const ownerId = typeof organization.data()?.ownerId === 'string' ? organization.data()?.ownerId as string : '';
      if (ownerId) records.set(ownerId, { ...records.get(ownerId), role: 'owner', status: 'active' });

      const members: DirectoryMember[] = [];
      for (const [uid, data] of records) {
        const role = asRole(data.role);
        if (!role || data.status === 'inactive') continue;
        const access = Array.isArray(data.access) ? data.access as AccessKey[] : undefined;
        members.push({
          profileId: null,
          firebaseUid: uid,
          role,
          permissions: effectiveAccessForUser({ role, access }),
          displayName: typeof data.displayName === 'string' ? data.displayName : typeof data.name === 'string' ? data.name : null,
        });
      }
      return members;
    },

    async listInventoryLevels() {
      const snapshot = await organizationRef.collection('agric_inventory').where('isActive', '==', true).get();
      return snapshot.docs.map(document => {
        const item = document.data();
        return {
          itemId: document.id,
          name: typeof item.name === 'string' ? item.name : 'Unnamed item',
          quantity: asNumber(item.currentStock),
          minimum: asNumber(item.minimumStock),
          unit: typeof item.uom === 'string' ? item.uom : null,
        };
      });
    },
  };
}

function supabaseDirectory(organizationId: string): TenantDirectory {
  const client = getSupabaseAdminClient() as unknown as SupabaseClient;

  return {
    async listMembers() {
      const { data, error } = await client.rpc('comms_member_directory', { p_organization_id: organizationId });
      if (error) throw new Error(`load member directory: ${error.message}`);
      return ((data ?? []) as Array<Record<string, unknown>>).flatMap(member => {
        const role = asRole(member.role);
        if (!role || typeof member.userId !== 'string') return [];
        return [{
          profileId: member.userId,
          firebaseUid: typeof member.legacyFirebaseUid === 'string' ? member.legacyFirebaseUid : null,
          role,
          permissions: Array.isArray(member.permissions) ? member.permissions.filter((key): key is string => typeof key === 'string') : [],
          displayName: typeof member.displayName === 'string' ? member.displayName : null,
        }];
      });
    },

    async listInventoryLevels() {
      const { data, error } = await client.rpc('comms_inventory_levels', { p_organization_id: organizationId });
      if (error) throw new Error(`load inventory levels: ${error.message}`);
      return ((data ?? []) as Array<Record<string, unknown>>).flatMap(item => typeof item.itemId === 'string'
        ? [{
          itemId: item.itemId,
          name: typeof item.name === 'string' ? item.name : 'Unnamed item',
          quantity: asNumber(item.quantity),
          minimum: asNumber(item.minimum),
          unit: typeof item.unit === 'string' ? item.unit : null,
        }]
        : []);
    },
  };
}

export function getTenantDirectory(context: OrganizationContext): TenantDirectory {
  if (getDataBackend() === 'supabase') return supabaseDirectory(context.organizationId);
  if (!context.legacyFirebaseId) {
    throw new Error(`Organization ${context.organizationId} has no Firebase counterpart while Firebase is the active backend.`);
  }
  return firebaseDirectory(context.legacyFirebaseId);
}
