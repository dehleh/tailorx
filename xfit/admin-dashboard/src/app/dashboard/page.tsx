'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import AdminNav from '@/components/AdminNav';
import { getOrgDashboard, createInviteLink, createBillingCheckout, inviteStaff } from '@/lib/api';
import styles from './dashboard.module.css';

interface DashboardData {
  organization: {
    id: string; name: string; brandName: string; primaryColor: string;
    imprint: string; status: string; createdAt: string;
  };
  license: {
    id: string; seatsPurchased: number; scanQuota: number; scansUsed: number;
    remainingQuota: number; status: string; billingInterval: string;
    amount: number; currency: string; endsAt: string;
  };
  metrics: { staffCount: number; customerCount: number; sessionCount: number };
  recentSessions: Array<{
    id: string; status: string; started_at: string; completed_at?: string;
    accuracy_score?: number; customer_name: string; customer_email: string;
    invite_code: string; invite_label: string;
  }>;
  inviteLinks: Array<{
    id: string; code: string; label: string; campaign_name?: string;
    status: string; created_at: string; publicUrl: string;
  }>;
}

export default function DashboardPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Invite link form
  const [inviteLabel, setInviteLabel] = useState('');
  const [inviteHeadline, setInviteHeadline] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteMsg, setInviteMsg] = useState('');

  // Staff invite form
  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffRole, setStaffRole] = useState('staff');
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffMsg, setStaffMsg] = useState('');

  const loadDashboard = useCallback(async (orgId: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await getOrgDashboard(orgId);
      setData(res.data as DashboardData);
    } catch {
      setError('Failed to load dashboard. Make sure your session is still active.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (!user) { router.replace('/login'); return; }
    if (user.role === 'super_admin') { router.replace('/super-admin'); return; }
    if (!user.organizationId) { setError('No organization linked to your account.'); setLoading(false); return; }
    loadDashboard(user.organizationId);
  }, [user, isLoading, router, loadDashboard]);

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.organizationId || !inviteLabel) return;
    setInviteLoading(true); setInviteMsg('');
    try {
      const res = await createInviteLink(user.organizationId, {
        label: inviteLabel,
        landingHeadline: inviteHeadline || undefined,
      });
      const link = res.data as { code: string; publicUrl: string };
      setInviteMsg(`✓ Created: ${link.publicUrl}`);
      setInviteLabel(''); setInviteHeadline('');
      loadDashboard(user.organizationId);
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
      setStaffMsg(`✓ ${staffName} added as ${staffRole}`);
      setStaffName(''); setStaffEmail('');
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

  if (isLoading || loading) return <><AdminNav /><div className={styles.center}>Loading…</div></>;
  if (error) return <><AdminNav /><div className={styles.center} style={{ color: 'var(--error)' }}>{error}</div></>;
  if (!data) return null;

  const { organization, license, metrics, recentSessions, inviteLinks } = data;
  const usagePct = license.scanQuota > 0 ? Math.round((license.scansUsed / license.scanQuota) * 100) : 0;
  const licenseColor = license.status === 'active' ? 'var(--success)' : license.status === 'past_due' ? 'var(--warning)' : 'var(--error)';

  return (
    <>
      <AdminNav />
      <main className={styles.main}>
        {/* Header */}
        <div className={styles.header}>
          <div>
            <h1 className={styles.orgName}>{organization.brandName}</h1>
            <p className={styles.orgMeta}>{organization.name} · {organization.status}</p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <span style={{ background: licenseColor, color: '#fff', borderRadius: 20, padding: '4px 12px', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase' }}>
              License: {license.status}
            </span>
            {(license.status === 'past_due' || license.status !== 'active') && (
              <button className={styles.btnPrimary} onClick={handleCheckout}>Renew with Paystack</button>
            )}
          </div>
        </div>

        {/* Metrics row */}
        <div className={styles.metricGrid}>
          <div className={styles.metricCard}>
            <p className={styles.metricLabel}>Staff</p>
            <p className={styles.metricValue}>{metrics.staffCount}</p>
          </div>
          <div className={styles.metricCard}>
            <p className={styles.metricLabel}>Customers</p>
            <p className={styles.metricValue}>{metrics.customerCount}</p>
          </div>
          <div className={styles.metricCard}>
            <p className={styles.metricLabel}>Sessions</p>
            <p className={styles.metricValue}>{metrics.sessionCount}</p>
          </div>
          <div className={styles.metricCard}>
            <p className={styles.metricLabel}>Seats purchased</p>
            <p className={styles.metricValue}>{license.seatsPurchased}</p>
          </div>
        </div>

        {/* Quota bar */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Scan Quota</h2>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{license.scansUsed} / {license.scanQuota} scans used</span>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{usagePct}%</span>
          </div>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${usagePct}%`, background: usagePct > 90 ? 'var(--error)' : usagePct > 70 ? 'var(--warning)' : 'var(--success)' }} />
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
            {license.remainingQuota} remaining · Renews: {license.endsAt ? new Date(license.endsAt).toLocaleDateString() : '—'}
          </p>
          {usagePct >= 80 && (
            <button className={styles.btnPrimary} style={{ marginTop: '0.75rem' }} onClick={handleCheckout}>
              Top up quota with Paystack
            </button>
          )}
        </section>

        {/* Invite Links */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Invite Links</h2>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr><th>Label</th><th>Code</th><th>Status</th><th>Public URL</th><th>Created</th></tr>
              </thead>
              <tbody>
                {inviteLinks.map(il => (
                  <tr key={il.id}>
                    <td>{il.label}</td>
                    <td><code>{il.code}</code></td>
                    <td><span style={{ color: il.status === 'active' ? 'var(--success)' : 'var(--error)' }}>{il.status}</span></td>
                    <td><a href={il.publicUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--brand)', textDecoration: 'underline' }}>{il.publicUrl}</a></td>
                    <td>{new Date(il.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
                {inviteLinks.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No invite links yet</td></tr>}
              </tbody>
            </table>
          </div>

          <form onSubmit={handleCreateInvite} className={styles.inlineForm}>
            <h3 className={styles.subTitle}>Create new invite link</h3>
            <div className={styles.formRow}>
              <input className={styles.input} placeholder="Label (e.g. Spring 2026 Campaign)" value={inviteLabel} onChange={e => setInviteLabel(e.target.value)} required />
              <input className={styles.input} placeholder="Landing headline (optional)" value={inviteHeadline} onChange={e => setInviteHeadline(e.target.value)} />
              <button className={styles.btnPrimary} type="submit" disabled={inviteLoading}>{inviteLoading ? 'Creating…' : 'Create link'}</button>
            </div>
            {inviteMsg && <p className={styles.msg} style={{ color: inviteMsg.startsWith('✓') ? 'var(--success)' : 'var(--error)' }}>{inviteMsg}</p>}
          </form>
        </section>

        {/* Staff management */}
        {(user?.role === 'org_owner' || user?.role === 'org_admin') && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Add Staff</h2>
            <form onSubmit={handleInviteStaff} className={styles.inlineForm}>
              <div className={styles.formRow}>
                <input className={styles.input} placeholder="Full name" value={staffName} onChange={e => setStaffName(e.target.value)} required />
                <input className={styles.input} type="email" placeholder="Email" value={staffEmail} onChange={e => setStaffEmail(e.target.value)} required />
                <select className={styles.input} value={staffRole} onChange={e => setStaffRole(e.target.value)}>
                  <option value="staff">Staff</option>
                  <option value="org_admin">Org Admin</option>
                </select>
                <button className={styles.btnPrimary} type="submit" disabled={staffLoading}>{staffLoading ? 'Adding…' : 'Add'}</button>
              </div>
              {staffMsg && <p className={styles.msg} style={{ color: staffMsg.startsWith('✓') ? 'var(--success)' : 'var(--error)' }}>{staffMsg}</p>}
            </form>
          </section>
        )}

        {/* Recent Sessions */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Recent Sessions</h2>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr><th>Customer</th><th>Email</th><th>Invite</th><th>Status</th><th>Accuracy</th><th>Started</th></tr>
              </thead>
              <tbody>
                {recentSessions.map(s => (
                  <tr key={s.id}>
                    <td>{s.customer_name}</td>
                    <td>{s.customer_email}</td>
                    <td>{s.invite_label || s.invite_code}</td>
                    <td><span style={{ color: s.status === 'completed' ? 'var(--success)' : 'var(--text-muted)' }}>{s.status}</span></td>
                    <td>{s.accuracy_score != null ? `${s.accuracy_score.toFixed(1)}%` : '—'}</td>
                    <td>{new Date(s.started_at).toLocaleDateString()}</td>
                  </tr>
                ))}
                {recentSessions.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No sessions yet</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}
