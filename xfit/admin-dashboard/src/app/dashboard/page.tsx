'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import AdminNav from '@/components/AdminNav';
import {
  createAccuracyBenchmark,
  createBillingCheckout,
  createInviteLink,
  getOrgDashboard,
  getOrganizationEvents,
  inviteStaff,
  reviewSession,
} from '@/lib/api';
import styles from './dashboard.module.css';

interface MeasurementCatalogItem {
  key: string;
  label: string;
  profile: 'all' | 'male' | 'female' | 'other';
  type: 'linear' | 'circumference' | 'derived';
  requiredForFit: boolean;
  requiresSideView: boolean;
  source: string;
  garmentUses: string[];
}

interface SessionAccuracyStatus {
  status: string;
  blockers: string[];
  coverage: {
    requiredCoveragePct: number;
    missingRequired: string[];
    capturedKeys: string[];
  };
  confidence: {
    average: number;
    lowConfidenceParts: string[];
  };
}

interface RecentSession {
  id: string;
  status: string;
  started_at: string;
  completed_at?: string;
  accuracy_score?: number;
  customer_name: string;
  customer_email: string;
  measurement_id?: string;
  measurements?: Record<string, number>;
  unit?: 'cm' | 'inch';
  measurement_profile?: string;
  confidence?: Record<string, number>;
  warnings?: string[];
  metadata?: Record<string, unknown>;
  measurementCount?: number;
  review_status?: string;
  tailor_notes?: string | null;
  reviewed_at?: string | null;
  accuracyStatus?: SessionAccuracyStatus;
  invite_code: string;
  invite_label: string;
}

interface DashboardData {
  organization: {
    id: string; name: string; brandName: string; primaryColor: string;
    imprint: string; status: string; createdAt: string;
  };
  license: {
    id: string; seatsPurchased: number; scanQuota: number; scansUsed: number;
    remainingQuota: number; overageUnits?: number; overageGraceScans?: number;
    status: string; billingInterval: string; amount: number; currency: string; endsAt: string;
  };
  metrics: { staffCount: number; customerCount: number; sessionCount: number };
  recentSessions: RecentSession[];
  inviteLinks: Array<{
    id: string; code: string; label: string; campaign_name?: string;
    status: string; created_at: string; publicUrl: string;
  }>;
  measurementCatalog?: {
    version: string;
    items: MeasurementCatalogItem[];
  };
  accuracyCertification?: {
    status: string;
    sampleSize: number;
    targetSampleSize: number;
    minimumPublishableSampleSize: number;
    failureRatePct: number;
    aggregateP90ErrorCm?: number | null;
    partMetrics: Record<string, {
      sampleSize: number;
      mae: number;
      medianError: number;
      p90Error: number;
      p95Error: number;
    }>;
    claimLanguage: string;
  };
  businessHealth?: {
    activeInviteCount: number;
    completionRatePct: number;
    averageAccuracyScore?: number | null;
    reviewBacklog: number;
    quotaUtilizationPct: number;
    projectedOverageAmount: number;
    currency: string;
    nextActions: string[];
  };
  trustPosture?: {
    imageRetention: string;
    bodyDataStorage: string;
    sharing: string;
    auditLogCount: number;
    benchmarkRecordCount: number;
    controls: string[];
  };
  appLinks?: {
    scheme: string;
    androidPackage: string;
    iosBundleIdentifier: string;
    androidAppLinksReady: boolean;
    iosUniversalLinksReady: boolean;
  };
  recentEvents?: Array<{
    id: string;
    event_type: string;
    created_at: string;
    payload?: Record<string, unknown>;
  }>;
  auditLogs?: Array<{
    id: string;
    action: string;
    subject_type?: string;
    subject_id?: string;
    created_at: string;
  }>;
}

const MEASUREMENT_LABELS: Record<string, string> = {
  height: 'Height',
  chest: 'Chest/Bust',
  bust: 'Bust',
  underbust: 'Underbust',
  cupDifference: 'Cup diff',
  waist: 'Waist',
  hips: 'Hips',
  shoulders: 'Shoulders',
  neck: 'Neck',
  sleeve: 'Sleeve',
  armLength: 'Arm',
  inseam: 'Inseam',
  outseam: 'Outseam',
  rise: 'Rise',
  thigh: 'Thigh',
  knee: 'Knee',
  calf: 'Calf',
  ankle: 'Ankle',
  wrist: 'Wrist',
  halfLength: 'Half length',
  topLength: 'Top length',
  backWidth: 'Back width',
  frontWidth: 'Front width',
  roundSleeveBicep: 'Bicep',
  roundSleeveElbow: 'Elbow',
};

const SUMMARY_KEYS = [
  'chest',
  'bust',
  'underbust',
  'waist',
  'hips',
  'shoulders',
  'sleeve',
  'inseam',
  'thigh',
  'outseam',
];

function formatMeasurement(value: number, unit = 'cm') {
  return `${Math.round(value * 10) / 10}${unit}`;
}

function formatStatus(value?: string | null) {
  return (value || 'pending').replace(/_/g, ' ');
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString() : 'N/A';
}

function sessionMeasurementSummary(session: RecentSession) {
  const measurements = session.measurements || {};
  return SUMMARY_KEYS
    .filter(key => typeof measurements[key] === 'number' && measurements[key] > 0)
    .slice(0, 6)
    .map(key => ({
      key,
      label: MEASUREMENT_LABELS[key] || key,
      value: formatMeasurement(measurements[key], session.unit || 'cm'),
    }));
}

function certificationTone(status?: string) {
  if (status === 'validated_internal') return styles.goodPill;
  if (status === 'collecting') return styles.warnPill;
  if (status === 'needs_review') return styles.badPill;
  return styles.neutralPill;
}

export default function DashboardPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [liveMessage, setLiveMessage] = useState('Live');
  const [notificationText, setNotificationText] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);
  const [benchmarkTapeJson, setBenchmarkTapeJson] = useState('');
  const [benchmarkMsg, setBenchmarkMsg] = useState('');
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);

  const [inviteLabel, setInviteLabel] = useState('');
  const [inviteHeadline, setInviteHeadline] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteMsg, setInviteMsg] = useState('');

  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffRole, setStaffRole] = useState('staff');
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffMsg, setStaffMsg] = useState('');

  const loadDashboard = useCallback(async (orgId: string, options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
      setError('');
    }
    try {
      const res = await getOrgDashboard(orgId);
      const nextData = res.data as DashboardData;
      setData(nextData);
      setSelectedSessionId(current => current || nextData.recentSessions[0]?.id || null);
    } catch {
      if (!options?.silent) {
        setError('Failed to load dashboard. Make sure your session is still active.');
      }
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (!user) { router.replace('/login'); return; }
    if (user.role === 'super_admin') { router.replace('/super-admin'); return; }
    if (!user.organizationId) { setError('No organization linked to your account.'); setLoading(false); return; }
    loadDashboard(user.organizationId);
  }, [user, isLoading, router, loadDashboard]);

  useEffect(() => {
    if (!user?.organizationId) return;
    let cancelled = false;
    let cursor: string | undefined;
    let initialized = false;

    const pollEvents = async () => {
      try {
        const res = await getOrganizationEvents(user.organizationId!, cursor);
        if (cancelled) return;
        const payload = res.data as { events: Array<{ eventType: string; payload?: Record<string, unknown> }>; cursor?: string };
        cursor = payload.cursor || cursor;
        if (initialized && payload.events.length > 0) {
          const latest = payload.events[0];
          const customerName = latest?.payload?.customerName || latest?.payload?.customerEmail;
          setLiveMessage(`${payload.events.length} update${payload.events.length === 1 ? '' : 's'}`);
          setNotificationText(
            `${formatStatus(latest?.eventType)}${customerName ? ` / ${customerName}` : ''}`
          );
          loadDashboard(user.organizationId!, { silent: true });
        } else {
          setLiveMessage('Live');
        }
        initialized = true;
      } catch {
        if (!cancelled) setLiveMessage('Offline');
      }
    };

    pollEvents();
    const timer = window.setInterval(pollEvents, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [user?.organizationId, loadDashboard]);

  const selectedSession = useMemo(() => {
    return data?.recentSessions.find(session => session.id === selectedSessionId) || data?.recentSessions[0] || null;
  }, [data, selectedSessionId]);

  const femaleCatalogCount = data?.measurementCatalog?.items.filter(item => item.profile === 'female').length || 0;
  const requiredCatalogCount = data?.measurementCatalog?.items.filter(item => item.requiredForFit).length || 0;
  const sideViewCatalogCount = data?.measurementCatalog?.items.filter(item => item.requiresSideView).length || 0;

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.organizationId || !inviteLabel) return;
    setInviteLoading(true); setInviteMsg('');
    try {
      const res = await createInviteLink(user.organizationId, {
        label: inviteLabel,
        landingHeadline: inviteHeadline || undefined,
      });
      const link = res.data as { publicUrl: string };
      setInviteMsg(`Created: ${link.publicUrl}`);
      setInviteLabel(''); setInviteHeadline('');
      loadDashboard(user.organizationId, { silent: true });
    } catch {
      setInviteMsg('Failed to create invite link.');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleInviteStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.organizationId || !staffName || !staffEmail) return;
    setStaffLoading(true); setStaffMsg('');
    try {
      await inviteStaff(user.organizationId, { name: staffName, email: staffEmail, role: staffRole });
      setStaffMsg(`${staffName} added as ${staffRole}`);
      setStaffName(''); setStaffEmail('');
      loadDashboard(user.organizationId, { silent: true });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setStaffMsg(msg || 'Failed to add staff member.');
    } finally {
      setStaffLoading(false);
    }
  };

  const handleCheckout = async () => {
    if (!data) return;
    try {
      const res = await createBillingCheckout({
        organizationId: data.organization.id,
        licenseId: data.license.id,
        amount: data.license.amount,
        currency: data.license.currency,
        billingInterval: data.license.billingInterval,
        planTier: 'growth',
      });
      const { checkoutUrl } = res.data as { checkoutUrl: string };
      window.open(checkoutUrl, '_blank');
    } catch {
      alert('Failed to start billing checkout.');
    }
  };

  const handleReview = async (reviewStatus: 'reviewed' | 'needs_rescan' | 'needs_tailor_review') => {
    if (!selectedSession || !user?.organizationId) return;
    setReviewLoading(true);
    try {
      await reviewSession(selectedSession.id, {
        reviewStatus,
        tailorNotes: reviewNotes || undefined,
      });
      await loadDashboard(user.organizationId, { silent: true });
    } catch {
      alert('Failed to update session review.');
    } finally {
      setReviewLoading(false);
    }
  };

  const handleBenchmarkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSession || !user?.organizationId || !selectedSession.measurements) return;
    setBenchmarkLoading(true);
    setBenchmarkMsg('');
    try {
      const tapeMeasurements = JSON.parse(benchmarkTapeJson) as Record<string, number>;
      await createAccuracyBenchmark(user.organizationId, {
        measurementId: selectedSession.measurement_id || selectedSession.id,
        measurementProfile: selectedSession.measurement_profile || 'other',
        scanMeasurements: selectedSession.measurements,
        tapeMeasurements,
      });
      setBenchmarkMsg('Benchmark record saved.');
      setBenchmarkTapeJson('');
      await loadDashboard(user.organizationId, { silent: true });
    } catch {
      setBenchmarkMsg('Enter valid tape measurements as JSON.');
    } finally {
      setBenchmarkLoading(false);
    }
  };

  if (isLoading || loading) return <><AdminNav /><div className={styles.center}>Loading...</div></>;
  if (error) return <><AdminNav /><div className={styles.center} style={{ color: 'var(--error)' }}>{error}</div></>;
  if (!data) return null;

  const { organization, license, metrics, recentSessions, inviteLinks } = data;
  const usagePct = license.scanQuota > 0 ? Math.round((license.scansUsed / license.scanQuota) * 100) : 0;
  const licenseColor = license.status === 'active' ? 'var(--success)' : ['past_due', 'trialing'].includes(license.status) ? 'var(--warning)' : 'var(--error)';
  const certification = data.accuracyCertification;
  const business = data.businessHealth;
  const trust = data.trustPosture;

  return (
    <>
      <AdminNav />
      <main className={styles.main}>
        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Organization Workspace</p>
            <h1 className={styles.orgName}>{organization.brandName}</h1>
            <p className={styles.orgMeta}>{organization.name} / {organization.status} / Renewal {formatDate(license.endsAt)}</p>
          </div>
          <div className={styles.headerActions}>
            <span className={styles.livePill}>{liveMessage}</span>
            <span className={styles.licensePill} style={{ background: licenseColor }}>
              License: {license.status}
            </span>
            <button className={styles.btnSecondary} onClick={() => loadDashboard(organization.id, { silent: true })}>Refresh</button>
            {license.status !== 'active' && (
              <button className={styles.btnPrimary} onClick={handleCheckout}>
                {license.status === 'trialing' ? 'Activate with Paystack' : 'Renew with Paystack'}
              </button>
            )}
          </div>
        </div>

        {notificationText && (
          <div className={styles.notificationBanner}>
            <strong>New dashboard update</strong>
            <span>{notificationText}</span>
            <button type="button" onClick={() => setNotificationText('')}>Dismiss</button>
          </div>
        )}

        <div className={styles.metricGrid}>
          <div className={styles.metricCard}><p className={styles.metricLabel}>Staff</p><p className={styles.metricValue}>{metrics.staffCount}</p><span>Team seats</span></div>
          <div className={styles.metricCard}><p className={styles.metricLabel}>Customers</p><p className={styles.metricValue}>{metrics.customerCount}</p><span>Client records</span></div>
          <div className={styles.metricCard}><p className={styles.metricLabel}>Sessions</p><p className={styles.metricValue}>{metrics.sessionCount}</p><span>Measurement flows</span></div>
          <div className={styles.metricCard}><p className={styles.metricLabel}>Review backlog</p><p className={styles.metricValue}>{business?.reviewBacklog ?? 0}</p><span>Need tailor action</span></div>
          <div className={styles.metricCard}><p className={styles.metricLabel}>Quota use</p><p className={styles.metricValue}>{usagePct}%</p><span>{license.remainingQuota} scans left</span></div>
        </div>

        <div className={styles.workspaceGrid}>
          <div className={styles.primaryColumn}>
            <section className={`${styles.section} ${styles.healthSection}`}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>Business Health</h2>
                  <p className={styles.sectionHint}>Invite activity, scan throughput, quota, and action cues.</p>
                </div>
                <span className={styles.neutralPill}>{business?.completionRatePct ?? 0}% completion</span>
              </div>
              <div className={styles.insightGrid}>
                <div><p className={styles.metricLabel}>Active invites</p><p className={styles.compactValue}>{business?.activeInviteCount ?? 0}</p></div>
                <div><p className={styles.metricLabel}>Average accuracy</p><p className={styles.compactValue}>{business?.averageAccuracyScore ? `${business.averageAccuracyScore}%` : 'N/A'}</p></div>
                <div><p className={styles.metricLabel}>Projected overage</p><p className={styles.compactValue}>{business?.currency || license.currency} {business?.projectedOverageAmount ?? 0}</p></div>
                <div><p className={styles.metricLabel}>Quota use</p><p className={styles.compactValue}>{usagePct}%</p></div>
              </div>
              <div className={styles.progressTrack}>
                <div className={styles.progressFill} style={{ width: `${Math.min(usagePct, 100)}%`, background: usagePct > 90 ? 'var(--error)' : usagePct > 70 ? 'var(--warning)' : 'var(--success)' }} />
              </div>
              <div className={styles.actionStrip}>
                <p>{license.scansUsed} / {license.scanQuota} scans used. Renewal: {formatDate(license.endsAt)}</p>
                {(business?.nextActions || []).slice(0, 2).map(action => <span key={action}>{action}</span>)}
                {usagePct >= 80 && <button className={styles.btnPrimary} onClick={handleCheckout}>Top up quota</button>}
              </div>
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>Invite Links</h2>
                  <p className={styles.sectionHint}>Send a branded link so clients can scan from anywhere.</p>
                </div>
                <span className={styles.neutralPill}>{inviteLinks.length} links</span>
              </div>

              <form onSubmit={handleCreateInvite} className={styles.inlineFormCompact}>
                <input className={styles.input} placeholder="Invite label" value={inviteLabel} onChange={e => setInviteLabel(e.target.value)} required />
                <input className={styles.input} placeholder="Landing headline" value={inviteHeadline} onChange={e => setInviteHeadline(e.target.value)} />
                <button className={styles.btnPrimary} type="submit" disabled={inviteLoading}>{inviteLoading ? 'Creating...' : 'Create link'}</button>
              </form>
              {inviteMsg && <p className={styles.msg}>{inviteMsg}</p>}

              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead><tr><th>Label</th><th>Code</th><th>Status</th><th>Public URL</th><th>Created</th></tr></thead>
                  <tbody>
                    {inviteLinks.map(il => (
                      <tr key={il.id}>
                        <td>{il.label}</td>
                        <td><code>{il.code}</code></td>
                        <td><span className={il.status === 'active' ? styles.goodText : styles.badText}>{il.status}</span></td>
                        <td><a href={il.publicUrl} target="_blank" rel="noreferrer" className={styles.link}>{il.publicUrl}</a></td>
                        <td>{formatDate(il.created_at)}</td>
                      </tr>
                    ))}
                    {inviteLinks.length === 0 && <tr><td colSpan={5} className={styles.emptyCell}>No invite links yet</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>Recent Sessions</h2>
                  <p className={styles.sectionHint}>Click a row to inspect measurements, review status, and benchmark data.</p>
                </div>
              </div>
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr><th>Customer</th><th>Profile</th><th>Status</th><th>Review</th><th>Accuracy</th><th>Measurements</th><th>Started</th></tr>
                  </thead>
                  <tbody>
                    {recentSessions.map(s => {
                      const summary = sessionMeasurementSummary(s);
                      const active = selectedSession?.id === s.id;
                      return (
                        <tr key={s.id} className={active ? styles.activeRow : undefined} onClick={() => setSelectedSessionId(s.id)}>
                          <td><strong>{s.customer_name}</strong><br /><span className={styles.mutedSmall}>{s.customer_email}</span></td>
                          <td><span className={styles.profilePill}>{s.measurement_profile || 'not set'}</span></td>
                          <td><span className={s.status === 'completed' ? styles.goodText : styles.mutedSmall}>{s.status}</span></td>
                          <td><span className={s.review_status === 'reviewed' ? styles.goodPill : styles.warnPill}>{formatStatus(s.review_status)}</span></td>
                          <td>{s.accuracy_score != null ? `${s.accuracy_score.toFixed(1)}%` : 'N/A'}</td>
                          <td>
                            {summary.length > 0 ? (
                              <div className={styles.measurementChips}>
                                {summary.slice(0, 4).map(item => <span key={item.key} className={styles.measurementChip}><strong>{item.label}</strong> {item.value}</span>)}
                              </div>
                            ) : <span className={styles.emptyMeasurement}>Awaiting scan</span>}
                          </td>
                          <td>{formatDate(s.started_at)}</td>
                        </tr>
                      );
                    })}
                    {recentSessions.length === 0 && <tr><td colSpan={7} className={styles.emptyCell}>No sessions yet</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>

            {selectedSession && (
              <section className={styles.twoColumn}>
                <div className={styles.section}>
                  <div className={styles.sectionHeader}>
                    <div>
                      <h2 className={styles.sectionTitle}>Session Detail</h2>
                      <p className={styles.sectionHint}>{selectedSession.customer_name} / {selectedSession.customer_email}</p>
                    </div>
                    <span className={selectedSession.accuracyStatus?.status === 'ready_for_tailor' ? styles.goodPill : styles.warnPill}>
                      {formatStatus(selectedSession.accuracyStatus?.status)}
                    </span>
                  </div>
                  <div className={styles.insightGrid}>
                    <div><p className={styles.metricLabel}>Required coverage</p><p className={styles.compactValue}>{selectedSession.accuracyStatus?.coverage.requiredCoveragePct ?? 0}%</p></div>
                    <div><p className={styles.metricLabel}>Confidence</p><p className={styles.compactValue}>{selectedSession.accuracyStatus?.confidence.average ?? 0}%</p></div>
                    <div><p className={styles.metricLabel}>Count</p><p className={styles.compactValue}>{selectedSession.measurementCount ?? 0}</p></div>
                  </div>
                  <div className={styles.measurementChips}>
                    {Object.entries(selectedSession.measurements || {}).map(([key, value]) => (
                      <span key={key} className={styles.measurementChip}>
                        <strong>{MEASUREMENT_LABELS[key] || key}</strong> {formatMeasurement(value, selectedSession.unit || 'cm')}
                      </span>
                    ))}
                  </div>
                  {(selectedSession.warnings || []).length > 0 && (
                    <div className={styles.warningBox}>
                      {(selectedSession.warnings || []).map(warning => <p key={warning}>{warning}</p>)}
                    </div>
                  )}
                  <textarea className={styles.textarea} value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} placeholder="Tailor notes" />
                  <div className={styles.buttonRow}>
                    <button className={styles.btnPrimary} disabled={reviewLoading} onClick={() => handleReview('reviewed')}>Mark reviewed</button>
                    <button className={styles.btnSecondary} disabled={reviewLoading} onClick={() => handleReview('needs_rescan')}>Request rescan</button>
                    <button className={styles.btnSecondary} disabled={reviewLoading} onClick={() => handleReview('needs_tailor_review')}>Keep in review</button>
                  </div>
                </div>

                <div className={styles.section}>
                  <h2 className={styles.sectionTitle}>Benchmark Record</h2>
                  <p className={styles.sectionHint}>Paste tape measurements to track real accuracy by body part.</p>
                  <form onSubmit={handleBenchmarkSubmit} className={styles.inlineForm}>
                    <textarea
                      className={styles.textarea}
                      value={benchmarkTapeJson}
                      onChange={e => setBenchmarkTapeJson(e.target.value)}
                      placeholder='{"chest": 92.5, "waist": 71.0, "hips": 97.0}'
                    />
                    <button className={styles.btnPrimary} disabled={benchmarkLoading || !selectedSession.measurements} type="submit">
                      {benchmarkLoading ? 'Saving...' : 'Save tape comparison'}
                    </button>
                    {benchmarkMsg && <p className={styles.msg}>{benchmarkMsg}</p>}
                  </form>
                  <div className={styles.stackList}>
                    {(data.recentEvents || []).slice(0, 5).map(event => <span key={event.id}>{formatStatus(event.event_type)} / {formatDate(event.created_at)}</span>)}
                  </div>
                </div>
              </section>
            )}
          </div>

          <aside className={styles.sideColumn}>
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Accuracy</h2>
                <span className={certificationTone(certification?.status)}>{formatStatus(certification?.status)}</span>
              </div>
              <div className={styles.sideStats}>
                <div><span>Study users</span><strong>{certification?.sampleSize ?? 0}/{certification?.targetSampleSize ?? 50}</strong></div>
                <div><span>P90 error</span><strong>{certification?.aggregateP90ErrorCm ? `${certification.aggregateP90ErrorCm}cm` : 'N/A'}</strong></div>
                <div><span>Failure rate</span><strong>{certification?.failureRatePct ?? 0}%</strong></div>
              </div>
              <p className={styles.mutedLine}>{certification?.claimLanguage}</p>
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Catalog</h2>
                <span className={styles.neutralPill}>{data.measurementCatalog?.version || 'catalog'}</span>
              </div>
              <div className={styles.sideStats}>
                <div><span>Total</span><strong>{data.measurementCatalog?.items.length || 0}</strong></div>
                <div><span>Required</span><strong>{requiredCatalogCount}</strong></div>
                <div><span>Side-view</span><strong>{sideViewCatalogCount}</strong></div>
                <div><span>Female</span><strong>{femaleCatalogCount}</strong></div>
              </div>
              <div className={styles.measurementChips}>
                {(data.measurementCatalog?.items || []).slice(0, 10).map(item => (
                  <span key={item.key} className={styles.measurementChip}>
                    <strong>{item.label}</strong> {item.requiresSideView ? 'side' : item.type}
                  </span>
                ))}
              </div>
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>App Links</h2>
                <span className={data.appLinks?.androidAppLinksReady && data.appLinks?.iosUniversalLinksReady ? styles.goodPill : styles.warnPill}>
                  {data.appLinks?.androidAppLinksReady && data.appLinks?.iosUniversalLinksReady ? 'ready' : 'needs env'}
                </span>
              </div>
              <div className={styles.sideStats}>
                <div><span>Scheme</span><strong>{data.appLinks?.scheme}</strong></div>
                <div><span>Android</span><strong>{data.appLinks?.androidAppLinksReady ? 'Ready' : 'Pending'}</strong></div>
                <div><span>iOS</span><strong>{data.appLinks?.iosUniversalLinksReady ? 'Ready' : 'Pending'}</strong></div>
              </div>
              <p className={styles.mutedLine}>{data.appLinks?.androidPackage}</p>
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Trust</h2>
                <span className={styles.goodPill}>{trust?.auditLogCount ?? 0} audit</span>
              </div>
              <p className={styles.mutedLine}>{trust?.imageRetention}</p>
              <p className={styles.mutedLine}>{trust?.bodyDataStorage}</p>
              <div className={styles.stackList}>
                {(trust?.controls || []).slice(0, 5).map(control => <span key={control}>{control}</span>)}
              </div>
            </section>

            {(user?.role === 'org_owner' || user?.role === 'org_admin') && (
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Add Staff</h2>
                <form onSubmit={handleInviteStaff} className={styles.staffForm}>
                  <input className={styles.input} placeholder="Full name" value={staffName} onChange={e => setStaffName(e.target.value)} required />
                  <input className={styles.input} type="email" placeholder="Email" value={staffEmail} onChange={e => setStaffEmail(e.target.value)} required />
                  <select className={styles.input} value={staffRole} onChange={e => setStaffRole(e.target.value)}>
                    <option value="staff">Staff</option>
                    <option value="org_admin">Org Admin</option>
                  </select>
                  <button className={styles.btnPrimary} type="submit" disabled={staffLoading}>{staffLoading ? 'Adding...' : 'Add staff'}</button>
                  {staffMsg && <p className={styles.msg}>{staffMsg}</p>}
                </form>
              </section>
            )}
          </aside>
        </div>
      </main>
    </>
  );
}
