import axios from 'axios';

// All requests go to our Next.js API routes:
//  - /api/admin/auth/*    : explicit auth handlers (set HttpOnly cookies)
//  - /api/admin/proxy/*   : catch-all that forwards to FastAPI with bearer
//                           pulled from the HttpOnly cookie server-side.
export const api = axios.create({ baseURL: '/api/admin/proxy' });

export interface AdminUser {
  // token is no longer exposed to the client; it lives in an HttpOnly cookie
  role: 'org_owner' | 'org_admin' | 'staff' | 'super_admin';
  organizationId: string | null;
  name: string;
  email: string;
}

// Auth — these bypass the proxy because they manage cookies directly.
export const sendAdminOTP = (email: string) =>
  axios.post('/api/admin/auth/send-otp', { email });

export const verifyAdminOTP = (email: string, code: string): Promise<{ data: AdminUser }> =>
  axios.post('/api/admin/auth/verify-otp', { email, code });

export const logoutAdmin = () => axios.post('/api/admin/auth/logout');

export const fetchCurrentAdmin = (): Promise<{ data: { user: AdminUser | null } }> =>
  axios.get('/api/admin/auth/me');

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

export const suspendOrganization = (organizationId: string) =>
  api.post(`/v1/enterprise/super-admin/organizations/${organizationId}/suspend`);

export const activateOrganization = (organizationId: string) =>
  api.post(`/v1/enterprise/super-admin/organizations/${organizationId}/activate`);

export const deleteOrganization = (organizationId: string) =>
  api.delete(`/v1/enterprise/super-admin/organizations/${organizationId}`);
