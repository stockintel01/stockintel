'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAppStore } from '@/lib/store';
import { inviteMember } from '@/lib/firebase-utils';
import { addDoc, collection, query, where, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Users, MoreHorizontal, Shield, Mail, UserPlus, Clock, Calendar as CalendarIcon } from 'lucide-react';

interface TeamMember {
    id: string;
    name: string;
    email: string;
    role: string;
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

export default function TeamPage() {
    const { user, organization } = useAppStore();
    const [team, setTeam] = useState<TeamMember[]>([]);
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [isInviteOpen, setIsInviteOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('members');
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState('worker');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [shiftUserId, setShiftUserId] = useState('');
    const [shiftDate, setShiftDate] = useState('');
    const [shiftStart, setShiftStart] = useState('08:00');
    const [shiftEnd, setShiftEnd] = useState('16:00');
    const [error, setError] = useState('');

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

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!organization?.id || !inviteEmail) return;

        setIsSubmitting(true);
        setError('');
        try {
            const result = await inviteMember(
                inviteEmail, inviteRole, organization.id,
                organization.name, user?.name
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
                    <p className="text-muted-foreground">Manage access and roles for your organization.</p>
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
                                <form className="flex gap-4 items-end" onSubmit={handleInvite}>
                                    <div className="flex-1 space-y-2">
                                        <label className="text-sm font-medium">Email Address</label>
                                        <Input
                                            placeholder="colleague@company.com"
                                            value={inviteEmail}
                                            onChange={(e) => setInviteEmail(e.target.value)}
                                            type="email"
                                            required
                                        />
                                    </div>
                                    <div className="flex-1 space-y-2">
                                        <label className="text-sm font-medium">Role</label>
                                        <select
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                            value={inviteRole}
                                            onChange={(e) => setInviteRole(e.target.value)}
                                        >
                                            <option value="manager">Manager (Full Access)</option>
                                            <option value="worker">Worker (Limited Access)</option>
                                        </select>
                                    </div>
                                    <Button type="submit" disabled={isSubmitting}>
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
                                        Invite your pharmacists, managers and assistants to collaborate on StockIntel.
                                    </p>
                                    <Button onClick={() => setIsInviteOpen(true)} className="gap-2">
                                        <UserPlus className="w-4 h-4" /> Invite Your First Member
                                    </Button>
                                </div>
                            )}
                            <div className="space-y-1">
                                {team.map((member) => (
                                    <div key={member.id} className="flex items-center justify-between p-3 hover:bg-muted/50 rounded-lg transition-colors group">
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

                                        <div className="flex items-center gap-6">
                                            <div className="flex items-center gap-2 px-3 py-1 bg-secondary rounded-full text-xs font-medium">
                                                <Shield className="w-3 h-3" /> {member.role}
                                            </div>
                                            <div className={`text-xs px-2 py-1 rounded-full ${member.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                                                }`}>
                                                {member.status}
                                            </div>
                                            <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100">
                                                <MoreHorizontal className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
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
