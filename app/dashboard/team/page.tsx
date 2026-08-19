'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAppStore } from '@/lib/store';
import { inviteMember } from '@/lib/firebase-utils';
import { addDoc, collection, doc, query, where, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Users, Shield, Mail, UserPlus, Clock, Calendar as CalendarIcon, ChevronDown, ChevronUp } from 'lucide-react';
import { authenticatedFetch } from '@/lib/api-client';
import {
    ACCESS_DEFINITIONS,
    ACCESS_PRESETS,
    assignableAccessForRole,
    defaultAccessForRole,
    effectiveAccessForUser,
    normalizeAccessForRole,
    roleLabel,
    userHasAccess,
    type AccessKey,
} from '@/lib/access-permissions';

interface TeamMember {
    id: string;
    name: string;
    email: string;
    role: string;
    access?: AccessKey[];
    status: 'Active' | 'Invited';
}

interface Shift {
    id: string;
    userName: string;
    date: string;
    startTime: string;
    endTime: string;
    status: string;
}

interface MemberDraft {
    role: 'manager' | 'worker';
    access: AccessKey[];
}

export default function TeamPage() {
    const { user, organization } = useAppStore();
    const [team, setTeam] = useState<TeamMember[]>([]);
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [isInviteOpen, setIsInviteOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('members');
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<'manager' | 'worker'>('worker');
    const industry = organization?.industry ?? 'agriculture';
    const defaultPreset = ACCESS_PRESETS[industry][0];
    const [inviteAccess, setInviteAccess] = useState<AccessKey[]>(defaultPreset.access);
    const [invitePresetId, setInvitePresetId] = useState(defaultPreset.id);
    const [showInviteCustomization, setShowInviteCustomization] = useState(false);
    const [editingMemberId, setEditingMemberId] = useState('');
    const [memberDrafts, setMemberDrafts] = useState<Record<string, MemberDraft>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [savingMemberId, setSavingMemberId] = useState('');
    const [savedMemberId, setSavedMemberId] = useState('');
    const [shiftUserId, setShiftUserId] = useState('');
    const [shiftDate, setShiftDate] = useState('');
    const [shiftStart, setShiftStart] = useState('08:00');
    const [shiftEnd, setShiftEnd] = useState('16:00');
    const [error, setError] = useState('');

    useEffect(() => {
        const preset = ACCESS_PRESETS[industry][0];
        setInviteRole(preset.role);
        setInvitePresetId(preset.id);
        setInviteAccess(preset.access.filter(key => userHasAccess(user, key)));
    }, [industry, user]);

    const accessOptionsForRole = (role: 'manager' | 'worker') => assignableAccessForRole(role, industry)
        .filter(key => user?.role === 'owner' || user?.role === 'super_admin' || userHasAccess(user, key));

    // Listen to team members
    useEffect(() => {
        if (!organization?.id) return;

        const usersQuery = query(
            collection(db, 'users'),
            where('organizationId', '==', organization.id)
        );

        const unsubscribe = onSnapshot(usersQuery, (snapshot) => {
            const members: TeamMember[] = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    name: data.displayName || data.name || 'Unknown',
                    email: data.email,
                    role: data.role,
                    access: Array.isArray(data.access) ? data.access : undefined,
                    status: 'Active'
                };
            });
            setTeam(members);
        });

        return () => unsubscribe();
    }, [organization?.id]);

    useEffect(() => {
        if (!organization?.id) return;
        return onSnapshot(collection(db, `organizations/${organization.id}/shifts`), snapshot => {
            setShifts(snapshot.docs.map(shift => ({ id: shift.id, ...shift.data() } as Shift)));
        });
    }, [organization?.id]);

    const [inviteLink, setInviteLink] = useState('');
    const [copied, setCopied] = useState(false);

    const copyLink = () => {
        navigator.clipboard.writeText(inviteLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const toggleInviteAccess = (key: AccessKey) => {
        setInvitePresetId('');
        setInviteAccess(prev => prev.includes(key) ? prev.filter(item => item !== key) : [...prev, key]);
    };

    const applyPreset = (presetId: string) => {
        const preset = ACCESS_PRESETS[industry].find(item => item.id === presetId);
        if (!preset) return;
        setInvitePresetId(preset.id);
        setInviteRole(preset.role);
        setInviteAccess(preset.access.filter(key => accessOptionsForRole(preset.role).includes(key)));
    };

    const changeInviteRole = (role: 'manager' | 'worker') => {
        const preset = ACCESS_PRESETS[industry].find(item => item.role === role);
        setInviteRole(role);
        setInvitePresetId(preset?.id ?? '');
        setInviteAccess((preset?.access ?? defaultAccessForRole(role, industry))
            .filter(key => accessOptionsForRole(role).includes(key)));
    };

    const updateMemberAccess = async (member: TeamMember, updates: { role?: 'manager' | 'worker'; access?: AccessKey[] }): Promise<boolean> => {
        if (member.role === 'owner' || member.role === 'super_admin') return false;
        setError('');
        setSavedMemberId('');
        setSavingMemberId(member.id);
        const role = updates.role ?? (member.role === 'manager' ? 'manager' : 'worker');
        const access = updates.access ?? member.access ?? [];
        try {
            const response = await authenticatedFetch(`/api/team/${encodeURIComponent(member.id)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role, access }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error ?? 'Unable to update member access');
            setTeam(current => current.map(item => item.id === member.id ? { ...item, role, access } : item));
            setSavedMemberId(member.id);
        } catch (err) {
            const message = err instanceof Error ? err.message.toLowerCase() : '';
            const canFallback = message.includes('firebase admin') ||
                message.includes('default credentials') ||
                message.includes('unable to load your user profile') ||
                message.includes('authentication token') ||
                message.includes('service account');
            if (!canFallback || !organization?.id) {
                setError(err instanceof Error ? err.message : 'Unable to update member access');
                return false;
            }
            try {
                await setDoc(doc(db, 'users', member.id), {
                    role,
                    access,
                    updatedAt: serverTimestamp(),
                }, { merge: true });
                await setDoc(doc(db, `users/${member.id}/memberships/${organization.id}`), {
                    role,
                    access,
                    updatedAt: serverTimestamp(),
                }, { merge: true });
                await setDoc(doc(db, `organizations/${organization.id}/members/${member.id}`), {
                    role,
                    access,
                    updatedAt: serverTimestamp(),
                }, { merge: true }).catch(() => undefined);
                setTeam(current => current.map(item => item.id === member.id ? { ...item, role, access } : item));
                setSavedMemberId(member.id);
            } catch (fallbackErr) {
                setError(fallbackErr instanceof Error ? fallbackErr.message : 'Unable to update member access');
                return false;
            }
        } finally {
            setSavingMemberId('');
            setTimeout(() => setSavedMemberId(current => current === member.id ? '' : current), 2500);
        }
        return true;
    };

    const beginEditingMember = (member: TeamMember) => {
        const role = member.role === 'manager' ? 'manager' : 'worker';
        setMemberDrafts(current => ({
            ...current,
            [member.id]: { role, access: effectiveAccessForUser({ role, access: member.access }, industry) },
        }));
        setEditingMemberId(member.id);
    };

    const changeMemberRole = (member: TeamMember, role: 'manager' | 'worker') => {
        setMemberDrafts(current => ({
            ...current,
            [member.id]: {
                role,
                access: normalizeAccessForRole(current[member.id]?.access ?? [], industry, role)
                    .filter(key => accessOptionsForRole(role).includes(key)),
            },
        }));
    };

    const applyMemberPreset = (member: TeamMember, presetId: string) => {
        const preset = ACCESS_PRESETS[industry].find(item => item.id === presetId);
        if (!preset) return;
        setMemberDrafts(current => ({
            ...current,
            [member.id]: {
                role: preset.role,
                access: preset.access.filter(key => accessOptionsForRole(preset.role).includes(key)),
            },
        }));
    };

    const toggleMemberDraftAccess = (member: TeamMember, key: AccessKey) => {
        setMemberDrafts(current => {
            const draft = current[member.id];
            if (!draft) return current;
            return {
                ...current,
                [member.id]: {
                    ...draft,
                    access: draft.access.includes(key) ? draft.access.filter(item => item !== key) : [...draft.access, key],
                },
            };
        });
    };

    const saveMemberDraft = async (member: TeamMember) => {
        const draft = memberDrafts[member.id];
        if (!draft) return;
        if (await updateMemberAccess(member, draft)) setEditingMemberId('');
    };

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!organization?.id || !inviteEmail) return;

        setIsSubmitting(true);
        setError('');
        try {
            const result = await inviteMember(
                inviteEmail, inviteRole, organization.id,
                organization.name, user?.name, inviteAccess
            );
            setInviteLink(result.inviteLink);
            setInviteEmail('');
        } catch (error) {
            console.error('Error inviting member:', error);
            setError(error instanceof Error ? error.message : 'Failed to send invitation');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAssignShift = async (event: React.FormEvent) => {
        event.preventDefault();
        const member = team.find(item => item.id === shiftUserId);
        if (!organization?.id || !member || !shiftDate) {
            setError('Select a staff member and date.');
            return;
        }
        setIsSubmitting(true);
        setError('');
        try {
            await addDoc(collection(db, `organizations/${organization.id}/shifts`), {
                userId: member.id, userName: member.name, date: shiftDate,
                startTime: shiftStart, endTime: shiftEnd, status: 'Scheduled',
                createdBy: user?.id ?? '', createdAt: serverTimestamp(),
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to assign shift');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Team Management</h1>
                    <p className="text-muted-foreground">Manage access and roles for your organization. Changes save automatically.</p>
                </div>
                <Button onClick={() => setIsInviteOpen(!isInviteOpen)} disabled={!user || !['owner', 'manager', 'super_admin'].includes(user.role)}>
                    <UserPlus className="w-4 h-4 mr-2" /> Invite Member
                </Button>
            </div>
            {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

            {/* Tabs Navigation */}
            <div className="flex border-b border-border mb-6">
                <button
                    onClick={() => setActiveTab('members')}
                    className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'members' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                >
                    Team Members
                </button>
                <button
                    onClick={() => setActiveTab('shifts')}
                    className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'shifts' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                >
                    Staff Shifts
                </button>
            </div>

            {activeTab === 'members' ? (
                <>
                    {isInviteOpen && (
                        <Card className="animate-in slide-in-from-top-4 mb-6">
                            <CardHeader>
                                <CardTitle className="text-lg">Invite New Member</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <form className="grid gap-4" onSubmit={handleInvite}>
                                    <div className="grid gap-4 lg:grid-cols-3">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Email Address</label>
                                        <Input
                                            placeholder="colleague@company.com"
                                            value={inviteEmail}
                                            onChange={(e) => setInviteEmail(e.target.value)}
                                            type="email"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Access Template</label>
                                        <select
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                            onChange={(e) => applyPreset(e.target.value)}
                                            value={invitePresetId}
                                        >
                                            <option value="" disabled>Custom access</option>
                                            {ACCESS_PRESETS[industry].map(preset => (
                                                <option key={preset.id} value={preset.id}>{preset.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Role</label>
                                        <select
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                            value={inviteRole}
                                            onChange={(e) => changeInviteRole(e.target.value as 'manager' | 'worker')}
                                        >
                                            <option value="manager">Manager</option>
                                            <option value="worker">Team member</option>
                                        </select>
                                    </div>
                                    </div>
                                    <div className="rounded-xl border bg-muted/20 p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-semibold">
                                                    {ACCESS_PRESETS[industry].find(item => item.id === invitePresetId)?.label ?? 'Custom access'}
                                                </p>
                                                <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
                                                    {ACCESS_PRESETS[industry].find(item => item.id === invitePresetId)?.description ?? 'A customized set of farm tools.'}
                                                </p>
                                            </div>
                                            <Button type="button" variant="outline" size="sm" onClick={() => setShowInviteCustomization(value => !value)}>
                                                {showInviteCustomization ? <ChevronUp className="mr-1 h-4 w-4" /> : <ChevronDown className="mr-1 h-4 w-4" />}
                                                Customize
                                            </Button>
                                        </div>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {inviteAccess.map(key => <span key={key} className="rounded-full bg-background px-2.5 py-1 text-xs font-medium">{ACCESS_DEFINITIONS[key].label}</span>)}
                                        </div>
                                        {showInviteCustomization && <div className="mt-4 grid gap-2 border-t pt-4 sm:grid-cols-2 lg:grid-cols-3">
                                            {accessOptionsForRole(inviteRole).map(key => {
                                                const item = ACCESS_DEFINITIONS[key];
                                                const checked = inviteAccess.includes(key);
                                                return (
                                                    <label key={key} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition ${checked ? 'border-primary bg-primary/5' : 'bg-background hover:bg-muted/40'}`}>
                                                        <input type="checkbox" className="mt-1" checked={checked} onChange={() => toggleInviteAccess(key)} />
                                                        <span>
                                                            <span className="block font-medium">{item.label}</span>
                                                            <span className="text-xs text-muted-foreground">{item.description}</span>
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                        </div>}
                                        <p className="mt-3 text-xs text-muted-foreground">Billing and owner rewards cannot be delegated. Managers can only grant permissions they hold themselves.</p>
                                    </div>
                                    <Button type="submit" disabled={isSubmitting || inviteAccess.length === 0} className="justify-self-start">
                                        {isSubmitting ? 'Sending...' : 'Send Invitation'}
                                    </Button>
                                </form>
                                {inviteLink && (
                                    <div className="mt-4 p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                                        <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-2">✓ Invite created — share this link:</p>
                                        <div className="flex items-center gap-2">
                                            <code className="flex-1 text-xs bg-white dark:bg-black/20 border rounded px-2 py-1.5 truncate text-emerald-800 dark:text-emerald-300">
                                                {inviteLink}
                                            </code>
                                            <Button size="sm" variant="outline" onClick={copyLink}>
                                                {copied ? '✓ Copied' : 'Copy'}
                                            </Button>
                                        </div>
                                        <p className="text-xs text-emerald-600/70 mt-2">Send this link to the invitee. It expires once accepted.</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    <Card>
                        <CardHeader>
                            <CardTitle>Active Members ({team.length})</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {team.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-16 text-center">
                                    <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                                        <Users className="w-8 h-8 text-muted-foreground/50" />
                                    </div>
                                    <h3 className="font-semibold text-lg mb-2">No team members yet</h3>
                                    <p className="text-muted-foreground text-sm max-w-xs mb-6">
                                        Invite farm managers, stock keepers, packhouse supervisors, and field workers to collaborate on StockIntel.
                                    </p>
                                    <Button onClick={() => setIsInviteOpen(true)} className="gap-2">
                                        <UserPlus className="w-4 h-4" /> Invite Your First Member
                                    </Button>
                                </div>
                            )}
                            <div className="space-y-1">
                                {team.map((member) => {
                                    const editable = !['owner', 'super_admin'].includes(member.role);
                                    const memberRole = member.role === 'manager' ? 'manager' : 'worker';
                                    const draft = memberDrafts[member.id];
                                    const enabledAccess = editable
                                        ? effectiveAccessForUser({ role: memberRole, access: member.access }, industry)
                                        : [];
                                    const isEditing = editingMemberId === member.id && !!draft;
                                    return (
                                    <div key={member.id} className="rounded-xl border p-4 transition-colors hover:bg-muted/30">
                                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                                                    {member.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <div className="font-medium">{member.name}</div>
                                                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                                                        <Mail className="w-3 h-3" /> {member.email}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2">
                                                <div className="flex items-center gap-2 px-3 py-1 bg-secondary rounded-full text-xs font-medium">
                                                    <Shield className="w-3 h-3" /> {roleLabel(member.role as 'super_admin' | 'owner' | 'manager' | 'worker')}
                                                </div>
                                                <div className={`text-xs px-2 py-1 rounded-full ${member.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                                    {member.status}
                                                </div>
                                                {savingMemberId === member.id && <div className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">Saving...</div>}
                                                {savedMemberId === member.id && <div className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">Saved</div>}
                                                {editable && <Button variant="outline" size="sm" onClick={() => isEditing ? setEditingMemberId('') : beginEditingMember(member)}>
                                                    {isEditing ? 'Close' : 'Manage access'}
                                                </Button>}
                                            </div>
                                        </div>
                                        {editable && !isEditing && (
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {enabledAccess.map(key => <span key={key} className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{ACCESS_DEFINITIONS[key].label}</span>)}
                                            </div>
                                        )}
                                        {editable && isEditing && draft && (
                                            <div className="mt-4 rounded-xl border bg-muted/20 p-4">
                                                <div className="grid gap-4 md:grid-cols-2">
                                                    <div className="space-y-2">
                                                        <label className="text-sm font-medium">Apply role template</label>
                                                        <select className="flex h-10 w-full rounded-md border bg-background px-3 text-sm" defaultValue="" onChange={event => applyMemberPreset(member, event.target.value)}>
                                                            <option value="" disabled>Select a recommended template</option>
                                                            {ACCESS_PRESETS[industry].map(preset => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
                                                        </select>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-sm font-medium">Account level</label>
                                                        <select className="flex h-10 w-full rounded-md border bg-background px-3 text-sm" value={draft.role} onChange={event => changeMemberRole(member, event.target.value as 'manager' | 'worker')}>
                                                            <option value="manager">Manager</option>
                                                            <option value="worker">Team member</option>
                                                        </select>
                                                    </div>
                                                </div>
                                                <div className="mt-4 grid gap-2 border-t pt-4 sm:grid-cols-2 xl:grid-cols-3">
                                                {accessOptionsForRole(draft.role).map(key => {
                                                    const item = ACCESS_DEFINITIONS[key];
                                                    const checked = draft.access.includes(key);
                                                    return (
                                                        <label key={key} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition ${checked ? 'border-primary bg-primary/5' : 'bg-background hover:bg-muted/40'}`}>
                                                            <input type="checkbox" className="mt-1" checked={checked} onChange={() => toggleMemberDraftAccess(member, key)} />
                                                            <span>
                                                                <span className="block font-medium">{item.label}</span>
                                                                <span className="text-xs text-muted-foreground">{item.description}</span>
                                                            </span>
                                                        </label>
                                                    );
                                                })}
                                                </div>
                                                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                                                    <p className="text-xs text-muted-foreground">Changes take effect on the member&apos;s screen immediately after saving.</p>
                                                    <div className="flex gap-2">
                                                        <Button type="button" variant="outline" onClick={() => setEditingMemberId('')}>Cancel</Button>
                                                        <Button type="button" disabled={savingMemberId === member.id || draft.access.length === 0} onClick={() => void saveMemberDraft(member)}>
                                                            {savingMemberId === member.id ? 'Saving...' : 'Save access'}
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>
                </>
            ) : (
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Assign New Shift</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form className="grid sm:grid-cols-4 gap-4 items-end" onSubmit={handleAssignShift}>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Staff Member</label>
                                    <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={shiftUserId} onChange={event => setShiftUserId(event.target.value)} required>
                                        <option value="">Select staff</option>
                                        {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Date</label>
                                    <Input type="date" value={shiftDate} onChange={event => setShiftDate(event.target.value)} required />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Time Slot (Start - End)</label>
                                    <div className="flex gap-2">
                                        <Input type="time" value={shiftStart} onChange={event => setShiftStart(event.target.value)} required />
                                        <Input type="time" value={shiftEnd} onChange={event => setShiftEnd(event.target.value)} required />
                                    </div>
                                </div>
                                <Button disabled={isSubmitting}>{isSubmitting ? 'Assigning...' : 'Assign Shift'}</Button>
                            </form>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Upcoming & Active Shifts</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="relative overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
                                        <tr>
                                            <th className="px-4 py-3">Staff</th>
                                            <th className="px-4 py-3">Date</th>
                                            <th className="px-4 py-3">Shift Time</th>
                                            <th className="px-4 py-3">Status</th>
                                            <th className="px-4 py-3">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {shifts.map((shift) => (
                                            <tr key={shift.id} className="hover:bg-muted/50 transition-colors">
                                                <td className="px-4 py-3 font-medium">{shift.userName}</td>
                                                <td className="px-4 py-3 flex items-center gap-2">
                                                    <CalendarIcon className="w-3 h-3 text-muted-foreground" />
                                                    {shift.date}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <Clock className="w-3 h-3 text-muted-foreground" />
                                                        {shift.startTime} - {shift.endTime}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold ${shift.status === 'On Duty' ? 'bg-green-100 text-green-700' :
                                                        shift.status === 'Scheduled' ? 'bg-blue-100 text-blue-700' :
                                                            'bg-gray-100 text-gray-700'
                                                        }`}>
                                                        {shift.status}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <Button variant="ghost" size="sm">Edit</Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

        </div>
    );
}
