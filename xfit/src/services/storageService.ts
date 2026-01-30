import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Local Storage Service
 * Handles all local data persistence using AsyncStorage
 */

class StorageService {
  // Storage keys
  private readonly KEYS = {
    MEASUREMENTS: '@tailorx:measurements',
    USER: '@tailorx:user',
    SETTINGS: '@tailorx:settings',
    CACHE: '@tailorx:cache',
    AUTH_TOKEN: '@tailorx:auth_token',
  };

  /**
   * Save data to storage
   */
  async save<T>(key: string, data: T): Promise<void> {
    try {
      const jsonData = JSON.stringify(data);
      await AsyncStorage.setItem(key, jsonData);
    } catch (error) {
      console.error(`Failed to save data for key ${key}:`, error);
      throw new Error('Storage save failed');
    }
  }

  /**
   * Load data from storage
   */
  async load<T>(key: string): Promise<T | null> {
    try {
      const jsonData = await AsyncStorage.getItem(key);
      return jsonData ? JSON.parse(jsonData) : null;
    } catch (error) {
      console.error(`Failed to load data for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Remove data from storage
   */
  async remove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error(`Failed to remove data for key ${key}:`, error);
      throw new Error('Storage remove failed');
    }
  }

  /**
   * Clear all app data
   */
  async clearAll(): Promise<void> {
    try {
      await AsyncStorage.clear();
    } catch (error) {
      console.error('Failed to clear storage:', error);
      throw new Error('Storage clear failed');
    }
  }

  /**
   * Get all storage keys
   */
  async getAllKeys(): Promise<readonly string[]> {
    try {
      return await AsyncStorage.getAllKeys();
    } catch (error) {
      console.error('Failed to get all keys:', error);
      return [];
    }
  }

  /**
   * Get storage size (approximate)
   */
  async getStorageSize(): Promise<number> {
    try {
      const keys = await this.getAllKeys();
      let totalSize = 0;
      
      for (const key of keys) {
        const value = await AsyncStorage.getItem(key);
        if (value) {
          totalSize += value.length;
        }
      }
      
      return totalSize;
    } catch (error) {
      console.error('Failed to calculate storage size:', error);
      return 0;
    }
  }

  /**
   * Save auth token
   */
  async saveAuthToken(token: string): Promise<void> {
    await this.save(this.KEYS.AUTH_TOKEN, token);
  }

  /**
   * Load auth token
   */
  async loadAuthToken(): Promise<string | null> {
    return this.load<string>(this.KEYS.AUTH_TOKEN);
  }

  /**
   * Remove auth token
   */
  async removeAuthToken(): Promise<void> {
    await this.remove(this.KEYS.AUTH_TOKEN);
  }

  /**
   * Save app settings
   */
  async saveSettings(settings: Record<string, any>): Promise<void> {
    await this.save(this.KEYS.SETTINGS, settings);
  }

  /**
   * Load app settings
   */
  async loadSettings(): Promise<Record<string, any> | null> {
    return this.load(this.KEYS.SETTINGS);
  }

  /**
   * Cache data with expiration
   */
  async setCache<T>(key: string, data: T, expirationMinutes: number = 60): Promise<void> {
    const cacheData = {
      data,
      expiresAt: Date.now() + expirationMinutes * 60 * 1000,
    };
    await this.save(`${this.KEYS.CACHE}:${key}`, cacheData);
  }

  /**
   * Get cached data if not expired
   */
  async getCache<T>(key: string): Promise<T | null> {
    const cacheData = await this.load<{ data: T; expiresAt: number }>(`${this.KEYS.CACHE}:${key}`);
    
    if (!cacheData) return null;
    
    if (Date.now() > cacheData.expiresAt) {
      await this.remove(`${this.KEYS.CACHE}:${key}`);
      return null;
    }
    
    return cacheData.data;
  }

  /**
   * Clear all cached data
   */
  async clearCache(): Promise<void> {
    try {
      const keys = await this.getAllKeys();
      const cacheKeys = keys.filter(key => key.startsWith(this.KEYS.CACHE));
      
      await Promise.all(cacheKeys.map(key => this.remove(key)));
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  }
}

export const storageService = new StorageService();
