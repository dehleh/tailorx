'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import AdminNav from '@/components/AdminNav';
import {
  getSuperAdminDashboard,
  getSuperAdminOrganization,
  bootstrapOrganization,
  suspendOrganization,
  activateOrganization,
  archiveOrganization,
  deleteOrganization,
  updateSuperAdminLicense,
  resetSuperAdminOwnerAccess,
  BootstrapOrgResult,
} from '@/lib/api';
import styles from './superadmin.module.css';

interface RevenueByCurrency {
  currency: string;
  amount: number;
  records: number;
}

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  brand_name: string;
  status: string;
  created_at: string;
  seats_purchased: number;
  scan_quota: number;
  scans_used: number;
  amount: number;
  currency: string;
  license_status?: string;
  owner_email?: string | null;
  session_count?: number;
  completed_session_count?: number;
  review_backlog?: number;
  billing_status?: string | null;
}

interface Summary {
  organizationCount: number;
  activeOrganizationCount?: number;
  suspendedOrganizationCount?: number;
  archivedOrganizationCount?: number;
  activeLicenseCount: number;
  totalScanQuota: number;
  totalScansUsed: number;
  utilizationRate: number;
  bookedRevenue: number;
  revenueByCurrency?: RevenueByCurrency[];
  totalSessions?: number;
  completedSessions?: number;
  failedSessions?: number;
  reviewBacklog?: number;
  apiStatus?: string;
  databaseStatus?: string;
  generatedAt?: string;
}

interface SuperAdminData {
  summary: Summary;
  organizations: OrgRow[];
}

interface OrgDetail {
  organization: {
    id: string;
    name: string;
    slug: string;
    brand_name: string;
    primary_color: string;
    status: string;
    created_at: string;
  };
  license: {
    id: string;
    seats_purchased: number;
    scan_quota: number;
    scans_used: number;
    status: string;
    billing_interval: string;
    amount: number;
    currency: string;
    starts_at: string;
    ends_at?: string | null;
  } | null;
  owner: {
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
    created_at: string;
  } | null;
  users: Array<{ id: string; name: string; email: string; role: string; status: string; created_at: string }>;
  billingRecords: Array<{
    id: string;
    amount: number;
    currency: string;
    status: string;
    billing_interval: string;
    checkout_url?: string;
    paystack_reference?: string;
    external_reference?: string;
    created_at: string;
  }>;
  recentSessions: Array<{
    id: string;
    status: string;
    review_status: string;
    accuracy_score?: number | null;
    measurement_id?: string | null;
    measurement_profile?: string | null;
    customer_name: string;
    customer_email: string;
    started_at: string;
    completed_at?: string | null;
  }>;
  inviteLinks: Array<{ id: string; code: string; label: string; campaign_name?: string; status: string; created_at: string }>;
  events: Array<{ id: string; event_type: string; payload?: Record<string, unknown>; actor_user_id?: string; created_at: string }>;
  auditLogs: Array<{ id: string; action: string; subject_type?: string; subject_id?: string; payload?: Record<string, unknown>; created_at: string }>;
  stats: {
    user_count: number;
    customer_count: number;
    session_count: number;
    completed_session_count: number;
    review_backlog: number;
  };
  accuracyCertification?: {
    status: string;
    sampleSize: number;
    targetSampleSize: number;
    failureRatePct: number;
    aggregateP90ErrorCm?: number | null;
    claimLanguage: string;
  };
}

type SortKey = 'name' | 'status' | 'scans_used' | 'session_count' | 'amount' | 'created_at';
type Notice = { type: 'success' | 'error' | 'info'; message: string };

const PAGE_SIZE = 10;

const getErrorMessage = (err: unknown, fallback: string) => {
  const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  return detail || fallback;
};

const formatDate = (value?: string | null) => {
  if (!value) return 'n/a';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'n/a';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatDateTime = (value?: string | null) => {
  if (!value) return 'n/a';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'n/a';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const formatMoney = (amount?: number | null, currency?: string | null) => {
  const safeAmount = Number(amount || 0);
  const safeCurrency = (currency || 'USD').toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: safeCurrency,
      maximumFractionDigits: safeAmount % 1 === 0 ? 0 : 2,
    }).format(safeAmount);
  } catch {
    return `${safeCurrency} ${safeAmount.toLocaleString()}`;
  }
};

const getStatusClass = (status?: string | null) => {
  switch ((status || '').toLowerCase()) {
    case 'active':
    case 'paid':
    case 'online':
    case 'reviewed':
      return styles.statusGood;
    case 'suspended':
    case 'pending':
    case 'collecting':
      return styles.statusWarn;
    case 'archived':
    case 'failed':
    case 'past_due':
    case 'needs_review':
      return styles.statusBad;
    default:
      return styles.statusNeutral;
  }
};

const sortValue = (org: OrgRow, key: SortKey): string | number => {
  if (key === 'name') return org.name.toLowerCase();
  if (key === 'status') return org.status.toLowerCase();
  if (key === 'scans_used') return org.scans_used || 0;
  if (key === 'session_count') return org.session_count || 0;
  if (key === 'amount') return org.amount || 0;
  return new Date(org.created_at).getTime() || 0;
};

export default function SuperAdminPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<SuperAdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [brandName, setBrandName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [seats, setSeats] = useState(10);
  const [scanQuota, setScanQuota] = useState(500);
  const [primaryColor, setPrimaryColor] = useState('#0F2B3C');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<BootstrapOrgResult | null>(null);

  const [actingId, setActingId] = useState<string | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [licenseDraft, setLicenseDraft] = useState({ seats: '10', scanQuota: '500', amount: '0', currency: 'USD' });
  const [savingLicense, setSavingLicense] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');

  const reload = async () => {
    try {
      setError('');
      const res = await getSuperAdminDashboard();
      setData(res.data as SuperAdminData);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load super admin dashboard.'));
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (organizationId: string, fallback?: OrgRow) => {
    setSelectedOrgId(organizationId);
    setDetailLoading(true);
    setDetailError('');
    setDeleteConfirm('');
    try {
      const res = await getSuperAdminOrganization(organizationId);
      const nextDetail = res.data as OrgDetail;
      setDetail(nextDetail);
      setLicenseDraft({
        seats: String(nextDetail.license?.seats_purchased ?? fallback?.seats_purchased ?? 10),
        scanQuota: String(nextDetail.license?.scan_quota ?? fallback?.scan_quota ?? 500),
        amount: String(nextDetail.license?.amount ?? fallback?.amount ?? 0),
        currency: nextDetail.license?.currency || fallback?.currency || 'USD',
      });
    } catch (err) {
      setDetail(null);
      setDetailError(getErrorMessage(err, 'Failed to load organization details.'));
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (user.role !== 'super_admin') {
      router.replace('/dashboard');
      return;
    }
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isLoading, router]);

  useEffect(() => {
    setPage(1);
  }, [filter, statusFilter, sortKey, sortDir]);

  const organizations = data?.organizations || [];
  const summary = data?.summary;

  const statusCounts = useMemo(() => {
    return organizations.reduce<Record<string, number>>((acc, org) => {
      const key = org.status || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }, [organizations]);

  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return organizations
      .filter(org => {
        if (statusFilter !== 'all' && org.status !== statusFilter) return false;
        if (!query) return true;
        return [
          org.name,
          org.brand_name,
          org.slug,
          org.owner_email || '',
          org.billing_status || '',
        ].some(value => value.toLowerCase().includes(query));
      })
      .sort((a, b) => {
        const av = sortValue(a, sortKey);
        const bv = sortValue(b, sortKey);
        if (av === bv) return 0;
        const result = av > bv ? 1 : -1;
        return sortDir === 'asc' ? result : -result;
      });
  }, [organizations, filter, statusFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const selectedOrg = detail?.organization || organizations.find(org => org.id === selectedOrgId) || null;

  const setSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(current => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(key === 'name' || key === 'status' ? 'asc' : 'desc');
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setNotice(null);
    setCreated(null);
    try {
      const res = await bootstrapOrganization({
        organizationName: orgName,
        adminName,
        adminEmail,
        seats,
        scanQuota,
        brandName: brandName || undefined,
        primaryColor,
      });
      setCreated(res.data);
      setNotice({ type: 'success', message: `Created ${orgName}. The owner can sign in with ${adminEmail}.` });
      setOrgName('');
      setBrandName('');
      setAdminName('');
      setAdminEmail('');
      setSeats(10);
      setScanQuota(500);
      setPrimaryColor('#0F2B3C');
      await reload();
    } catch (err) {
      setNotice({ type: 'error', message: getErrorMessage(err, 'Failed to create organization.') });
    } finally {
      setCreating(false);
    }
  };

  const refreshAfterAction = async (organizationId?: string | null) => {
    await reload();
    if (organizationId) {
      await loadDetail(organizationId);
    }
  };

  const handleSuspend = async (org: OrgRow) => {
    if (!window.confirm(`Suspend ${org.name}? Owner and staff access will be disabled until reactivated.`)) return;
    setActingId(org.id);
    try {
      await suspendOrganization(org.id);
      setNotice({ type: 'success', message: `${org.name} was suspended.` });
      await refreshAfterAction(org.id);
    } catch (err) {
      setNotice({ type: 'error', message: getErrorMessage(err, 'Failed to suspend organization.') });
    } finally {
      setActingId(null);
    }
  };

  const handleActivate = async (org: OrgRow) => {
    setActingId(org.id);
    try {
      await activateOrganization(org.id);
      setNotice({ type: 'success', message: `${org.name} is active again.` });
      await refreshAfterAction(org.id);
    } catch (err) {
      setNotice({ type: 'error', message: getErrorMessage(err, 'Failed to activate organization.') });
    } finally {
      setActingId(null);
    }
  };

  const handleArchive = async (org: OrgRow) => {
    if (!window.confirm(`Archive ${org.name}? This preserves data but disables organization access and scan usage.`)) return;
    setActingId(org.id);
    try {
      await archiveOrganization(org.id);
      setNotice({ type: 'success', message: `${org.name} was archived. Data is preserved.` });
      await refreshAfterAction(org.id);
    } catch (err) {
      setNotice({ type: 'error', message: getErrorMessage(err, 'Failed to archive organization.') });
    } finally {
      setActingId(null);
    }
  };

  const handleDelete = async () => {
    if (!selectedOrg || deleteConfirm !== selectedOrg.name) {
      setNotice({ type: 'error', message: 'Type the exact organization name before permanent deletion.' });
      return;
    }
    setActingId(selectedOrg.id);
    try {
      await deleteOrganization(selectedOrg.id);
      setNotice({ type: 'success', message: `${selectedOrg.name} was permanently deleted.` });
      setSelectedOrgId(null);
      setDetail(null);
      setDeleteConfirm('');
      await reload();
    } catch (err) {
      setNotice({ type: 'error', message: getErrorMessage(err, 'Failed to permanently delete organization.') });
    } finally {
      setActingId(null);
    }
  };

  const handleSaveLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId) return;
    const nextSeats = Math.max(1, Number.parseInt(licenseDraft.seats, 10) || 1);
    const nextQuota = Math.max(1, Number.parseInt(licenseDraft.scanQuota, 10) || 1);
    const nextAmount = Math.max(0, Number.parseFloat(licenseDraft.amount) || 0);
    setSavingLicense(true);
    try {
      const res = await updateSuperAdminLicense(selectedOrgId, {
        seats: nextSeats,
        scanQuota: nextQuota,
        amount: nextAmount,
        currency: licenseDraft.currency.trim().toUpperCase() || 'USD',
      });
      setDetail(res.data as OrgDetail);
      setNotice({ type: 'success', message: 'License seats, quota, and billing amount were updated.' });
      await reload();
    } catch (err) {
      setNotice({ type: 'error', message: getErrorMessage(err, 'Failed to update license.') });
    } finally {
      setSavingLicense(false);
    }
  };

  const handleResetOwnerAccess = async () => {
    if (!selectedOrgId) return;
    setActingId(selectedOrgId);
    try {
      const res = await resetSuperAdminOwnerAccess(selectedOrgId, {
        ownerUserId: detail?.owner?.id,
        sendOtp: true,
      });
      const otpSent = Boolean((res.data as { otpSent?: boolean }).otpSent);
      setNotice({
        type: otpSent ? 'success' : 'info',
        message: otpSent
          ? 'Owner access was reset and a login code was emailed.'
          : 'Owner access was reset. Email delivery is not configured or did not confirm delivery.',
      });
      await refreshAfterAction(selectedOrgId);
    } catch (err) {
      setNotice({ type: 'error', message: getErrorMessage(err, 'Failed to reset owner access.') });
    } finally {
      setActingId(null);
    }
  };

  if (isLoading || loading) {
    return (
      <>
        <AdminNav />
        <main className={styles.main}>
          <div className={styles.stateCard}>Loading platform operations...</div>
        </main>
      </>
    );
  }

  if (error) {
    return (
      <>
        <AdminNav />
        <main className={styles.main}>
          <div className={`${styles.stateCard} ${styles.stateError}`}>
            <strong>{error}</strong>
            <button className={styles.btnSecondary} onClick={() => void reload()}>Retry</button>
          </div>
        </main>
      </>
    );
  }

  if (!data || !summary) return null;

  return (
    <>
      <AdminNav />
      <main className={styles.main}>
        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Platform Operations</p>
            <h1 className={styles.title}>Super Admin</h1>
            <p className={styles.subtitle}>
              Monitor organizations, license usage, billing status, scans, and operational risk.
            </p>
          </div>
          <div className={styles.headerActions}>
            <button className={styles.btnSecondary} onClick={() => void reload()}>Refresh</button>
            <button className={styles.btnPrimary} onClick={() => setShowCreateForm(current => !current)}>
              {showCreateForm ? 'Hide form' : 'New organization'}
            </button>
          </div>
        </div>

        {notice && (
          <div className={`${styles.notice} ${notice.type === 'success' ? styles.noticeSuccess : notice.type === 'error' ? styles.noticeError : styles.noticeInfo}`}>
            <span>{notice.message}</span>
            <button type="button" onClick={() => setNotice(null)}>Dismiss</button>
          </div>
        )}

        {showCreateForm && (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Onboard Organization</h2>
                <p className={styles.sectionHint}>Creates an owner account, active license, trial invite, and branded tenant profile.</p>
              </div>
            </div>
            <form onSubmit={handleCreateOrg} className={styles.createForm}>
              <label className={styles.field}>
                <span>Organization name</span>
                <input className={styles.input} value={orgName} onChange={e => setOrgName(e.target.value)} required />
              </label>
              <label className={styles.field}>
                <span>Brand name</span>
                <input className={styles.input} value={brandName} onChange={e => setBrandName(e.target.value)} placeholder="Optional public brand" />
              </label>
              <label className={styles.field}>
                <span>Owner full name</span>
                <input className={styles.input} value={adminName} onChange={e => setAdminName(e.target.value)} required />
              </label>
              <label className={styles.field}>
                <span>Owner email</span>
                <input className={styles.input} type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} required />
              </label>
              <label className={styles.field}>
                <span>Seat limit</span>
                <input className={styles.input} type="number" min={1} value={seats} onChange={e => setSeats(Number.parseInt(e.target.value, 10) || 1)} required />
              </label>
              <label className={styles.field}>
                <span>Monthly scan quota</span>
                <input className={styles.input} type="number" min={1} value={scanQuota} onChange={e => setScanQuota(Number.parseInt(e.target.value, 10) || 1)} required />
              </label>
              <label className={`${styles.field} ${styles.colorField}`}>
                <span>Brand color</span>
                <input className={styles.colorInput} type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} />
                <strong>{primaryColor}</strong>
              </label>
              <div className={styles.formActions}>
                <button className={styles.btnPrimary} type="submit" disabled={creating}>
                  {creating ? 'Creating...' : 'Create organization'}
                </button>
              </div>
              {created && (
                <div className={styles.createdCard}>
                  <span>Default invite code</span>
                  <strong>{created.defaultInviteCode}</strong>
                  <p>Owner login uses email OTP at /login. Keep this invite code for first customer testing.</p>
                </div>
              )}
            </form>
          </section>
        )}

        <section className={styles.metricGrid}>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>Organizations</span>
            <strong className={styles.metricValue}>{summary.organizationCount}</strong>
            <small>{summary.activeOrganizationCount ?? statusCounts.active ?? 0} active</small>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>Licenses</span>
            <strong className={styles.metricValue}>{summary.activeLicenseCount}</strong>
            <small>{summary.suspendedOrganizationCount ?? statusCounts.suspended ?? 0} suspended</small>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>Scans</span>
            <strong className={styles.metricValue}>{summary.totalScansUsed.toLocaleString()}</strong>
            <small>{summary.totalScanQuota.toLocaleString()} quota</small>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>Review Backlog</span>
            <strong className={styles.metricValue}>{summary.reviewBacklog ?? 0}</strong>
            <small>{summary.completedSessions ?? 0} completed sessions</small>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>Failed Scans</span>
            <strong className={styles.metricValue}>{summary.failedSessions ?? 0}</strong>
            <small>{summary.totalSessions ?? 0} total sessions</small>
          </div>
        </section>

        <div className={styles.overviewGrid}>
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Platform Quota Usage</h2>
                <p className={styles.sectionHint}>{summary.totalScansUsed.toLocaleString()} of {summary.totalScanQuota.toLocaleString()} scans consumed</p>
              </div>
              <strong>{summary.utilizationRate}%</strong>
            </div>
            <div className={styles.progressTrack}>
              <div
                className={styles.progressFill}
                data-risk={summary.utilizationRate > 90 ? 'high' : summary.utilizationRate > 70 ? 'medium' : 'low'}
                style={{ width: `${Math.min(summary.utilizationRate, 100)}%` }}
              />
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Revenue by Currency</h2>
                <p className={styles.sectionHint}>Pending and paid billing records are grouped without mixing currencies.</p>
              </div>
            </div>
            <div className={styles.revenueList}>
              {(summary.revenueByCurrency || []).length > 0 ? (
                summary.revenueByCurrency?.map(item => (
                  <div key={item.currency} className={styles.revenueRow}>
                    <span>{item.currency}</span>
                    <strong>{formatMoney(item.amount, item.currency)}</strong>
                    <small>{item.records} records</small>
                  </div>
                ))
              ) : (
                <p className={styles.emptyText}>No billing records yet.</p>
              )}
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Service Health</h2>
                <p className={styles.sectionHint}>Last refreshed {formatDateTime(summary.generatedAt)}</p>
              </div>
            </div>
            <div className={styles.healthList}>
              <div><span>API</span><strong className={getStatusClass(summary.apiStatus)}>{summary.apiStatus || 'online'}</strong></div>
              <div><span>Database</span><strong className={getStatusClass(summary.databaseStatus)}>{summary.databaseStatus || 'online'}</strong></div>
              <div><span>Archived orgs</span><strong>{summary.archivedOrganizationCount ?? statusCounts.archived ?? 0}</strong></div>
            </div>
          </section>
        </div>

        <section className={styles.section}>
          <div className={styles.tableHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Organizations</h2>
              <p className={styles.sectionHint}>{filtered.length} matching organizations</p>
            </div>
            <div className={styles.tableControls}>
              <input
                className={styles.input}
                placeholder="Search name, slug, owner, billing..."
                value={filter}
                onChange={e => setFilter(e.target.value)}
              />
              <select className={styles.input} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th><button onClick={() => setSort('name')}>Organization</button></th>
                  <th>Owner</th>
                  <th><button onClick={() => setSort('status')}>Status</button></th>
                  <th>License</th>
                  <th><button onClick={() => setSort('scans_used')}>Usage</button></th>
                  <th><button onClick={() => setSort('session_count')}>Sessions</button></th>
                  <th><button onClick={() => setSort('amount')}>Revenue</button></th>
                  <th><button onClick={() => setSort('created_at')}>Created</button></th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map(org => {
                  const pct = org.scan_quota > 0 ? Math.round((org.scans_used / org.scan_quota) * 100) : 0;
                  return (
                    <tr key={org.id} onClick={() => void loadDetail(org.id, org)} className={styles.clickableRow}>
                      <td>
                        <strong>{org.name}</strong>
                        <span>{org.brand_name || org.slug}</span>
                      </td>
                      <td>
                        <span>{org.owner_email || 'No owner'}</span>
                        <small>{org.slug}</small>
                      </td>
                      <td><span className={`${styles.statusPill} ${getStatusClass(org.status)}`}>{org.status}</span></td>
                      <td>
                        <span className={`${styles.statusPill} ${getStatusClass(org.license_status)}`}>{org.license_status || 'none'}</span>
                        <small>{org.seats_purchased} seats</small>
                      </td>
                      <td>
                        <div className={styles.usageCell}>
                          <div className={styles.miniTrack}><div style={{ width: `${Math.min(pct, 100)}%` }} /></div>
                          <small>{org.scans_used}/{org.scan_quota} scans</small>
                        </div>
                      </td>
                      <td>
                        <strong>{org.session_count || 0}</strong>
                        <small>{org.review_backlog || 0} review</small>
                      </td>
                      <td>
                        <span>{formatMoney(org.amount, org.currency || 'USD')}</span>
                        <small>{org.billing_status || 'no billing'}</small>
                      </td>
                      <td>{formatDate(org.created_at)}</td>
                      <td>
                        <div className={styles.rowActions}>
                          <button type="button" className={styles.btnGhost} onClick={e => { e.stopPropagation(); void loadDetail(org.id, org); }}>Details</button>
                          {org.status === 'active' ? (
                            <button type="button" className={styles.btnWarn} disabled={actingId === org.id} onClick={e => { e.stopPropagation(); void handleSuspend(org); }}>Suspend</button>
                          ) : (
                            <button type="button" className={styles.btnGood} disabled={actingId === org.id} onClick={e => { e.stopPropagation(); void handleActivate(org); }}>Activate</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={9}>
                      <div className={styles.emptyState}>
                        <strong>No organizations match these filters.</strong>
                        <span>Clear search or status filters to see more tenants.</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className={styles.pagination}>
            <span>Page {currentPage} of {totalPages}</span>
            <div>
              <button className={styles.btnSecondary} disabled={currentPage === 1} onClick={() => setPage(current => Math.max(1, current - 1))}>Previous</button>
              <button className={styles.btnSecondary} disabled={currentPage === totalPages} onClick={() => setPage(current => Math.min(totalPages, current + 1))}>Next</button>
            </div>
          </div>
        </section>
      </main>

      {selectedOrgId && (
        <aside className={styles.drawer} aria-label="Organization details">
          <div className={styles.drawerPanel}>
            <div className={styles.drawerHeader}>
              <div>
                <p className={styles.eyebrow}>Organization Detail</p>
                <h2>{selectedOrg?.name || 'Loading organization'}</h2>
                {selectedOrg && <span className={`${styles.statusPill} ${getStatusClass(selectedOrg.status)}`}>{selectedOrg.status}</span>}
              </div>
              <button className={styles.btnSecondary} onClick={() => { setSelectedOrgId(null); setDetail(null); }}>Close</button>
            </div>

            {detailLoading && <div className={styles.stateCard}>Loading organization details...</div>}
            {detailError && <div className={`${styles.stateCard} ${styles.stateError}`}>{detailError}</div>}

            {detail && (
              <div className={styles.drawerBody}>
                <div className={styles.detailStats}>
                  <div><span>Users</span><strong>{detail.stats.user_count}</strong></div>
                  <div><span>Customers</span><strong>{detail.stats.customer_count}</strong></div>
                  <div><span>Sessions</span><strong>{detail.stats.session_count}</strong></div>
                  <div><span>Review</span><strong>{detail.stats.review_backlog}</strong></div>
                </div>

                <section className={styles.detailSection}>
                  <h3>License Controls</h3>
                  <form className={styles.licenseForm} onSubmit={handleSaveLicense}>
                    <label className={styles.field}>
                      <span>Seat limit</span>
                      <input className={styles.input} type="number" min={1} value={licenseDraft.seats} onChange={e => setLicenseDraft(current => ({ ...current, seats: e.target.value }))} />
                    </label>
                    <label className={styles.field}>
                      <span>Scan quota</span>
                      <input className={styles.input} type="number" min={1} value={licenseDraft.scanQuota} onChange={e => setLicenseDraft(current => ({ ...current, scanQuota: e.target.value }))} />
                    </label>
                    <label className={styles.field}>
                      <span>Billing amount</span>
                      <input className={styles.input} type="number" min={0} step="0.01" value={licenseDraft.amount} onChange={e => setLicenseDraft(current => ({ ...current, amount: e.target.value }))} />
                    </label>
                    <label className={styles.field}>
                      <span>Currency</span>
                      <input className={styles.input} maxLength={8} value={licenseDraft.currency} onChange={e => setLicenseDraft(current => ({ ...current, currency: e.target.value.toUpperCase() }))} />
                    </label>
                    <button className={styles.btnPrimary} type="submit" disabled={savingLicense}>{savingLicense ? 'Saving...' : 'Save license'}</button>
                  </form>
                  <p className={styles.sectionHint}>
                    Used {detail.license?.scans_used ?? 0} of {detail.license?.scan_quota ?? 0} scans. Billing interval: {detail.license?.billing_interval || 'n/a'}.
                  </p>
                </section>

                <section className={styles.detailSection}>
                  <div className={styles.splitHeader}>
                    <div>
                      <h3>Owner Access</h3>
                      <p>{detail.owner ? `${detail.owner.name} - ${detail.owner.email}` : 'No owner account found.'}</p>
                    </div>
                    <button className={styles.btnSecondary} disabled={!detail.owner || actingId === selectedOrgId} onClick={() => void handleResetOwnerAccess()}>
                      Reset owner access
                    </button>
                  </div>
                </section>

                <section className={styles.detailSection}>
                  <h3>Accuracy Claim Status</h3>
                  <div className={styles.claimBox}>
                    <span className={`${styles.statusPill} ${getStatusClass(detail.accuracyCertification?.status)}`}>{detail.accuracyCertification?.status || 'unverified'}</span>
                    <p>{detail.accuracyCertification?.claimLanguage || 'No benchmark records are stored yet.'}</p>
                    <small>{detail.accuracyCertification?.sampleSize || 0}/{detail.accuracyCertification?.targetSampleSize || 50} benchmark samples</small>
                  </div>
                </section>

                <section className={styles.detailSection}>
                  <h3>Billing Records</h3>
                  <div className={styles.compactList}>
                    {detail.billingRecords.length > 0 ? detail.billingRecords.map(record => (
                      <div key={record.id}>
                        <span>{formatMoney(record.amount, record.currency)}</span>
                        <strong className={getStatusClass(record.status)}>{record.status}</strong>
                        <small>{formatDate(record.created_at)}</small>
                      </div>
                    )) : <p className={styles.emptyText}>No billing records yet.</p>}
                  </div>
                </section>

                <section className={styles.detailSection}>
                  <h3>Recent Scans</h3>
                  <div className={styles.compactList}>
                    {detail.recentSessions.length > 0 ? detail.recentSessions.map(session => (
                      <div key={session.id}>
                        <span>{session.customer_name}</span>
                        <strong className={getStatusClass(session.review_status)}>{session.review_status}</strong>
                        <small>{session.status} - {formatDateTime(session.started_at)}</small>
                      </div>
                    )) : <p className={styles.emptyText}>No scan sessions yet.</p>}
                  </div>
                </section>

                <section className={styles.detailSection}>
                  <h3>Recent Events</h3>
                  <div className={styles.compactList}>
                    {detail.events.length > 0 ? detail.events.map(event => (
                      <div key={event.id}>
                        <span>{event.event_type.replaceAll('_', ' ')}</span>
                        <small>{formatDateTime(event.created_at)}</small>
                      </div>
                    )) : <p className={styles.emptyText}>No organization events yet.</p>}
                  </div>
                </section>

                <section className={styles.detailSection}>
                  <h3>Audit Log</h3>
                  <div className={styles.compactList}>
                    {detail.auditLogs.length > 0 ? detail.auditLogs.map(log => (
                      <div key={log.id}>
                        <span>{log.action.replaceAll('_', ' ')}</span>
                        <small>{log.subject_type || 'platform'} - {formatDateTime(log.created_at)}</small>
                      </div>
                    )) : <p className={styles.emptyText}>No audit logs yet.</p>}
                  </div>
                </section>

                <section className={`${styles.detailSection} ${styles.dangerZone}`}>
                  <h3>Danger Zone</h3>
                  <p>Archive first when you need to disable access but keep customer, scan, billing, event, and audit data.</p>
                  <div className={styles.dangerActions}>
                    <button className={styles.btnWarn} disabled={actingId === selectedOrgId || selectedOrg?.status === 'archived'} onClick={() => selectedOrg && void handleArchive(selectedOrg as OrgRow)}>
                      Archive organization
                    </button>
                  </div>
                  <label className={styles.field}>
                    <span>Type "{selectedOrg?.name}" to permanently delete all tenant data</span>
                    <input className={styles.input} value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} />
                  </label>
                  <button className={styles.btnDanger} disabled={actingId === selectedOrgId || deleteConfirm !== selectedOrg?.name} onClick={() => void handleDelete()}>
                    Permanently delete
                  </button>
                </section>
              </div>
            )}
          </div>
        </aside>
      )}
    </>
  );
}
