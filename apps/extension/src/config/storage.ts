import { LocalStorageRepository } from '@/repositories/LocalStorageRepository';
import { ApiRepository } from '@/repositories/ApiRepository';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '';

export const STORAGE_CONFIG = {
  API_BASE_URL: apiBaseUrl,
} as const;

export const orderRepository = STORAGE_CONFIG.API_BASE_URL
  ? new ApiRepository(STORAGE_CONFIG.API_BASE_URL)
  : new LocalStorageRepository();
