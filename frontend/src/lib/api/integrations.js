import client from './client';
import { unwrapMain } from './http';
import * as preview from './integrationsPreview';
import { INTEGRATIONS_PREVIEW } from './integrationsPreview';

/*
 * Connect AWS Account (discovery API).
 *
 *   GET    /api/v1/integrations/aws
 *   POST   /api/v1/integrations/aws/verify                         { role_arn, regions }
 *   PUT    /api/v1/integrations/aws/accounts/{id}/regions          { regions }
 *   PUT    /api/v1/integrations/aws/accounts/{id}/exposure         { github, codecommit, github_secret_arn }
 *   POST   /api/v1/integrations/aws/accounts/{id}/sync              queue a sync of one account
 *   DELETE /api/v1/integrations/aws/accounts/{id}/sync              cancel it while still queued
 *   DELETE /api/v1/integrations/aws/accounts/{id}
 *
 * A build with VITE_INTEGRATIONS_PREVIEW=true answers all of these in the
 * browser from sample accounts instead (integrationsPreview.js); the
 * normalisers below read both the same way.
 */

const BASE = '/api/v1/integrations/aws';
const enc = encodeURIComponent;

function checks(list) {
  return (Array.isArray(list) ? list : [])
    .filter((c) => c && typeof c.key === 'string')
    .map((c) => ({
      key: c.key,
      label: String(c.label ?? c.key),
      state: String(c.state ?? ''),
      message: String(c.message ?? ''),
      fix: c.fix ? String(c.fix) : '',
      /* The events check only: where events were expected and seen, and the watch's window. */
      regions: Array.isArray(c.regions)
        ? c.regions.map((r) => ({
            region: String(r.region ?? ''),
            seen: Boolean(r.seen),
            firstSeenAt: r.first_seen_at ?? null,
            events: Number(r.events) || 0,
            global: Boolean(r.global),
          }))
        : [],
      startedAt: c.started_at ?? null,
      deadline: c.deadline ?? null,
      scanned: Number(c.messages_scanned) || 0,
    }));
}

function platform(p = {}) {
  return {
    connected: Boolean(p.connected),
    checks: checks(p.checks),
    verifiedAt: p.verified_at ?? null,
    secretArn: p.secret_arn || '',
  };
}

export function awsAccount(a = {}) {
  const sync = a.sync ?? {};
  return {
    accountId: String(a.account_id ?? ''),
    roleArn: String(a.role_arn ?? ''),
    regions: Array.isArray(a.regions) ? a.regions : [],
    status: a.status || 'pending', // pending | pending_approval | connected | action_needed | rejected
    isConnected: Boolean(a.is_connected),
    checks: checks(a.checks),
    lastVerifiedAt: a.last_verified_at ?? null,
    lastVerifiedBy: a.last_verified_by ?? '',
    connectedAt: a.connected_at ?? null,
    approval: {
      status: a.approval?.status || '', // '' | pending | approved | rejected
      requestedAt: a.approval?.requested_at ?? null,
      requestedBy: a.approval?.requested_by ?? '',
      decidedAt: a.approval?.decided_at ?? null,
      decidedBy: a.approval?.decided_by ?? '',
      note: a.approval?.note ?? '',
    },
    exposure: {
      github: platform(a.exposure?.github),
      codecommit: platform(a.exposure?.codecommit),
      updatedBy: a.exposure?.updated_by ?? '',
    },
    sync: {
      status: sync.status || 'idle', // idle | queued | running | succeeded | failed
      requestedAt: sync.requested_at ?? null,
      requestedBy: sync.requested_by ?? '',
      startedAt: sync.started_at ?? null,
      lastSyncedAt: sync.last_synced_at ?? null,
      lastError: sync.last_error ?? '',
    },
  };
}

export async function fetchAwsIntegration(signal) {
  const d = (INTEGRATIONS_PREVIEW ? await preview.getIntegration() : unwrapMain(await client.get(BASE, { signal }))) ?? {};
  const s = d.setup;
  return {
    status: d.status || 'not_connected',
    hasConnectedAccount: Boolean(d.has_connected_account),
    exposureEnabled: Boolean(d.exposure_enabled),
    /* Which credential-exposure sources are on: GitHub and Bitbucket for the
       whole company, CodeCommit per AWS account. */
    platforms: {
      codecommit: Boolean(d.platforms?.codecommit),
      github: Boolean(d.platforms?.github),
      bitbucket: Boolean(d.platforms?.bitbucket),
    },
    awaitingApproval: Boolean(d.awaiting_approval),
    canManage: Boolean(d.can_manage),
    domain: d.workspace?.domain || '',
    setup: s
      ? {
          accountId: s.account_id,
          externalId: s.external_id,
          eventBusArn: s.event_bus_arn,
          region: s.region,
          assumerRoleArn: s.assumer_role_arn,
          roleName: s.role_name,
          ruleName: s.rule_name,
          forwardRoleName: s.forward_role_name || 'NHIEventBridgeForwardRole',
          trailName: s.trail_name || 'adapid-nhi-trail',
          eventWaitMinutes: Number(s.event_wait_minutes) || 15,
          managedPolicies: s.managed_policies ?? [],
          eventSources: s.event_sources ?? [],
          regions: (s.regions ?? []).map((r) => ({ code: r.code, name: r.name, group: r.group, optIn: Boolean(r.opt_in) })),
          exposure: {
            codecommit: {
              managedPolicy: s.exposure?.codecommit?.managed_policy ?? '',
              actions: s.exposure?.codecommit?.actions ?? [],
            },
            github: {
              secretPrefix: s.exposure?.github?.secret_prefix ?? 'nhi/github',
              actions: s.exposure?.github?.actions ?? [],
              tokenPermissions: s.exposure?.github?.token_permissions ?? [],
            },
          },
        }
      : null,
    accounts: (d.accounts ?? []).map(awsAccount),
  };
}

/** Checks can take a few seconds against AWS; allow for it. */
const SLOW = { timeout: 30000 };

export async function verifyAwsConnection({ roleArn, regions }) {
  const body = { role_arn: roleArn, regions };
  const d = INTEGRATIONS_PREVIEW ? await preview.verify(body) : unwrapMain(await client.post(`${BASE}/verify`, body, SLOW));
  return {
    status: d.status,
    accountId: d.account_id,
    roleArn: d.role_arn,
    regions: d.regions ?? [],
    checks: checks(d.checks),
    verifiedAt: d.verified_at,
    saved: Boolean(d.saved),
    syncQueued: Boolean(d.sync_queued),
    /* The events check carries on in the background; read the account to follow it. */
    watching: Boolean(d.watching),
  };
}

export async function updateAwsAccountRegions({ accountId, regions }) {
  if (INTEGRATIONS_PREVIEW) return awsAccount(await preview.updateRegions(accountId, { regions }));
  return awsAccount(unwrapMain(await client.put(`${BASE}/accounts/${enc(accountId)}/regions`, { regions })));
}

export async function setAwsExposure({ accountId, github, codecommit, githubSecretArn }) {
  const body = { github: Boolean(github), codecommit: Boolean(codecommit), github_secret_arn: github ? githubSecretArn || '' : '' };
  const d = INTEGRATIONS_PREVIEW
    ? await preview.setExposure(accountId, body)
    : unwrapMain(await client.put(`${BASE}/accounts/${enc(accountId)}/exposure`, body, SLOW));
  return { account: awsAccount(d.account), exposureEnabled: Boolean(d.exposure_enabled) };
}

export async function syncAwsAccount({ accountId }) {
  const d = INTEGRATIONS_PREVIEW ? await preview.sync(accountId) : unwrapMain(await client.post(`${BASE}/accounts/${enc(accountId)}/sync`));
  return { account: awsAccount(d.account), alreadyQueued: Boolean(d.already_queued) };
}

/** Withdraw a queued sync (409 once the worker has started it). */
export async function cancelAwsAccountSync({ accountId }) {
  if (INTEGRATIONS_PREVIEW) return { account: awsAccount(await preview.cancelSync(accountId)) };
  const d = unwrapMain(await client.delete(`${BASE}/accounts/${enc(accountId)}/sync`));
  return { account: awsAccount(d.account) };
}

/** Removes the account; its data is kept (and restored on reconnect) unless deleteData. */
export async function removeAwsAccount({ accountId, deleteData = false }) {
  if (INTEGRATIONS_PREVIEW) return preview.remove(accountId);
  return unwrapMain(await client.delete(`${BASE}/accounts/${enc(accountId)}`, { data: { delete_data: Boolean(deleteData) } }));
}
