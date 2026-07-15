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
  licenseStatus?: string;
  trialScanQuota?: number;
  trialEndsAt?: string;
  defaultInviteCode: string;
  billingCheckoutUrl: string;
}

export interface OrganizationLicense {
  id: string;
  seatsPurchased: number;
  scanQuota: number;
  scansUsed: number;
  remainingQuota: number;
  overageUnits?: number;
  overageGraceScans?: number;
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
  measurement_id?: string | null;
  measurements?: Record<string, number>;
  unit?: 'cm' | 'inch';
  measurement_profile?: 'male' | 'female' | 'other' | string | null;
  confidence?: Record<string, number>;
  warnings?: string[];
  metadata?: Record<string, unknown>;
  measurementCount?: number;
  review_status?: string;
  tailor_notes?: string | null;
  reviewed_at?: string | null;
  accuracyStatus?: {
    status: string;
    blockers: string[];
    coverage: {
      catalogVersion: string;
      profile: string;
      totalMeasurements: number;
      capturedMeasurements: number;
      requiredMeasurements: number;
      capturedRequiredMeasurements: number;
      coveragePct: number;
      requiredCoveragePct: number;
      missingRequired: string[];
      capturedKeys: string[];
    };
    confidence: {
      average: number;
      lowConfidenceParts: string[];
      measuredParts: number;
    };
  };
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
  measurementCatalog?: MeasurementCatalogResponse;
  accuracyCertification?: AccuracyCertification;
  businessHealth?: Record<string, unknown>;
  trustPosture?: Record<string, unknown>;
  appLinks?: AppLinkStatus;
  recentEvents?: OrganizationEvent[];
  auditLogs?: Array<Record<string, unknown>>;
}

export interface MeasurementCatalogItem {
  key: string;
  label: string;
  profile: 'all' | 'male' | 'female' | 'other';
  type: 'linear' | 'circumference' | 'derived';
  requiredForFit: boolean;
  requiresSideView: boolean;
  source: string;
  garmentUses: string[];
}

export interface MeasurementCatalogResponse {
  version: string;
  items: MeasurementCatalogItem[];
  profiles?: Record<string, MeasurementCatalogItem[]>;
}

export interface AccuracyCertification {
  status: string;
  sampleSize: number;
  targetSampleSize: number;
  minimumPublishableSampleSize: number;
  failureRatePct: number;
  aggregateP90ErrorCm?: number | null;
  partMetrics: Record<string, {
    sampleSize: number;
    mae: number;
    medianError: number;
    p90Error: number;
    p95Error: number;
  }>;
  claimLanguage: string;
}

export interface AppLinkStatus {
  scheme: string;
  androidPackage: string;
  iosBundleIdentifier: string;
  webInvitePath: string;
  androidAppLinksReady: boolean;
  iosUniversalLinksReady: boolean;
  requiredEnv?: Record<string, boolean>;
}

export interface OrganizationEvent {
  id: string;
  eventType?: string;
  event_type?: string;
  payload?: Record<string, unknown>;
  actorUserId?: string | null;
  createdAt?: string;
  created_at?: string;
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
    overageUnits?: number;
    overageGraceScans?: number;
    canStartSession: boolean;
  };
  measurementCatalog?: {
    version: string;
    profiles: string[];
    requiredAngles: string[];
  };
  appLinks?: AppLinkStatus;
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
  measurements?: Record<string, number>;
  unit?: 'cm' | 'inch';
  measurementProfile?: 'male' | 'female' | 'other' | string;
  confidence?: Record<string, number>;
  warnings?: string[];
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
  organizationPrimaryColor: string | null;
  adminUserId: string | null;
  licenseId: string | null;
  activeInviteCode: string | null;
  activeInviteLabel: string | null;
  activeInviteHeadline: string | null;
  activeInviteImprint: string | null;
  activeSessionId: string | null;
  activeCustomerEmail: string | null;
  activeCustomerName: string | null;
  activeOccasion: string | null;
  activePreferredFit: string | null;
  activeStyleNotes: string | null;
  lastSubmission: EnterpriseSubmissionState | null;
}

export type EnterpriseSubmissionStatus =
  | 'draft'
  | 'awaiting_review'
  | 'submitted'
  | 'upload_failed'
  | 'review_requested'
  | 'accepted';

export interface EnterpriseSubmissionState {
  sessionId: string;
  measurementId?: string | null;
  organizationId?: string | null;
  organizationName?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  inviteCode?: string | null;
  status: EnterpriseSubmissionStatus;
  submittedAt?: string | null;
  accuracyScore?: number | null;
  message?: string | null;
}

export interface AdminAuthResult {
  token: string;
  role: EnterpriseRole;
  organizationId: string | null;
  name: string;
  email: string;
}
