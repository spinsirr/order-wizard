import { LocalStorageRepository } from './LocalStorageRepository';
import { ApiRepository } from './ApiRepository';
import { apiBaseUrl } from '@/config/env';

export { LocalStorageRepository } from './LocalStorageRepository';
export { ApiRepository } from './ApiRepository';

export { apiBaseUrl } from '@/config/env';

// Repository instances
export const localRepository = new LocalStorageRepository();
export const apiRepository = apiBaseUrl ? new ApiRepository(apiBaseUrl) : null;

// Default to local storage (backward compatible)
export const orderRepository = localRepository;
