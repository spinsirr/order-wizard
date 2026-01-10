import { LocalStorageRepository } from './LocalStorageRepository';
import { ApiRepository } from './ApiRepository';

export { LocalStorageRepository } from './LocalStorageRepository';
export { ApiRepository } from './ApiRepository';

// Environment config
export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '';

// Repository instances
export const localRepository = new LocalStorageRepository();
export const apiRepository = apiBaseUrl ? new ApiRepository(apiBaseUrl) : null;

// Default to local storage (backward compatible)
export const orderRepository = localRepository;
