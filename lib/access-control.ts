export const SUPER_ADMIN_EMAILS = [
    'mawuklegodson@gmail.com',
    'enochapafloe@gmail.com',
] as const;

export function isSuperAdminEmail(email?: string | null): boolean {
    return !!email && SUPER_ADMIN_EMAILS.includes(email.toLowerCase() as typeof SUPER_ADMIN_EMAILS[number]);
}
