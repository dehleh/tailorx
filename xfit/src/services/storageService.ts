import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/**
 * Local Storage Service
 * Handles local persistence. Sensitive profile, auth, and measurement data
 * goes through expo-secure-store instead of plain-text AsyncStorage.
 */

class StorageService {
  private readonly SECURE_CHUNK_SIZE = 1800;

  // Storage keys
  private readonly KEYS = {
    MEASUREMENTS: '@tailorx:measurements',
    USER: '@tailorx:user',
    SETTINGS: '@tailorx:settings',
    CACHE: '@tailorx:cache',
    AUTH: '@tailorx:auth',
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
   * Save sensitive JSON through SecureStore. Values are chunked because
   * measurement history can grow beyond common secure-store single-value limits.
   */
  async saveSensitive<T>(key: string, data: T): Promise<void> {
    try {
      const jsonData = JSON.stringify(data);
      await this.clearSecureChunks(key);

      if (jsonData.length <= this.SECURE_CHUNK_SIZE) {
        await SecureStore.setItemAsync(key, jsonData);
        await AsyncStorage.removeItem(key);
        return;
      }

      const chunkCount = Math.ceil(jsonData.length / this.SECURE_CHUNK_SIZE);
      for (let i = 0; i < chunkCount; i++) {
        await SecureStore.setItemAsync(
          this.secureChunkKey(key, i),
          jsonData.slice(i * this.SECURE_CHUNK_SIZE, (i + 1) * this.SECURE_CHUNK_SIZE)
        );
      }
      await SecureStore.setItemAsync(this.secureChunkCountKey(key), String(chunkCount));
      await SecureStore.deleteItemAsync(key);
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error(`Failed to save sensitive data for key ${key}:`, error);
      throw new Error('Sensitive storage save failed');
    }
  }

  /**
   * Load sensitive JSON from SecureStore, with one-time migration from the
   * previous AsyncStorage location if needed.
   */
  async loadSensitive<T>(key: string): Promise<T | null> {
    try {
      const chunkCountRaw = await SecureStore.getItemAsync(this.secureChunkCountKey(key));
      if (chunkCountRaw) {
        const chunkCount = Number(chunkCountRaw);
        const chunks: string[] = [];
        for (let i = 0; i < chunkCount; i++) {
          const chunk = await SecureStore.getItemAsync(this.secureChunkKey(key, i));
          if (chunk == null) return null;
          chunks.push(chunk);
        }
        return JSON.parse(chunks.join(''));
      }

      const directValue = await SecureStore.getItemAsync(key);
      if (directValue) {
        return JSON.parse(directValue);
      }

      const legacyValue = await AsyncStorage.getItem(key);
      if (legacyValue) {
        const parsed = JSON.parse(legacyValue) as T;
        await this.saveSensitive(key, parsed);
        return parsed;
      }

      return null;
    } catch (error) {
      console.error(`Failed to load sensitive data for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Remove sensitive JSON from SecureStore and the legacy AsyncStorage key.
   */
  async removeSensitive(key: string): Promise<void> {
    try {
      await this.clearSecureChunks(key);
      await SecureStore.deleteItemAsync(key);
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error(`Failed to remove sensitive data for key ${key}:`, error);
      throw new Error('Sensitive storage remove failed');
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
      await Promise.all([
        this.removeSensitive(this.KEYS.MEASUREMENTS),
        this.removeSensitive(this.KEYS.USER),
        this.removeSensitive(this.KEYS.AUTH),
        this.removeSensitive(this.KEYS.AUTH_TOKEN),
      ]);
      await AsyncStorage.clear();
    } catch (error) {
      console.error('Failed to clear storage:', error);
      throw new Error('Storage clear failed');
    }
  }

  private secureChunkKey(key: string, index: number): string {
    return `${key}:secure_chunk:${index}`;
  }

  private secureChunkCountKey(key: string): string {
    return `${key}:secure_chunk_count`;
  }

  private async clearSecureChunks(key: string): Promise<void> {
    const countRaw = await SecureStore.getItemAsync(this.secureChunkCountKey(key));
    if (countRaw) {
      const count = Number(countRaw);
      for (let i = 0; i < count; i++) {
        await SecureStore.deleteItemAsync(this.secureChunkKey(key, i));
      }
      await SecureStore.deleteItemAsync(this.secureChunkCountKey(key));
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
   * Save auth token (Keychain / Keystore via expo-secure-store)
   */
  async saveAuthToken(token: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(this.KEYS.AUTH_TOKEN, token);
    } catch (error) {
      console.error('Failed to save auth token to secure store:', error);
      throw new Error('Auth token save failed');
    }
  }

  /**
   * Load auth token
   */
  async loadAuthToken(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(this.KEYS.AUTH_TOKEN);
    } catch (error) {
      console.error('Failed to load auth token from secure store:', error);
      return null;
    }
  }

  /**
   * Remove auth token
   */
  async removeAuthToken(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(this.KEYS.AUTH_TOKEN);
    } catch (error) {
      console.error('Failed to remove auth token from secure store:', error);
    }
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
