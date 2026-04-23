import { apiClient } from './apiClient';
import {
  BillingCheckoutPayload,
  BillingCheckoutResult,
  CreateInvitePayload,
  EnterpriseBootstrapPayload,
  EnterpriseBootstrapResult,
  EnterpriseSessionCompletePayload,
  EnterpriseSessionStartPayload,
  EnterpriseSessionStartResult,
  InviteLinkCreateResult,
  InviteLookupResponse,
  OrganizationDashboard,
  SuperAdminDashboard,
} from '../types/enterprise';
import { AdminAuthResult } from '../types/enterprise';

class EnterpriseApi {
  /** JWT token set after admin login — injected into protected requests */
  private adminToken: string | null = null;

  setAdminToken(token: string | null) {
    this.adminToken = token;
  }

  private authHeaders() {
    return this.adminToken ? { Authorization: `Bearer ${this.adminToken}` } : {};
  }

  /** Send OTP to admin email */
  sendAdminOTP(email: string) {
    return apiClient.post('/v1/auth/admin/send-otp', { email });
  }

  /** Verify OTP and receive JWT */
  verifyAdminOTP(email: string, code: string) {
    return apiClient.post<AdminAuthResult>('/v1/auth/admin/verify-otp', { email, code });
  }

  bootstrapOrganization(payload: EnterpriseBootstrapPayload) {
    return apiClient.post<EnterpriseBootstrapResult>('/v1/enterprise/bootstrap', payload);
  }

  getOrganizationDashboard(organizationId: string) {
    return apiClient.get<OrganizationDashboard>(
      `/v1/enterprise/organizations/${organizationId}/dashboard`,
      { headers: this.authHeaders() },
    );
  }

  createInviteLink(organizationId: string, payload: CreateInvitePayload) {
    return apiClient.post<InviteLinkCreateResult>(
      `/v1/enterprise/organizations/${organizationId}/invite-links`,
      payload,
      { headers: this.authHeaders() },
    );
  }

  getInvite(inviteCode: string) {
    return apiClient.get<InviteLookupResponse>(`/v1/enterprise/invite/${inviteCode}`);
  }

  startInviteSession(inviteCode: string, payload: EnterpriseSessionStartPayload) {
    return apiClient.post<EnterpriseSessionStartResult>(`/v1/enterprise/invite/${inviteCode}/start-session`, payload);
  }

  completeSession(sessionId: string, payload: EnterpriseSessionCompletePayload) {
    return apiClient.post(`/v1/enterprise/sessions/${sessionId}/complete`, payload);
  }

  createBillingCheckout(payload: BillingCheckoutPayload) {
    return apiClient.post<BillingCheckoutResult>(
      '/v1/enterprise/billing/checkout',
      payload,
      { headers: this.authHeaders() },
    );
  }

  getSuperAdminDashboard() {
    return apiClient.get<SuperAdminDashboard>(
      '/v1/enterprise/super-admin/dashboard',
      { headers: this.authHeaders() },
    );
  }
}

export const enterpriseApi = new EnterpriseApi();