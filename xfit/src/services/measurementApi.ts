import { apiClient } from './apiClient';
import { BodyMeasurement } from '../types/measurements';

interface MeasurementResponse {
  data: BodyMeasurement[];
  total: number;
  page: number;
}

interface CreateMeasurementData {
  userId: string;
  measurements: BodyMeasurement['measurements'];
  unit: 'cm' | 'inch';
  images?: string[];
}

export const measurementService = {
  // Get all measurements for a user
  async getMeasurements(userId: string, page = 1, limit = 20): Promise<MeasurementResponse> {
    return apiClient.get<MeasurementResponse>(`/measurements/${userId}?page=${page}&limit=${limit}`);
  },

  // Get a specific measurement by ID
  async getMeasurementById(measurementId: string): Promise<BodyMeasurement> {
    return apiClient.get<BodyMeasurement>(`/measurements/detail/${measurementId}`);
  },

  // Create a new measurement
  async createMeasurement(data: CreateMeasurementData): Promise<BodyMeasurement> {
    return apiClient.post<BodyMeasurement>('/measurements', data);
  },

  // Update an existing measurement
  async updateMeasurement(
    measurementId: string,
    data: Partial<CreateMeasurementData>
  ): Promise<BodyMeasurement> {
    return apiClient.put<BodyMeasurement>(`/measurements/${measurementId}`, data);
  },

  // Delete a measurement
  async deleteMeasurement(measurementId: string): Promise<void> {
    return apiClient.delete<void>(`/measurements/${measurementId}`);
  },

  // Upload measurement images
  async uploadImages(measurementId: string, images: string[]): Promise<{ urls: string[] }> {
    const formData = new FormData();
    images.forEach((image, index) => {
      formData.append(`image${index}`, {
        uri: image,
        type: 'image/jpeg',
        name: `measurement_${index}.jpg`,
      } as any);
    });

    return apiClient.post<{ urls: string[] }>(`/measurements/${measurementId}/images`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  // Sync local measurements with server
  async syncMeasurements(localMeasurements: BodyMeasurement[]): Promise<BodyMeasurement[]> {
    return apiClient.post<BodyMeasurement[]>('/measurements/sync', {
      measurements: localMeasurements,
    });
  },
};
