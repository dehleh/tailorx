export type EnterpriseRole = 'consumer' | 'org_owner' | 'org_admin' | 'staff' | 'customer' | 'super_admin';

export interface EnterpriseBootstrapPayload {
  organizationName: string;
  adminName: string;
  adminEmail: string;
  seats: number;
  scanQuota: number;
  brandName?: string;
  primaryColor?: string;
  imprint?: string;
}

export interface EnterpriseBootstrapResult {
  organizationId: string;
  adminUserId: string;
  licenseId: string;
  defaultInviteCode: string;
  billingCheckoutUrl: string;
}

export interface OrganizationLicense {
  id: string;
  seatsPurchased: number;
  scanQuota: number;
  scansUsed: number;
  remainingQuota: number;
  status: string;
  billingInterval: string;
  amount: number;
  currency: string;
  startsAt: string;
  endsAt?: string | null;
}

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  brandName: string;
  primaryColor: string;
  imprint?: string | null;
  status: string;
  createdAt: string;
}

export interface InviteLinkSummary {
  id: string;
  code: string;
  label: string;
  campaign_name?: string | null;
  imprint?: string | null;
  primary_color?: string | null;
  landing_headline?: string | null;
  status: string;
  created_at: string;
  publicUrl: string;
}

export interface SessionSummary {
  id: string;
  status: string;
  started_at: string;
  completed_at?: string | null;
  accuracy_score?: number | null;
  customer_name: string;
  customer_email: string;
  invite_code?: string | null;
  invite_label?: string | null;
}

export interface OrganizationDashboard {
  organization: OrganizationSummary;
  license: OrganizationLicense;
  metrics: {
    staffCount: number;
    customerCount: number;
    sessionCount: number;
  };
  recentSessions: SessionSummary[];
  inviteLinks: InviteLinkSummary[];
}

export interface CreateInvitePayload {
  label: string;
  campaignName?: string;
  imprint?: string;
  primaryColor?: string;
  landingHeadline?: string;
}

export interface InviteLookupResponse {
  invite: {
    id: string;
    organization_id: string;
    code: string;
    label: string;
    campaign_name?: string | null;
    imprint?: string | null;
    primary_color?: string | null;
    landing_headline?: string | null;
    status: string;
    created_at: string;
  };
  organization: {
    id: string;
    name: string;
    brandName: string;
    primaryColor: string;
    imprint?: string | null;
  };
  quota: {
    scanQuota: number;
    scansUsed: number;
    remainingQuota: number;
    canStartSession: boolean;
  };
}

export interface InviteLinkCreateResult {
  id: string;
  code: string;
  publicUrl: string;
  label: string;
}

export interface EnterpriseSessionStartPayload {
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  source?: string;
}

export interface EnterpriseSessionStartResult {
  sessionId: string;
  organizationId: string;
  customerId: string;
  remainingQuota: number;
}

export interface EnterpriseSessionCompletePayload {
  measurementId?: string;
  accuracyScore?: number;
  metadata?: Record<string, unknown>;
}

export interface BillingCheckoutPayload {
  organizationId: string;
  licenseId: string;
  amount: number;
  currency?: string;
  billingInterval?: string;
}

export interface BillingCheckoutResult {
  billingRecordId: string;
  checkoutUrl: string;
  provider: string;
  status: string;
}

export interface SuperAdminDashboard {
  summary: {
    organizationCount: number;
    activeLicenseCount: number;
    totalScanQuota: number;
    totalScansUsed: number;
    utilizationRate: number;
    bookedRevenue: number;
  };
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
    brand_name: string;
    status: string;
    created_at: string;
    seats_purchased?: number | null;
    scan_quota?: number | null;
    scans_used?: number | null;
    amount?: number | null;
    currency?: string | null;
  }>;
}

export interface EnterpriseContext {
  role: EnterpriseRole;
  organizationId: string | null;
  organizationName: string | null;
  adminUserId: string | null;
  licenseId: string | null;
  activeInviteCode: string | null;
  activeSessionId: string | null;
  activeCustomerEmail: string | null;
  activeCustomerName: string | null;
}

export interface AdminAuthResult {
  token: string;
  role: EnterpriseRole;
  organizationId: string | null;
  name: string;
  email: string;
}