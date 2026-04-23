'use client';

import { useAuth } from '@/lib/authContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from './nav.module.css';

export default function AdminNav() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <nav className={styles.nav}>
      <div className={styles.brand}>
        <span className={styles.icon}>✂</span>
        <span className={styles.name}>Tailor-X Admin</span>
      </div>
      <div className={styles.links}>
        {user?.role === 'super_admin' ? (
          <Link href="/super-admin" className={styles.link}>Super Admin</Link>
        ) : (
          <Link href="/dashboard" className={styles.link}>Dashboard</Link>
        )}
      </div>
      <div className={styles.user}>
        <span className={styles.roleTag}>{user?.role}</span>
        <span className={styles.email}>{user?.email}</span>
        <button className={styles.logout} onClick={handleLogout}>Sign out</button>
      </div>
    </nav>
  );
}
