begin;

-- A new enum value cannot be referenced in the transaction that adds it, so the
-- communication layer's policies that use these values live in the next migration.
alter type public.app_permission add value if not exists 'messaging';
alter type public.app_permission add value if not exists 'messagingAdmin';

commit;
