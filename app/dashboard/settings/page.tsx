'use client';

import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { User, Globe, Lock, Scroll, Leaf, MapPin, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';
import { doc, updateDoc } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import {
    agricultureProfileLabel,
    buildAgricultureProfile,
    DEFAULT_SIGATOKA_CONFIGURATION,
    getAgricultureProfile,
    parseAgricultureList,
    type AgricultureOperation,
} from '@/lib/agric/config';

export default function SettingsPage() {
    const { user, organization, currency, setCurrency, taxSettings, updateTaxSettings, setStoreUser } = useAppStore();
    const [successMsg, setSuccessMsg] = useState('');
    const [name, setName] = useState(user?.name ?? '');
    const [businessName, setBusinessName] = useState(organization?.name ?? '');
    const [saving, setSaving] = useState(false);
    const [agricultureProfile, setAgricultureProfile] = useState(() => getAgricultureProfile(organization?.settings));
    const [farmZonesInput, setFarmZonesInput] = useState(() => getAgricultureProfile(organization?.settings).farmZones.join(', '));
    const [cropTypesInput, setCropTypesInput] = useState(() => getAgricultureProfile(organization?.settings).cropTypes.join(', '));
    const [livestockTypesInput, setLivestockTypesInput] = useState(() => getAgricultureProfile(organization?.settings).livestockTypes.join(', '));
    const [locating, setLocating] = useState(false);
    const [savingAgriculture, setSavingAgriculture] = useState(false);
    const [newMonitoringPlot, setNewMonitoringPlot] = useState({ name: '', sectorName: '', area: '' });

    const toggleAgricultureOperation = (operation: AgricultureOperation) => {
        const selected = agricultureProfile.operationTypes.includes(operation);
        const next = selected
            ? agricultureProfile.operationTypes.filter(item => item !== operation)
            : [...agricultureProfile.operationTypes, operation];
        setAgricultureProfile(buildAgricultureProfile(next, agricultureProfile));
    };

    const useCurrentLocation = () => {
        if (!navigator.geolocation) {
            setSuccessMsg('Location services are not supported by this browser.');
            return;
        }
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            position => {
                setAgricultureProfile(profile => ({
                    ...profile,
                    location: {
                        name: profile.location?.name || 'Main Farm',
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    },
                }));
                setLocating(false);
            },
            () => {
                setSuccessMsg('Could not access your location. Check browser location permissions.');
                setLocating(false);
            },
            { enableHighAccuracy: true, timeout: 15000 },
        );
    };

    const handleSave = async () => {
        if (!user || !auth.currentUser) return;
        setSaving(true);
        try {
            await Promise.all([
                updateProfile(auth.currentUser, { displayName: name.trim() }),
                updateDoc(doc(db, 'users', user.id), { displayName: name.trim(), updatedAt: new Date() }),
                organization?.id ? updateDoc(doc(db, 'organizations', organization.id), {
                    name: businessName.trim() || organization.name,
                    currency,
                    settings: {
                        ...(organization.settings ?? {}),
                        tax: taxSettings,
                    },
                    updatedAt: new Date(),
                }) : Promise.resolve(),
            ]);
            setStoreUser({ ...user, name: name.trim() }, organization ? {
                ...organization,
                name: businessName.trim() || organization.name,
                currency,
                settings: {
                    ...(organization.settings ?? {}),
                    tax: taxSettings,
                },
            } : null);
            setSuccessMsg('Settings saved!');
            setTimeout(() => setSuccessMsg(''), 3000);
        } catch { setSuccessMsg('Failed to save. Try again.'); }
        finally { setSaving(false); }
    };

    const handleAgricultureSave = async () => {
        if (!organization?.id || !user) return;
        const sigatoka = agricultureProfile.sigatoka;
        const thresholds = [sigatoka.riskThresholds.watch, sigatoka.riskThresholds.high, sigatoka.riskThresholds.critical].filter((value): value is number => value !== null);
        if (sigatoka.enabled && (!sigatoka.sectorLabel.trim() || !sigatoka.plotLabel.trim() || !sigatoka.plantLabel.trim())) {
            setSuccessMsg('Sigatoka terminology labels cannot be blank.');
            return;
        }
        if (sigatoka.enabled && sigatoka.areaUnit === 'custom' && !sigatoka.customAreaUnitName.trim()) {
            setSuccessMsg('Enter a name for the custom area unit.');
            return;
        }
        if (thresholds.some((value, index) => index > 0 && value <= thresholds[index - 1])) {
            setSuccessMsg('SED thresholds must increase from Watch to High to Critical.');
            return;
        }
        setSavingAgriculture(true);
        try {
            const normalizedProfile = {
                ...agricultureProfile,
                farmZones: parseAgricultureList(farmZonesInput),
                cropTypes: parseAgricultureList(cropTypesInput),
                livestockTypes: parseAgricultureList(livestockTypesInput),
            };
            const settings = { ...(organization.settings ?? {}), agriculture: normalizedProfile };
            await updateDoc(doc(db, 'organizations', organization.id), { settings, updatedAt: new Date() });
            setStoreUser(user, { ...organization, settings });
            setAgricultureProfile(normalizedProfile);
            setFarmZonesInput(normalizedProfile.farmZones.join(', '));
            setCropTypesInput(normalizedProfile.cropTypes.join(', '));
            setLivestockTypesInput(normalizedProfile.livestockTypes.join(', '));
            setSuccessMsg('Agriculture workspace saved.');
            setTimeout(() => setSuccessMsg(''), 3000);
        } catch {
            setSuccessMsg('Failed to save agriculture workspace.');
        } finally {
            setSavingAgriculture(false);
        }
    };

    const addFarmLocation = () => {
        const location = agricultureProfile.location;
        if (!location?.name || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return;
        setAgricultureProfile(profile => ({
            ...profile,
            locations: [...profile.locations.filter(item => item.name.toLowerCase() !== location.name.toLowerCase()), location],
        }));
    };

    const setSigatokaEnabled = (enabled: boolean) => {
        setAgricultureProfile(profile => ({
            ...profile,
            sigatoka: { ...profile.sigatoka, enabled },
            modules: { ...profile.modules, sigatoka: enabled && profile.operationTypes.includes('crop') },
        }));
    };

    const optionalThreshold = (value: string): number | null => value === '' ? null : Math.max(0, Number(value));

    const addMonitoringPlot = () => {
        const name = newMonitoringPlot.name.trim();
        const sectorName = newMonitoringPlot.sectorName.trim();
        if (!name || !sectorName) { setSuccessMsg('Enter both the monitoring plot and sector names.'); return; }
        if (agricultureProfile.sigatoka.monitoringPlots.some(plot => plot.name.toLowerCase() === name.toLowerCase() && plot.status === 'active')) { setSuccessMsg('That monitoring plot already exists.'); return; }
        const id = crypto.randomUUID();
        const enrolledAt = new Date().toISOString().slice(0, 10);
        const sentinels = Array.from({ length: agricultureProfile.sigatoka.samplePlantCount }, (_, index) => ({ id: crypto.randomUUID(), code: `${name}-${String(index + 1).padStart(2, '0')}`, status: 'active' as const, enrolledAt }));
        setAgricultureProfile(profile => ({ ...profile, sigatoka: { ...profile.sigatoka, monitoringPlots: [...profile.sigatoka.monitoringPlots, { id, name, sectorName, status: 'active', area: optionalThreshold(newMonitoringPlot.area), sentinels }] } }));
        setNewMonitoringPlot({ name: '', sectorName, area: '' });
    };

    const retireMonitoringPlot = (plotId: string) => setAgricultureProfile(profile => ({ ...profile, sigatoka: { ...profile.sigatoka, monitoringPlots: profile.sigatoka.monitoringPlots.map(plot => plot.id === plotId ? { ...plot, status: 'retired' as const, sentinels: plot.sentinels.map(plant => plant.status === 'active' ? { ...plant, status: 'retired' as const, retiredAt: new Date().toISOString().slice(0, 10), retirementReason: 'Plot retired' } : plant) } : plot) } }));

    const replaceSentinel = (plotId: string, sentinelId: string) => setAgricultureProfile(profile => ({ ...profile, sigatoka: { ...profile.sigatoka, monitoringPlots: profile.sigatoka.monitoringPlots.map(plot => {
        if (plot.id !== plotId) return plot;
        const retiring = plot.sentinels.find(plant => plant.id === sentinelId);
        if (!retiring || retiring.status !== 'active') return plot;
        const sequence = plot.sentinels.length + 1;
        return { ...plot, sentinels: [...plot.sentinels.map(plant => plant.id === sentinelId ? { ...plant, status: 'retired' as const, retiredAt: new Date().toISOString().slice(0, 10), retirementReason: 'Replaced after flowering or field change' } : plant), { id: crypto.randomUUID(), code: `${plot.name}-${String(sequence).padStart(2, '0')}`, status: 'active' as const, enrolledAt: new Date().toISOString().slice(0, 10), replacementOf: sentinelId }] };
    }) } }));

    return (
        <div className="max-w-4xl space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
                <p className="text-muted-foreground">Manage your profile, preferences, and workspace settings.</p>
            </div>

            <div className="grid gap-8">
                {/* Profile Section */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <User className="w-5 h-5" /> Profile Settings
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Full Name</Label>
                                <Input value={name} onChange={event => setName(event.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>Email Address</Label>
                                <Input defaultValue={user?.email} disabled className="bg-muted" />
                            </div>
                        </div>
                        <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Profile & General Settings'}</Button>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Organization Identity</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2 max-w-lg">
                            <Label>Business / Organization Name</Label>
                            <Input value={businessName} onChange={event => setBusinessName(event.target.value)} placeholder="Enter the registered or trading name" />
                            <p className="text-sm text-muted-foreground">This name appears throughout dashboards, reports, navigation, and team workspaces.</p>
                        </div>
                        <Button onClick={handleSave} disabled={saving || !businessName.trim()}>{saving ? 'Saving...' : 'Save Organization Name'}</Button>
                    </CardContent>
                </Card>

                {organization?.industry === 'agriculture' && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Leaf className="w-5 h-5 text-green-600" /> Agriculture Workspace
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            <div>
                                <Label className="text-base">Farm operations</Label>
                                <p className="text-sm text-muted-foreground mb-3">
                                    Current workspace: {agricultureProfileLabel(agricultureProfile)}
                                </p>
                                <div className="grid sm:grid-cols-3 gap-3">
                                    {([
                                        ['crop', 'Crop Production'],
                                        ['livestock', 'Animal Production'],
                                        ['poultry', 'Poultry'],
                                    ] as Array<[AgricultureOperation, string]>).map(([operation, label]) => (
                                        <label key={operation} className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={agricultureProfile.operationTypes.includes(operation)}
                                                onChange={() => toggleAgricultureOperation(operation)}
                                                className="w-4 h-4"
                                            />
                                            <span className="text-sm font-medium">{label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="grid md:grid-cols-3 gap-3">
                                <div className="space-y-2">
                                    <Label>Farm zones / fields</Label>
                                    <Input
                                        placeholder="North Field, Poultry Block"
                                        value={farmZonesInput}
                                        onChange={event => setFarmZonesInput(event.target.value)}
                                    />
                                    <p className="text-xs text-muted-foreground">Separate names with commas. Spaces and punctuation inside a name are accepted.</p>
                                </div>
                                <div className="space-y-2">
                                    <Label>Crop types</Label>
                                    <Input
                                        placeholder="Maize, Tomato, Cocoa"
                                        value={cropTypesInput}
                                        onChange={event => setCropTypesInput(event.target.value)}
                                    />
                                    <p className="text-xs text-muted-foreground">Example: Maize, Cherry Tomato, Cocoa</p>
                                </div>
                                <div className="space-y-2">
                                    <Label>Animal types</Label>
                                    <Input
                                        placeholder="Layers, Broilers, Cattle"
                                        value={livestockTypesInput}
                                        onChange={event => setLivestockTypesInput(event.target.value)}
                                    />
                                    <p className="text-xs text-muted-foreground">Example: Layers, Broilers, Dairy Cattle</p>
                                </div>
                            </div>

                            {agricultureProfile.operationTypes.includes('crop') && (
                                <div className="border-t pt-5 space-y-4">
                                    <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                                        <div>
                                            <Label className="text-base">Sigatoka monitoring</Label>
                                            <p className="text-sm text-muted-foreground">Enable field scouting, SED calculations, trend analysis, and plot-level records.</p>
                                        </div>
                                        <input type="checkbox" className="h-5 w-5" checked={agricultureProfile.sigatoka.enabled} onChange={event => setSigatokaEnabled(event.target.checked)} />
                                    </div>

                                    {agricultureProfile.sigatoka.enabled && (
                                        <>
                                            <div>
                                                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><Label className="text-base">Your farm terminology</Label><p className="text-sm text-muted-foreground">Use familiar organization names. The standard meaning remains visible so customized labels do not become confusing.</p></div><Button type="button" size="sm" variant="outline" onClick={() => setAgricultureProfile(profile => ({ ...profile, sigatoka: { ...profile.sigatoka, sectorLabel: DEFAULT_SIGATOKA_CONFIGURATION.sectorLabel, plotLabel: DEFAULT_SIGATOKA_CONFIGURATION.plotLabel, plantLabel: DEFAULT_SIGATOKA_CONFIGURATION.plantLabel } }))}>Restore standard labels</Button></div>
                                                <div className="grid gap-3 md:grid-cols-3">
                                                    <div className="space-y-2"><Label>Sector label</Label><Input value={agricultureProfile.sigatoka.sectorLabel} onChange={event => setAgricultureProfile(profile => ({ ...profile, sigatoka: { ...profile.sigatoka, sectorLabel: event.target.value } }))} placeholder="Sector, Estate, Farm" /><p className="text-xs text-muted-foreground">Standard meaning: Sector or farm division</p></div>
                                                    <div className="space-y-2"><Label>Plot area label</Label><Input value={agricultureProfile.sigatoka.plotLabel} onChange={event => setAgricultureProfile(profile => ({ ...profile, sigatoka: { ...profile.sigatoka, plotLabel: event.target.value } }))} placeholder="Plot, Block, Field" /><p className="text-xs text-muted-foreground">Standard meaning: Monitoring plot or field block</p></div>
                                                    <div className="space-y-2"><Label>Plant label</Label><Input value={agricultureProfile.sigatoka.plantLabel} onChange={event => setAgricultureProfile(profile => ({ ...profile, sigatoka: { ...profile.sigatoka, plantLabel: event.target.value } }))} placeholder="Sentinel plant" /><p className="text-xs text-muted-foreground">Standard meaning: Sentinel plant being observed</p></div>
                                                </div>
                                            </div>

                                            <div className="grid gap-3 md:grid-cols-3">
                                                <div className="space-y-2">
                                                    <Label>Default area unit</Label>
                                                    <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={agricultureProfile.sigatoka.areaUnit} onChange={event => setAgricultureProfile(profile => ({ ...profile, sigatoka: { ...profile.sigatoka, areaUnit: event.target.value as typeof profile.sigatoka.areaUnit } }))}>
                                                        <option value="hectare">Hectare (ha)</option><option value="acre">Acre (ac)</option><option value="square_metre">Square metre (m2)</option><option value="custom">Custom unit</option>
                                                    </select>
                                                </div>
                                                <div className="space-y-2"><Label>Plants per observation</Label><Input type="number" min={1} max={30} value={agricultureProfile.sigatoka.samplePlantCount} onChange={event => setAgricultureProfile(profile => ({ ...profile, sigatoka: { ...profile.sigatoka, samplePlantCount: Math.min(30, Math.max(1, Number(event.target.value) || 10)) } }))} /></div>
                                                <div className="space-y-2"><Label>Initial FER baseline</Label><Input type="number" min={0} step="0.01" value={agricultureProfile.sigatoka.initialFerBaseline} onChange={event => setAgricultureProfile(profile => ({ ...profile, sigatoka: { ...profile.sigatoka, initialFerBaseline: Math.max(0, Number(event.target.value) || 0) } }))} /></div>
                                            </div>

                                            {agricultureProfile.sigatoka.areaUnit === 'custom' && (
                                                <div className="grid gap-3 rounded-lg bg-muted/40 p-4 md:grid-cols-2">
                                                    <div className="space-y-2"><Label>Custom area unit name</Label><Input value={agricultureProfile.sigatoka.customAreaUnitName} onChange={event => setAgricultureProfile(profile => ({ ...profile, sigatoka: { ...profile.sigatoka, customAreaUnitName: event.target.value } }))} placeholder="e.g. local plot unit" /></div>
                                                    <div className="space-y-2"><Label>Square metres in one custom unit</Label><Input type="number" min={0.0001} step="any" value={agricultureProfile.sigatoka.customAreaSquareMetres} onChange={event => setAgricultureProfile(profile => ({ ...profile, sigatoka: { ...profile.sigatoka, customAreaSquareMetres: Math.max(0.0001, Number(event.target.value) || 1) } }))} /></div>
                                                </div>
                                            )}

                                            <div>
                                                <Label className="text-base">Organization SED attention thresholds</Label>
                                                <p className="mb-3 text-sm text-muted-foreground">Optional operational thresholds. Leave blank until an agronomist approves values for your production system.</p>
                                                <div className="grid gap-3 md:grid-cols-3">
                                                    {(['watch', 'high', 'critical'] as const).map(level => <div key={level} className="space-y-2"><Label className="capitalize">{level}</Label><Input type="number" min={0} placeholder="Not configured" value={agricultureProfile.sigatoka.riskThresholds[level] ?? ''} onChange={event => setAgricultureProfile(profile => ({ ...profile, sigatoka: { ...profile.sigatoka, riskThresholds: { ...profile.sigatoka.riskThresholds, [level]: optionalThreshold(event.target.value) } } }))} /></div>)}
                                                </div>
                                            </div>

                                            <div className="space-y-3 rounded-xl border p-4">
                                                <div><Label className="text-base">Monitoring plot and sentinel registry</Label><p className="text-sm text-muted-foreground">Register active plots once. Sentinel identities are preserved when a plant flowers, is removed, or is replaced.</p></div>
                                                <div className="grid gap-3 md:grid-cols-4">
                                                    <Input placeholder={`${agricultureProfile.sigatoka.plotLabel} name`} value={newMonitoringPlot.name} onChange={event => setNewMonitoringPlot(value => ({ ...value, name: event.target.value }))} />
                                                    <Input placeholder={`${agricultureProfile.sigatoka.sectorLabel} name`} value={newMonitoringPlot.sectorName} onChange={event => setNewMonitoringPlot(value => ({ ...value, sectorName: event.target.value }))} />
                                                    <Input type="number" min={0} step="any" placeholder={`Area (${agricultureProfile.sigatoka.areaUnit})`} value={newMonitoringPlot.area} onChange={event => setNewMonitoringPlot(value => ({ ...value, area: event.target.value }))} />
                                                    <Button type="button" variant="outline" onClick={addMonitoringPlot}><Plus className="mr-2 h-4 w-4" />Add plot</Button>
                                                </div>
                                                <div className="space-y-2">{agricultureProfile.sigatoka.monitoringPlots.map(plot => <div key={plot.id} className={`rounded-lg border p-3 ${plot.status === 'retired' ? 'bg-muted/40 opacity-70' : ''}`}><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{plot.sectorName} / {plot.name}</p><p className="text-xs text-muted-foreground">{plot.sentinels.filter(plant => plant.status === 'active').length} active sentinels · {plot.status}</p></div>{plot.status === 'active' && <Button type="button" size="sm" variant="outline" onClick={() => retireMonitoringPlot(plot.id)}>Retire plot</Button>}</div>{plot.status === 'active' && <div className="mt-3 flex flex-wrap gap-2">{plot.sentinels.filter(plant => plant.status === 'active').map(plant => <Button key={plant.id} type="button" size="sm" variant="ghost" className="h-8 border" title="Retire and create a linked replacement" onClick={() => replaceSentinel(plot.id, plant.id)}>{plant.code} · Replace</Button>)}</div>}</div>)}{agricultureProfile.sigatoka.monitoringPlots.length === 0 && <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">No dedicated monitoring plots yet. Add one to create traceable sentinel plant IDs.</p>}</div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            <div className="border-t pt-5 space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <Label className="text-base flex items-center gap-2"><MapPin className="w-4 h-4" /> Main farm location</Label>
                                        <p className="text-sm text-muted-foreground">Used for live weather and farm advice.</p>
                                    </div>
                                    <Button variant="outline" onClick={useCurrentLocation} disabled={locating}>
                                        {locating ? 'Locating...' : 'Use Current Location'}
                                    </Button>
                                </div>
                                <div className="grid md:grid-cols-3 gap-3">
                                    <Input
                                        placeholder="Main Farm"
                                        value={agricultureProfile.location?.name ?? ''}
                                        onChange={event => setAgricultureProfile(profile => ({
                                            ...profile,
                                            location: {
                                                name: event.target.value,
                                                latitude: profile.location?.latitude ?? 0,
                                                longitude: profile.location?.longitude ?? 0,
                                                timezone: profile.location?.timezone,
                                            },
                                        }))}
                                    />
                                    <Input
                                        type="number"
                                        step="any"
                                        placeholder="Latitude"
                                        value={agricultureProfile.location?.latitude ?? ''}
                                        onChange={event => setAgricultureProfile(profile => ({
                                            ...profile,
                                            location: {
                                                name: profile.location?.name ?? 'Main Farm',
                                                latitude: Number(event.target.value),
                                                longitude: profile.location?.longitude ?? 0,
                                                timezone: profile.location?.timezone,
                                            },
                                        }))}
                                    />
                                    <Input
                                        type="number"
                                        step="any"
                                        placeholder="Longitude"
                                        value={agricultureProfile.location?.longitude ?? ''}
                                        onChange={event => setAgricultureProfile(profile => ({
                                            ...profile,
                                            location: {
                                                name: profile.location?.name ?? 'Main Farm',
                                                latitude: profile.location?.latitude ?? 0,
                                                longitude: Number(event.target.value),
                                                timezone: profile.location?.timezone,
                                            },
                                        }))}
                                    />
                                </div>
                                <div className="flex justify-end">
                                    <Button variant="outline" onClick={addFarmLocation}><Plus className="w-4 h-4 mr-2" />Add or Update Location</Button>
                                </div>
                                {agricultureProfile.locations.length > 0 && (
                                    <div className="space-y-2">
                                        {agricultureProfile.locations.map(location => (
                                            <div key={`${location.name}-${location.latitude}-${location.longitude}`} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                                                <button type="button" className="text-left" onClick={() => setAgricultureProfile(profile => ({ ...profile, location }))}>
                                                    <span className="font-medium">{location.name}</span>
                                                    <span className="ml-2 text-muted-foreground">{location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}</span>
                                                </button>
                                                <Button variant="ghost" size="icon" onClick={() => setAgricultureProfile(profile => ({ ...profile, locations: profile.locations.filter(item => item !== location) }))}><Trash2 className="w-4 h-4 text-red-600" /></Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="border-t pt-5 space-y-2">
                                <Label className="text-base">Operational week</Label>
                                <p className="text-sm text-muted-foreground">Weeks are numbered 1-52 within each calendar year. Week 52 automatically absorbs remaining year-end days.</p>
                                <select className="border rounded-md px-3 py-2 text-sm bg-background" value={agricultureProfile.weekStartsOn} onChange={event => setAgricultureProfile(profile => ({ ...profile, weekStartsOn: Number(event.target.value) }))}>
                                    {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, index) => <option key={day} value={index}>Week starts on {day}</option>)}
                                </select>
                            </div>

                            <div className="flex justify-end border-t pt-5">
                                <Button className="bg-green-600 hover:bg-green-700" onClick={handleAgricultureSave} disabled={savingAgriculture}>
                                    {savingAgriculture ? 'Saving Agriculture Workspace...' : 'Save Agriculture Workspace'}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Preferences Section */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Globe className="w-5 h-5" /> Globalization
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2 max-w-xs">
                            <Label>Currency Symbol</Label>
                            <div className="flex gap-2">
                                {['GHS', '₵', '$', '€', '£', '₦', '₹', 'KSh'].map((sym) => (
                                    <Button
                                        key={sym}
                                        variant={currency === sym ? "default" : "outline"}
                                        className="w-12 h-12 text-lg"
                                        onClick={() => setCurrency(sym)}
                                    >
                                        {sym}
                                    </Button>
                                ))}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                                Selected: <span className="font-bold">{currency}</span> (Rupee/Dollar/Euro/Pound/Cedi)
                            </p>
                        </div>
                    </CardContent>
                </Card>

                {/* Tax Configuration Section */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Globe className="w-5 h-5" /> Tax Configuration
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between p-4 border rounded-lg">
                            <div>
                                <Label className="text-base font-medium">Enable Tax</Label>
                                <p className="text-sm text-muted-foreground">Apply tax to taxable farm income, services, and commercial records</p>
                            </div>
                            <input
                                type="checkbox"
                                checked={taxSettings.enabled}
                                onChange={(e) => updateTaxSettings({ enabled: e.target.checked })}
                                className="w-5 h-5 cursor-pointer"
                            />
                        </div>
                        {taxSettings.enabled && (
                            <div className="space-y-2 max-w-xs">
                                <Label>Tax Rate (%)</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.1"
                                    value={taxSettings.rate}
                                    onChange={(e) => updateTaxSettings({ rate: parseFloat(e.target.value) || 0 })}
                                />
                                <p className="text-sm text-muted-foreground">
                                    Current rate: <span className="font-bold">{taxSettings.rate}%</span>
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Receipt Section */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Scroll className="w-5 h-5" /> Receipt & Billing
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">Customize invoice templates, logos, and footer messages.</p>
                        <Link href="/dashboard/settings/receipts">
                            <Button variant="outline" className="w-full">Open Receipt Designer</Button>
                        </Link>
                    </CardContent>
                </Card>

                {/* Security Section */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Lock className="w-5 h-5" /> Security
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Button variant="outline">Change Password</Button>
                        <Button variant="outline" className="ml-2 text-red-600 hover:text-red-600 hover:bg-red-50">Log out all devices</Button>
                    </CardContent>
                </Card>
            </div>

            {successMsg && (
                <div className="fixed bottom-8 right-8 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg animate-in slide-in-from-bottom">
                    {successMsg}
                </div>
            )}
        </div>
    );
}
