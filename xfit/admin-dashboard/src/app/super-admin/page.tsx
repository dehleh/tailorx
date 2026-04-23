'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import AdminNav from '@/components/AdminNav';
import { getSuperAdminDashboard } from '@/lib/api';
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

  useEffect(() => {
    if (isLoading) return;
    if (!user) { router.replace('/login'); return; }
    if (user.role !== 'super_admin') { router.replace('/dashboard'); return; }

    (async () => {
      try {
        const res = await getSuperAdminDashboard();
        setData(res.data as SuperAdminData);
      } catch {
        setError('Failed to load super admin dashboard.');
      } finally {
        setLoading(false);
      }
    })();
  }, [user, isLoading, router]);

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
        </div>

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
                  <th>Seats</th><th>Scans Used / Quota</th><th>Revenue</th><th>Created</th>
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
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem' }}>No organizations found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}
