import { locks } from 'node:worker_threads';

// Exercise real lock scheduling instead of a mock that silently permits concurrent writers.
Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
