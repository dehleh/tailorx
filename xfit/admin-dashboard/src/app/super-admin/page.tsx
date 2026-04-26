'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import AdminNav from '@/components/AdminNav';
import {
  getSuperAdminDashboard,
  bootstrapOrganization,
  suspendOrganization,
  activateOrganization,
  deleteOrganization,
  BootstrapOrgResult,
} from '@/lib/api';
import styles from './superadmin.module.css';

interface OrgRow {
  id: string; name: string; slug: string; brand_name: string; status: string;
  created_at: string; seats_purchased: number; scan_quota: number;
  scans_used: number; amount: number; currency: string;
}

interface Summary {
  organizationCount: number; activeLicenseCount: number;
  totalScanQuota: number; totalScansUsed: number;
  utilizationRate: number; bookedRevenue: number;
}

interface SuperAdminData {
  summary: Summary;
  organizations: OrgRow[];
}

export default function SuperAdminPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<SuperAdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');

  // Create-organization form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [brandName, setBrandName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [seats, setSeats] = useState(10);
  const [scanQuota, setScanQuota] = useState(500);
  const [primaryColor, setPrimaryColor] = useState('#0F2B3C');
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState('');
  const [created, setCreated] = useState<BootstrapOrgResult | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const handleSuspend = async (org: OrgRow) => {
    if (!confirm(`Suspend "${org.name}"? Users will not be able to sign in or consume scans until reactivated.`)) return;
    setActingId(org.id);
    try { await suspendOrganization(org.id); await reload(); }
    catch { alert('Failed to suspend organization.'); }
    finally { setActingId(null); }
  };

  const handleActivate = async (org: OrgRow) => {
    setActingId(org.id);
    try { await activateOrganization(org.id); await reload(); }
    catch { alert('Failed to activate organization.'); }
    finally { setActingId(null); }
  };

  const handleDelete = async (org: OrgRow) => {
    const confirmText = prompt(`This permanently deletes "${org.name}" and ALL its data (users, licenses, invites, customers, sessions, billing). This cannot be undone.\n\nType the org name to confirm:`);
    if (confirmText !== org.name) {
      if (confirmText !== null) alert('Name did not match. Cancelled.');
      return;
    }
    setActingId(org.id);
    try { await deleteOrganization(org.id); await reload(); }
    catch { alert('Failed to delete organization.'); }
    finally { setActingId(null); }
  };

  const reload = async () => {
    try {
      const res = await getSuperAdminDashboard();
      setData(res.data as SuperAdminData);
    } catch {
      setError('Failed to load super admin dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isLoading) return;
    if (!user) { router.replace('/login'); return; }
    if (user.role !== 'super_admin') { router.replace('/dashboard'); return; }
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isLoading, router]);

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateMsg('');
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
      setCreateMsg(`\u2713 Created "${orgName}". Owner can log in at /login with ${adminEmail}.`);
      setOrgName(''); setBrandName(''); setAdminName(''); setAdminEmail('');
      setSeats(10); setScanQuota(500); setPrimaryColor('#0F2B3C');
      await reload();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setCreateMsg(detail || 'Failed to create organization.');
    } finally {
      setCreating(false);
    }
  };

  if (isLoading || loading) return <><AdminNav /><div className={styles.center}>Loading…</div></>;
  if (error) return <><AdminNav /><div className={styles.center} style={{ color: 'var(--error)' }}>{error}</div></>;
  if (!data) return null;

  const { summary, organizations } = data;
  const filtered = filter
    ? organizations.filter(o =>
        o.name.toLowerCase().includes(filter.toLowerCase()) ||
        o.brand_name.toLowerCase().includes(filter.toLowerCase()) ||
        o.slug.toLowerCase().includes(filter.toLowerCase())
      )
    : organizations;

  return (
    <>
      <AdminNav />
      <main className={styles.main}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Super Admin</h1>
            <p className={styles.subtitle}>All organizations and platform metrics</p>
          </div>
          <button
            className={styles.btnPrimary}
            onClick={() => setShowCreateForm(s => !s)}
          >
            {showCreateForm ? 'Close' : '+ Create Organization'}
          </button>
        </div>

        {showCreateForm && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Onboard a new organization</h2>
            <form onSubmit={handleCreateOrg} className={styles.inlineForm}>
              <div className={styles.formRow}>
                <input className={styles.input} placeholder="Organization name" value={orgName}
                  onChange={e => setOrgName(e.target.value)} required />
                <input className={styles.input} placeholder="Brand name (optional)" value={brandName}
                  onChange={e => setBrandName(e.target.value)} />
              </div>
              <div className={styles.formRow}>
                <input className={styles.input} placeholder="Owner full name" value={adminName}
                  onChange={e => setAdminName(e.target.value)} required />
                <input className={styles.input} type="email" placeholder="Owner email" value={adminEmail}
                  onChange={e => setAdminEmail(e.target.value)} required />
              </div>
              <div className={styles.formRow}>
                <input className={styles.input} type="number" min={1} placeholder="Seats" value={seats}
                  onChange={e => setSeats(parseInt(e.target.value) || 1)} required />
                <input className={styles.input} type="number" min={1} placeholder="Scan quota" value={scanQuota}
                  onChange={e => setScanQuota(parseInt(e.target.value) || 1)} required />
                <input className={styles.input} type="color" value={primaryColor}
                  onChange={e => setPrimaryColor(e.target.value)} title="Primary brand color"
                  style={{ maxWidth: 80, padding: 4 }} />
                <button className={styles.btnPrimary} type="submit" disabled={creating}>
                  {creating ? 'Creating\u2026' : 'Create'}
                </button>
              </div>
              {createMsg && (
                <p className={styles.msg}
                  style={{ color: createMsg.startsWith('\u2713') ? 'var(--success)' : 'var(--error)' }}>
                  {createMsg}
                </p>
              )}
              {created && (
                <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'var(--surface-alt, #1a1a1a)', borderRadius: 8, fontSize: '0.85rem' }}>
                  <p style={{ margin: 0, color: 'var(--text-muted)' }}>Default invite code:</p>
                  <p style={{ margin: '0.25rem 0', fontFamily: 'monospace', fontWeight: 600 }}>{created.defaultInviteCode}</p>
                  <p style={{ margin: '0.5rem 0 0', color: 'var(--text-muted)' }}>Owner can sign in at <code>/login</code> with the email above (OTP will be emailed).</p>
                </div>
              )}
            </form>
          </section>
        )}

        {/* Platform summary */}
        <div className={styles.metricGrid}>
          <div className={styles.metricCard}>
            <p className={styles.metricLabel}>Organizations</p>
            <p className={styles.metricValue}>{summary.organizationCount}</p>
          </div>
          <div className={styles.metricCard}>
            <p className={styles.metricLabel}>Active Licenses</p>
            <p className={styles.metricValue}>{summary.activeLicenseCount}</p>
          </div>
          <div className={styles.metricCard}>
            <p className={styles.metricLabel}>Total Scans</p>
            <p className={styles.metricValue}>{summary.totalScansUsed.toLocaleString()}</p>
          </div>
          <div className={styles.metricCard}>
            <p className={styles.metricLabel}>Platform Utilization</p>
            <p className={styles.metricValue}>{summary.utilizationRate}%</p>
          </div>
          <div className={styles.metricCard}>
            <p className={styles.metricLabel}>Booked Revenue</p>
            <p className={styles.metricValue}>${summary.bookedRevenue.toLocaleString()}</p>
          </div>
        </div>

        {/* Quota overview bar */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Platform Quota Usage</h2>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{summary.totalScansUsed.toLocaleString()} / {summary.totalScanQuota.toLocaleString()}</span>
            <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{summary.utilizationRate}%</span>
          </div>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${Math.min(summary.utilizationRate, 100)}%`, background: summary.utilizationRate > 90 ? 'var(--error)' : summary.utilizationRate > 70 ? 'var(--warning)' : 'var(--success)' }} />
          </div>
        </section>

        {/* Organizations table */}
        <section className={styles.section}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h2 className={styles.sectionTitle} style={{ margin: 0 }}>Organizations</h2>
            <input
              className={styles.input}
              style={{ maxWidth: 240 }}
              placeholder="Filter by name / slug…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
            />
          </div>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th><th>Brand</th><th>Slug</th><th>Status</th>
                  <th>Seats</th><th>Scans Used / Quota</th><th>Revenue</th><th>Created</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(org => {
                  const pct = org.scan_quota > 0 ? Math.round((org.scans_used / org.scan_quota) * 100) : 0;
                  return (
                    <tr key={org.id}>
                      <td style={{ fontWeight: 600 }}>{org.name}</td>
                      <td>{org.brand_name}</td>
                      <td><code style={{ fontSize: '0.8rem' }}>{org.slug}</code></td>
                      <td>
                        <span style={{ color: org.status === 'active' ? 'var(--success)' : 'var(--error)', fontWeight: 600 }}>
                          {org.status}
                        </span>
                      </td>
                      <td>{org.seats_purchased}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden', minWidth: 60 }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: pct > 90 ? 'var(--error)' : pct > 70 ? 'var(--warning)' : 'var(--success)', borderRadius: 99 }} />
                          </div>
                          <span style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{org.scans_used}/{org.scan_quota}</span>
                        </div>
                      </td>
                      <td>{org.currency} {org.amount?.toLocaleString()}</td>
                      <td>{new Date(org.created_at).toLocaleDateString()}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                          {org.status === 'active' ? (
                            <button
                              onClick={() => handleSuspend(org)}
                              disabled={actingId === org.id}
                              style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', background: 'var(--warning, #c97c00)', color: '#fff', border: 0, borderRadius: 4, cursor: 'pointer' }}
                            >Suspend</button>
                          ) : (
                            <button
                              onClick={() => handleActivate(org)}
                              disabled={actingId === org.id}
                              style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', background: 'var(--success, #2a9d4a)', color: '#fff', border: 0, borderRadius: 4, cursor: 'pointer' }}
                            >Activate</button>
                          )}
                          <button
                            onClick={() => handleDelete(org)}
                            disabled={actingId === org.id}
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', background: 'var(--error, #c0392b)', color: '#fff', border: 0, borderRadius: 4, cursor: 'pointer' }}
                          >Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem' }}>No organizations found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}
