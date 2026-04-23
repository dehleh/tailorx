'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { sendAdminOTP, verifyAdminOTP, AdminUser } from '@/lib/api';
import { useAuth } from '@/lib/authContext';
import styles from './login.module.css';

type Step = 'email' | 'otp';

export default function LoginPage() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError('');
    try {
      await sendAdminOTP(email.trim());
      setStep('otp');
    } catch {
      setError('Failed to send OTP. Check your email address.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await verifyAdminOTP(email.trim(), code.trim());
      const user: AdminUser = res.data;
      login(user);
      if (user.role === 'super_admin') {
        router.replace('/super-admin');
      } else {
        router.replace('/dashboard');
      }
    } catch {
      setError('Invalid or expired OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>✂</span>
          <span className={styles.logoText}>Tailor-X Admin</span>
        </div>

        {step === 'email' ? (
          <form onSubmit={handleSendOTP} className={styles.form}>
            <h1 className={styles.title}>Sign in</h1>
            <p className={styles.subtitle}>Enter your admin email to receive a one-time code</p>
            <label className={styles.label}>Email address</label>
            <input
              className={styles.input}
              type="email"
              placeholder="admin@yourcompany.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
            />
            {error && <p className={styles.error}>{error}</p>}
            <button className={styles.button} type="submit" disabled={loading}>
              {loading ? 'Sending…' : 'Send code'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOTP} className={styles.form}>
            <h1 className={styles.title}>Check your email</h1>
            <p className={styles.subtitle}>
              We sent a 6-digit code to <strong>{email}</strong>
            </p>
            <label className={styles.label}>Verification code</label>
            <input
              className={styles.input}
              type="text"
              inputMode="numeric"
              placeholder="000000"
              maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value)}
              required
              autoFocus
            />
            {error && <p className={styles.error}>{error}</p>}
            <button className={styles.button} type="submit" disabled={loading}>
              {loading ? 'Verifying…' : 'Sign in'}
            </button>
            <button
              type="button"
              className={styles.back}
              onClick={() => { setStep('email'); setError(''); setCode(''); }}
            >
              ← Use a different email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
