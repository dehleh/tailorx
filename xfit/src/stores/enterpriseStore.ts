import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { EnterpriseBootstrapResult, EnterpriseContext, EnterpriseRole } from '../types/enterprise';
import { enterpriseApi } from '../services/enterpriseApi';

interface EnterpriseStore extends EnterpriseContext {
  isLoading: boolean;
  loadContext: () => Promise<void>;
  setRole: (role: EnterpriseRole) => Promise<void>;
  setAdminAuth: (token: string, role: EnterpriseRole, organizationId: string | null) => Promise<void>;
  setBootstrapContext: (payload: EnterpriseBootstrapResult & { organizationName?: string }) => Promise<void>;
  setActiveInvite: (inviteCode: string, organizationName?: string | null) => Promise<void>;
  setActiveSession: (payload: { sessionId: string; customerName: string; customerEmail: string; organizationId?: string | null }) => Promise<void>;
  clearActiveSession: () => Promise<void>;
  clearContext: () => Promise<void>;
}

const STORAGE_KEY = '@tailorx:enterprise';

const initialState: EnterpriseContext = {
  role: 'consumer',
  organizationId: null,
  organizationName: null,
  adminUserId: null,
  licenseId: null,
  activeInviteCode: null,
  activeSessionId: null,
  activeCustomerEmail: null,
  activeCustomerName: null,
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
      adminUserId: nextState.adminUserId,
      licenseId: nextState.licenseId,
      activeInviteCode: nextState.activeInviteCode,
      activeSessionId: nextState.activeSessionId,
      activeCustomerEmail: nextState.activeCustomerEmail,
      activeCustomerName: nextState.activeCustomerName,
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
      adminUserId: payload.adminUserId,
      licenseId: payload.licenseId,
      activeInviteCode: payload.defaultInviteCode,
      activeSessionId: null,
      activeCustomerEmail: null,
      activeCustomerName: null,
    };
    await persist(nextState);
    set(nextState);
  },

  setActiveInvite: async (inviteCode, organizationName) => {
    const current = get();
    const nextState: EnterpriseContext = {
      role: current.role,
      organizationId: current.organizationId,
      organizationName: organizationName ?? current.organizationName,
      adminUserId: current.adminUserId,
      licenseId: current.licenseId,
      activeInviteCode: inviteCode,
      activeSessionId: current.activeSessionId,
      activeCustomerEmail: current.activeCustomerEmail,
      activeCustomerName: current.activeCustomerName,
    };
    await persist(nextState);
    set(nextState);
  },

  setActiveSession: async ({ sessionId, customerName, customerEmail, organizationId }) => {
    const current = get();
    const nextState: EnterpriseContext = {
      role: current.role,
      organizationId: organizationId ?? current.organizationId,
      organizationName: current.organizationName,
      adminUserId: current.adminUserId,
      licenseId: current.licenseId,
      activeInviteCode: current.activeInviteCode,
      activeSessionId: sessionId,
      activeCustomerEmail: customerEmail,
      activeCustomerName: customerName,
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
      adminUserId: current.adminUserId,
      licenseId: current.licenseId,
      activeInviteCode: current.activeInviteCode,
      activeSessionId: null,
      activeCustomerEmail: null,
      activeCustomerName: null,
    };
    await persist(nextState);
    set(nextState);
  },

  clearContext: async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    set({ ...initialState });
  },
}));