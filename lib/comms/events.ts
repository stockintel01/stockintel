export type NotificationEventType = 'inventory.low_stock';
export type MemberRole = 'owner' | 'manager' | 'worker';
export type ConsentCategory = 'operational';

/** A member is in the audience when their role is listed or they hold any listed permission. */
export interface AudienceSpec {
  roles: MemberRole[];
  permissions: string[];
}

export interface NotificationEventDefinition {
  type: NotificationEventType;
  label: string;
  consentCategory: ConsentCategory;
  templateKey: string;
  defaultAudience: AudienceSpec;
}

export interface DirectoryMember {
  profileId: string | null;
  firebaseUid: string | null;
  role: MemberRole;
  permissions: string[];
  displayName: string | null;
}

export const NOTIFICATION_EVENTS: Record<NotificationEventType, NotificationEventDefinition> = {
  'inventory.low_stock': {
    type: 'inventory.low_stock',
    label: 'Stock below minimum',
    consentCategory: 'operational',
    templateKey: 'inventory_low_stock',
    defaultAudience: { roles: ['owner'], permissions: ['agricStock'] },
  },
};

const MEMBER_ROLES = new Set<MemberRole>(['owner', 'manager', 'worker']);

export function isNotificationEventType(value: string): value is NotificationEventType {
  return Object.prototype.hasOwnProperty.call(NOTIFICATION_EVENTS, value);
}

/**
 * Applies an organization's stored audience override. Anything malformed falls back
 * to the default, and an override that names nobody also falls back rather than
 * silently muting the event: disabling an event is the rule's `enabled` flag.
 */
export function resolveAudience(defaultAudience: AudienceSpec, override: unknown): AudienceSpec {
  if (typeof override !== 'object' || override === null || Array.isArray(override)) return defaultAudience;
  const candidate = override as { roles?: unknown; permissions?: unknown };

  const roles = Array.isArray(candidate.roles)
    ? candidate.roles.filter((role): role is MemberRole => typeof role === 'string' && MEMBER_ROLES.has(role as MemberRole))
    : defaultAudience.roles;
  const permissions = Array.isArray(candidate.permissions)
    ? candidate.permissions.filter((permission): permission is string => typeof permission === 'string' && /^[a-zA-Z]{2,40}$/.test(permission))
    : defaultAudience.permissions;

  return roles.length || permissions.length ? { roles, permissions } : defaultAudience;
}

export function selectAudience(members: DirectoryMember[], audience: AudienceSpec): DirectoryMember[] {
  const roles = new Set(audience.roles);
  const permissions = new Set(audience.permissions);
  return members.filter(member =>
    roles.has(member.role) || member.permissions.some(permission => permissions.has(permission)),
  );
}

export interface ContactIdentity {
  profileId: string | null;
  firebaseUid: string | null;
}

/** Contacts linked before and after the data backend switch carry different identifiers; either may match. */
export function contactBelongsToMember(contact: ContactIdentity, member: DirectoryMember): boolean {
  return Boolean(
    (contact.profileId && member.profileId && contact.profileId === member.profileId)
    || (contact.firebaseUid && member.firebaseUid && contact.firebaseUid === member.firebaseUid),
  );
}
