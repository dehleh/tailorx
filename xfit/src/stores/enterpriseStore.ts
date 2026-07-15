import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import {
  EnterpriseBootstrapResult,
  EnterpriseContext,
  EnterpriseRole,
  EnterpriseSubmissionState,
} from '../types/enterprise';
import { enterpriseApi } from '../services/enterpriseApi';

interface EnterpriseStore extends EnterpriseContext {
  isLoading: boolean;
  loadContext: () => Promise<void>;
  setRole: (role: EnterpriseRole) => Promise<void>;
  setAdminAuth: (token: string, role: EnterpriseRole, organizationId: string | null) => Promise<void>;
  setBootstrapContext: (payload: EnterpriseBootstrapResult & { organizationName?: string }) => Promise<void>;
  setActiveInvite: (
    inviteCode: string,
    organizationName?: string | null,
    details?: {
      organizationPrimaryColor?: string | null;
      inviteLabel?: string | null;
      inviteHeadline?: string | null;
      inviteImprint?: string | null;
    },
  ) => Promise<void>;
  setActiveSession: (payload: {
    sessionId: string;
    customerName: string;
    customerEmail: string;
    organizationId?: string | null;
    occasion?: string | null;
    preferredFit?: string | null;
    styleNotes?: string | null;
  }) => Promise<void>;
  recordSubmission: (payload: EnterpriseSubmissionState) => Promise<void>;
  clearActiveSession: () => Promise<void>;
  clearContext: () => Promise<void>;
}

const STORAGE_KEY = '@tailorx:enterprise';

const initialState: EnterpriseContext = {
  role: 'consumer',
  organizationId: null,
  organizationName: null,
  organizationPrimaryColor: null,
  adminUserId: null,
  licenseId: null,
  activeInviteCode: null,
  activeInviteLabel: null,
  activeInviteHeadline: null,
  activeInviteImprint: null,
  activeSessionId: null,
  activeCustomerEmail: null,
  activeCustomerName: null,
  activeOccasion: null,
  activePreferredFit: null,
  activeStyleNotes: null,
  lastSubmission: null,
};

// JWT token lives in memory only (not serialized to AsyncStorage for security)
let _inMemoryJwt: string | null = null;

async function persist(state: EnterpriseContext) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export const useEnterpriseStore = create<EnterpriseStore>((set, get) => ({
  ...initialState,
  isLoading: false,

  loadContext: async () => {
    try {
      set({ isLoading: true });
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      if (data) {
        set({ ...initialState, ...JSON.parse(data), isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },
  // Note: JWT is not persisted; user must re-authenticate on next session.
  // On load, we just restore non-sensitive org context.

  setRole: async (role) => {
    const nextState = { ...get(), role };
    await persist({
      role,
      organizationId: nextState.organizationId,
      organizationName: nextState.organizationName,
      organizationPrimaryColor: nextState.organizationPrimaryColor,
      adminUserId: nextState.adminUserId,
      licenseId: nextState.licenseId,
      activeInviteCode: nextState.activeInviteCode,
      activeInviteLabel: nextState.activeInviteLabel,
      activeInviteHeadline: nextState.activeInviteHeadline,
      activeInviteImprint: nextState.activeInviteImprint,
      activeSessionId: nextState.activeSessionId,
      activeCustomerEmail: nextState.activeCustomerEmail,
      activeCustomerName: nextState.activeCustomerName,
      activeOccasion: nextState.activeOccasion,
      activePreferredFit: nextState.activePreferredFit,
      activeStyleNotes: nextState.activeStyleNotes,
      lastSubmission: nextState.lastSubmission,
    });
    set({ role });
  },

  setAdminAuth: async (
    token: string,
    role: EnterpriseRole,
    organizationId: string | null,
  ) => {
    _inMemoryJwt = token;
    enterpriseApi.setAdminToken(token);
    const current = get();
    const nextState: EnterpriseContext = {
      ...current,
      role,
      organizationId: organizationId ?? current.organizationId,
    };
    await persist(nextState);
    set(nextState);
  },

  setBootstrapContext: async (payload) => {
    const nextState: EnterpriseContext = {
      role: 'org_admin',
      organizationId: payload.organizationId,
      organizationName: payload.organizationName || null,
      organizationPrimaryColor: null,
      adminUserId: payload.adminUserId,
      licenseId: payload.licenseId,
      activeInviteCode: payload.defaultInviteCode,
      activeInviteLabel: 'Default customer invite',
      activeInviteHeadline: null,
      activeInviteImprint: null,
      activeSessionId: null,
      activeCustomerEmail: null,
      activeCustomerName: null,
      activeOccasion: null,
      activePreferredFit: null,
      activeStyleNotes: null,
      lastSubmission: null,
    };
    await persist(nextState);
    set(nextState);
  },

  setActiveInvite: async (inviteCode, organizationName, details) => {
    const current = get();
    const nextState: EnterpriseContext = {
      role: current.role,
      organizationId: current.organizationId,
      organizationName: organizationName ?? current.organizationName,
      organizationPrimaryColor: details?.organizationPrimaryColor ?? current.organizationPrimaryColor,
      adminUserId: current.adminUserId,
      licenseId: current.licenseId,
      activeInviteCode: inviteCode,
      activeInviteLabel: details?.inviteLabel ?? current.activeInviteLabel,
      activeInviteHeadline: details?.inviteHeadline ?? current.activeInviteHeadline,
      activeInviteImprint: details?.inviteImprint ?? current.activeInviteImprint,
      activeSessionId: current.activeSessionId,
      activeCustomerEmail: current.activeCustomerEmail,
      activeCustomerName: current.activeCustomerName,
      activeOccasion: current.activeOccasion,
      activePreferredFit: current.activePreferredFit,
      activeStyleNotes: current.activeStyleNotes,
      lastSubmission: current.lastSubmission,
    };
    await persist(nextState);
    set(nextState);
  },

  setActiveSession: async ({
    sessionId,
    customerName,
    customerEmail,
    organizationId,
    occasion,
    preferredFit,
    styleNotes,
  }) => {
    const current = get();
    const nextState: EnterpriseContext = {
      role: current.role,
      organizationId: organizationId ?? current.organizationId,
      organizationName: current.organizationName,
      organizationPrimaryColor: current.organizationPrimaryColor,
      adminUserId: current.adminUserId,
      licenseId: current.licenseId,
      activeInviteCode: current.activeInviteCode,
      activeInviteLabel: current.activeInviteLabel,
      activeInviteHeadline: current.activeInviteHeadline,
      activeInviteImprint: current.activeInviteImprint,
      activeSessionId: sessionId,
      activeCustomerEmail: customerEmail,
      activeCustomerName: customerName,
      activeOccasion: occasion ?? current.activeOccasion,
      activePreferredFit: preferredFit ?? current.activePreferredFit,
      activeStyleNotes: styleNotes ?? current.activeStyleNotes,
      lastSubmission: current.lastSubmission,
    };
    await persist(nextState);
    set(nextState);
  },

  recordSubmission: async (payload) => {
    const current = get();
    const nextState: EnterpriseContext = {
      role: current.role,
      organizationId: current.organizationId,
      organizationName: current.organizationName,
      organizationPrimaryColor: current.organizationPrimaryColor,
      adminUserId: current.adminUserId,
      licenseId: current.licenseId,
      activeInviteCode: current.activeInviteCode,
      activeInviteLabel: current.activeInviteLabel,
      activeInviteHeadline: current.activeInviteHeadline,
      activeInviteImprint: current.activeInviteImprint,
      activeSessionId: current.activeSessionId,
      activeCustomerEmail: current.activeCustomerEmail,
      activeCustomerName: current.activeCustomerName,
      activeOccasion: current.activeOccasion,
      activePreferredFit: current.activePreferredFit,
      activeStyleNotes: current.activeStyleNotes,
      lastSubmission: payload,
    };
    await persist(nextState);
    set(nextState);
  },

  clearActiveSession: async () => {
    const current = get();
    const nextState: EnterpriseContext = {
      role: current.role,
      organizationId: current.organizationId,
      organizationName: current.organizationName,
      organizationPrimaryColor: current.organizationPrimaryColor,
      adminUserId: current.adminUserId,
      licenseId: current.licenseId,
      activeInviteCode: current.activeInviteCode,
      activeInviteLabel: current.activeInviteLabel,
      activeInviteHeadline: current.activeInviteHeadline,
      activeInviteImprint: current.activeInviteImprint,
      activeSessionId: null,
      activeCustomerEmail: null,
      activeCustomerName: null,
      activeOccasion: null,
      activePreferredFit: null,
      activeStyleNotes: null,
      lastSubmission: current.lastSubmission,
    };
    await persist(nextState);
    set(nextState);
  },

  clearContext: async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    set({ ...initialState });
  },
}));
