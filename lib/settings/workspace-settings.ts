'use client';

import { updateProfile } from 'firebase/auth';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';

import type { AgricultureProfile } from '@/lib/agric/config';
import { toCurrencyCode } from '@/lib/currency';
import { auth, db as firebaseDb, storage } from '@/lib/firebase';
import type { SalesReceiptSettings } from '@/lib/sales/receipt';
import { getBrowserSupabaseClient } from '@/lib/supabase/browser';
import { isSupabaseBackendActive } from '@/lib/supabase/config';

function check(error: { message?: string } | null, action: string) {
  if (error) throw new Error(`${action}: ${error.message ?? 'operation failed'}`);
}

export async function saveGeneralWorkspaceSettings(input: {
  userId: string;
  organizationId: string;
  displayName: string;
  businessName: string;
  currency: string;
  settings: Record<string, unknown>;
}) {
  const displayName = input.displayName.trim();
  const businessName = input.businessName.trim();
  if (!displayName) throw new Error('Your name is required.');
  if (businessName.length < 2) throw new Error('The business name must contain at least two characters.');

  if (isSupabaseBackendActive()) {
    const client = getBrowserSupabaseClient();
    const [authResult, profileResult, organizationResult] = await Promise.all([
      client.auth.updateUser({ data: { full_name: displayName } }),
      client.from('profiles').update({ display_name: displayName }).eq('id', input.userId),
      client.from('organizations').update({
        name: businessName,
        currency: toCurrencyCode(input.currency),
        settings: {
          ...input.settings,
          currencySymbol: input.currency,
        },
      }).eq('id', input.organizationId),
    ]);
    check(authResult.error, 'Unable to update the login profile');
    check(profileResult.error, 'Unable to update the user profile');
    check(organizationResult.error, 'Unable to update the workspace');
    return;
  }

  if (!auth.currentUser) throw new Error('Authentication required');
  await Promise.all([
    updateProfile(auth.currentUser, { displayName }),
    updateDoc(doc(firebaseDb, 'users', input.userId), { displayName, updatedAt: new Date() }),
    updateDoc(doc(firebaseDb, 'organizations', input.organizationId), {
      name: businessName,
      currency: input.currency,
      settings: input.settings,
      updatedAt: new Date(),
    }),
  ]);
}

export async function saveAgricultureWorkspaceSettings(input: {
  organizationId: string;
  settings: Record<string, unknown>;
  profile: AgricultureProfile;
}) {
  if (!isSupabaseBackendActive()) {
    await updateDoc(doc(firebaseDb, 'organizations', input.organizationId), {
      settings: input.settings,
      updatedAt: new Date(),
    });
    return;
  }

  const client = getBrowserSupabaseClient();
  const profile = input.profile;
  const sigatoka = profile.sigatoka;
  const [organizationResult, farmProfileResult, sigatokaResult] = await Promise.all([
    client.from('organizations').update({ settings: input.settings }).eq('id', input.organizationId),
    client.from('farm_profiles').upsert({
      organization_id: input.organizationId,
      operation_types: profile.operationTypes,
      crop_types: profile.cropTypes,
      livestock_types: profile.livestockTypes,
      modules: profile.modules,
      naming: {
        sector: sigatoka.sectorLabel,
        plot: sigatoka.plotLabel,
        plant: sigatoka.plantLabel,
      },
      week_starts_on: profile.weekStartsOn,
    }, { onConflict: 'organization_id' }),
    client.from('sigatoka_settings').upsert({
      organization_id: input.organizationId,
      enabled: sigatoka.enabled,
      sector_label: sigatoka.sectorLabel,
      plot_label: sigatoka.plotLabel,
      plant_label: sigatoka.plantLabel,
      area_unit: sigatoka.areaUnit,
      custom_area_unit_name: sigatoka.customAreaUnitName || null,
      custom_area_square_metres: sigatoka.customAreaSquareMetres || null,
      sample_plant_count: sigatoka.samplePlantCount,
      initial_fer_baseline: sigatoka.initialFerBaseline,
      watch_threshold: sigatoka.riskThresholds.watch,
      high_threshold: sigatoka.riskThresholds.high,
      critical_threshold: sigatoka.riskThresholds.critical,
    }, { onConflict: 'organization_id' }),
  ]);
  check(organizationResult.error, 'Unable to save workspace settings');
  check(farmProfileResult.error, 'Unable to save the farm profile');
  check(sigatokaResult.error, 'Unable to save disease scouting settings');

  const locations = [
    ...profile.locations,
    ...(profile.location ? [profile.location] : []),
  ].filter((location, index, all) => all.findIndex(item => item.name.trim().toLowerCase() === location.name.trim().toLowerCase()) === index);
  if (locations.length > 0) {
    const { error } = await client.from('farm_locations').upsert(locations.map(location => ({
      organization_id: input.organizationId,
      name: location.name.trim(),
      latitude: location.latitude,
      longitude: location.longitude,
      timezone: location.timezone || null,
      active: true,
    })), { onConflict: 'organization_id,name' });
    check(error, 'Unable to save farm locations');
  }

  if (profile.farmZones.length > 0) {
    const { error } = await client.from('farm_zones').upsert(profile.farmZones.map(name => ({
      organization_id: input.organizationId,
      name,
      zone_type: 'field',
      active: true,
    })), { onConflict: 'organization_id,name' });
    check(error, 'Unable to save farm zones');
  }

  const { data: existingPlots, error: plotLoadError } = await client.from('sigatoka_plots')
    .select('id, sector_name, name')
    .eq('organization_id', input.organizationId);
  check(plotLoadError, 'Unable to load disease monitoring plots');
  const plotRows = new Map<string, { id: unknown; sector_name: unknown; name: unknown }>(
    (existingPlots ?? []).map((row: { id: unknown; sector_name: unknown; name: unknown }) => [
      `${String(row.sector_name).toLowerCase()}\u0000${String(row.name).toLowerCase()}`,
      row,
    ]),
  );

  for (const plot of sigatoka.monitoringPlots) {
    const key = `${plot.sectorName.toLowerCase()}\u0000${plot.name.toLowerCase()}`;
    const existing = plotRows.get(key);
    let plotId = String(existing?.id ?? '');
    const plotPayload = {
      organization_id: input.organizationId,
      sector_name: plot.sectorName,
      name: plot.name,
      area: plot.area,
      area_unit: sigatoka.areaUnit,
      active: plot.status === 'active',
      retired_at: plot.status === 'retired' ? new Date().toISOString() : null,
    };
    if (plotId) {
      const { error } = await client.from('sigatoka_plots').update(plotPayload).eq('id', plotId).eq('organization_id', input.organizationId);
      check(error, `Unable to update ${plot.name}`);
    } else {
      const { data, error } = await client.from('sigatoka_plots').insert(plotPayload).select('id').single();
      check(error, `Unable to create ${plot.name}`);
      plotId = String(data?.id ?? '');
    }

    if (plot.sentinels.length > 0) {
      const { error } = await client.from('sigatoka_sentinel_plants').upsert(plot.sentinels.map(plant => ({
        organization_id: input.organizationId,
        plot_id: plotId,
        code: plant.code,
        active: plant.status === 'active',
        enrolled_on: plant.enrolledAt,
        retired_on: plant.retiredAt || null,
        retirement_reason: plant.retirementReason || null,
      })), { onConflict: 'plot_id,code' });
      check(error, `Unable to save sentinel plants for ${plot.name}`);
    }
  }
}

export async function saveReceiptDesign(organizationId: string, settings: SalesReceiptSettings) {
  if (isSupabaseBackendActive()) {
    const { error } = await getBrowserSupabaseClient().from('organizations')
      .update({ receipt_settings: settings })
      .eq('id', organizationId);
    check(error, 'Unable to save the receipt design');
    return;
  }
  await updateDoc(doc(firebaseDb, 'organizations', organizationId), {
    receiptSettings: settings,
    updatedAt: serverTimestamp(),
  });
}

export async function uploadReceiptLogo(organizationId: string, file: File, extension: string) {
  if (isSupabaseBackendActive()) {
    const client = getBrowserSupabaseClient();
    const path = `${organizationId}/receipts/sales-receipt-logo.${extension}`;
    const { error } = await client.storage.from('tenant-branding').upload(path, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: true,
    });
    check(error, 'Unable to upload the receipt logo');
    return client.storage.from('tenant-branding').getPublicUrl(path).data.publicUrl;
  }

  const target = storageRef(storage, `organizations/${organizationId}/branding/sales-receipt-logo.${extension}`);
  await uploadBytes(target, file, { contentType: file.type, cacheControl: 'public,max-age=3600' });
  return getDownloadURL(target);
}
