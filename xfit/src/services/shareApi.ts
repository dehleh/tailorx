import { apiClient } from './apiClient';

export interface CreateSharePayload {
  measurementId: string;
  measurements: Record<string, number>;
  unit: 'cm' | 'inch';
  ttlHours?: number;
  createdByEmail?: string;
}

export interface ShareLinkResult {
  id: string;
  token: string;
  shareUrl: string;
  revokeToken: string;
  accessScope: 'read_only';
  expiresAt: string;
  createdAt: string;
}

export const shareApi = {
  createShare(payload: CreateSharePayload) {
    return apiClient.post<ShareLinkResult>('/v1/shares', {
      ttlHours: 168,
      ...payload,
    });
  },

  revokeShare(token: string, revokeToken: string) {
    return apiClient.post<{ revoked: boolean }>(`/v1/shares/${token}/revoke`, {
      revokeToken,
    });
  },
};
