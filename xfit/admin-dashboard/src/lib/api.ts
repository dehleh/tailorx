import axios from 'axios';
import Cookies from 'js-cookie';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://tailorx-pose-api-production.up.railway.app';

export const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const token = Cookies.get('tailorx_admin_token');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

export interface AdminUser {
  token: string;
  role: 'org_owner' | 'org_admin' | 'staff' | 'super_admin';
  organizationId: string | null;
  name: string;
  email: string;
}

// Auth
export const sendAdminOTP = (email: string) =>
  api.post('/v1/auth/admin/send-otp', { email });

export const verifyAdminOTP = (email: string, code: string): Promise<{ data: AdminUser }> =>
  api.post('/v1/auth/admin/verify-otp', { email, code });

// Org Dashboard
export const getOrgDashboard = (orgId: string) =>
  api.get(`/v1/enterprise/organizations/${orgId}/dashboard`);

export const createInviteLink = (orgId: string, payload: {
  label: string;
  campaignName?: string;
  primaryColor?: string;
  landingHeadline?: string;
}) => api.post(`/v1/enterprise/organizations/${orgId}/invite-links`, payload);

export const inviteStaff = (orgId: string, payload: { name: string; email: string; role: string }) =>
  api.post(`/v1/enterprise/organizations/${orgId}/staff`, payload);

// Billing
export const createBillingCheckout = (payload: {
  organizationId: string;
  licenseId: string;
  amount: number;
  currency?: string;
  billingInterval?: string;
  planTier?: string;
}) => api.post('/v1/enterprise/billing/checkout', payload);

// Super Admin
export const getSuperAdminDashboard = () =>
  api.get('/v1/enterprise/super-admin/dashboard');

export interface BootstrapOrgPayload {
  organizationName: string;
  adminName: string;
  adminEmail: string;
  seats?: number;
  scanQuota?: number;
  brandName?: string;
  primaryColor?: string;
  imprint?: string;
}

export interface BootstrapOrgResult {
  organizationId: string;
  adminUserId: string;
  licenseId: string;
  defaultInviteCode: string;
  billingCheckoutUrl: string;
}

export const bootstrapOrganization = (
  payload: BootstrapOrgPayload,
): Promise<{ data: BootstrapOrgResult }> =>
  api.post('/v1/enterprise/bootstrap', payload);
