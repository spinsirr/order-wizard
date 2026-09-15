import { apiBaseUrl } from '@/config/env';
import { ApiRepository } from './ApiRepository';
import { LocalStorageRepository } from './LocalStorageRepository';

export const localRepository = new LocalStorageRepository();
export const apiRepository = apiBaseUrl ? new ApiRepository(apiBaseUrl) : null;
