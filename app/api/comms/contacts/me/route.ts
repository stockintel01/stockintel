import { NextRequest, NextResponse } from 'next/server';

import { ApiError, requireUser } from '@/lib/api-auth';
import { buildWhatsAppLinkUrl, generateLinkCode, hashLinkCode } from '@/lib/comms/inbound';
import { maskPhoneNumber } from '@/lib/comms/phone';
import { COMMS_LIMITS } from '@/lib/comms/server/config';
import { resolveMemberComms, type MemberComms } from '@/lib/comms/server/membership';

function errorResponse(error: unknown) {
  if (error instanceof ApiError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error('[comms] WhatsApp contact request failed:', error);
  return NextResponse.json({ error: 'WhatsApp settings could not be updated. Try again shortly.' }, { status: 500 });
}

function requireResolved(access: MemberComms): Exclude<MemberComms, { state: 'unavailable' }> {
  if (access.state === 'unavailable') {
    throw new ApiError(access.message, access.reason === 'unsupported_account' ? 403 : 409);
  }
  return access;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const access = await resolveMemberComms(user);
    if (access.state === 'unavailable') {
      return NextResponse.json({ available: false, reason: access.reason, message: access.message });
    }

    const contact = await access.tenant.getMemberContact(access.identity, 'whatsapp');
    return NextResponse.json({
      available: access.state === 'ready',
      reason: access.state === 'ready' ? null : access.state,
      message: access.message,
      businessNumber: access.config.displayPhoneNumber,
      connection: contact
        ? {
          maskedNumber: maskPhoneNumber(contact.address),
          status: contact.status === 'unreachable' ? 'unreachable' : contact.consented ? 'active' : 'paused',
          connectedAt: contact.verified_at,
        }
        : null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Creates a single-use code the member sends from WhatsApp, which proves they control the number. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const access = requireResolved(await resolveMemberComms(user));
    if (access.state !== 'ready') throw new ApiError(access.message ?? 'WhatsApp alerts are unavailable.', 403);

    const since = new Date(Date.now() - 60 * 60 * 1000);
    if (await access.tenant.countLinkCodesSince(access.identity, since) >= COMMS_LIMITS.linkCodesPerHour) {
      throw new ApiError('Too many connection codes were requested. Wait an hour, then try again.', 429);
    }

    const expiresAt = new Date(Date.now() + COMMS_LIMITS.linkCodeTtlMinutes * 60 * 1000);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const code = generateLinkCode();
      const created = await access.tenant.createLinkCode({
        identity: access.identity,
        channel: 'whatsapp',
        codeHash: hashLinkCode(code),
        displayName: user.email || null,
        expiresAt,
      });
      if (created) {
        return NextResponse.json({
          code,
          expiresAt: expiresAt.toISOString(),
          businessNumber: access.config.displayPhoneNumber,
          whatsappUrl: buildWhatsAppLinkUrl(access.config.displayPhoneNumber, code),
        }, { status: 201 });
      }
    }
    throw new ApiError('A connection code could not be created. Try again.', 503);
  } catch (error) {
    return errorResponse(error);
  }
}

/** Disconnecting works even if the plan no longer includes WhatsApp alerts. */
export async function DELETE(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const access = requireResolved(await resolveMemberComms(user));
    const disconnected = await access.tenant.revokeMemberContact(access.identity, 'whatsapp', 'member_request');
    return NextResponse.json({ disconnected });
  } catch (error) {
    return errorResponse(error);
  }
}
