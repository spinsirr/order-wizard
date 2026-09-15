import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { expect, it, vi } from 'vitest';

it('uses the WXT publisher and requires explicit upload and submission success despite HTTP 200', async () => {
  const require = createRequire(import.meta.url);
  const wxtRequire = createRequire(require.resolve('wxt'));
  expect(wxtRequire.resolve('publish-browser-extension')).toBe(
    require.resolve('publish-browser-extension'),
  );
  const directory = await mkdtemp(join(tmpdir(), 'ordercue-upload-test-'));
  const zip = join(directory, 'fixture.zip');
  await writeFile(zip, 'Local mock upload only');
  let uploadState: string | undefined = 'FAILURE';
  let publishStatus: unknown = ['OK'];
  const mockFetch = vi.fn<typeof fetch>(async (url, options) => {
    if (options?.body instanceof Readable) {
      await options.body.toArray();
    }
    if (String(url) === 'https://oauth2.googleapis.com/token') {
      return Response.json({ access_token: 'mock-only', token_type: 'Bearer' });
    }
    if (String(url) === 'https://www.googleapis.com/upload/chromewebstore/v1.1/items/mock') {
      return Response.json({
        uploadState,
        itemError: [{ error_code: 'INVALID_MANIFEST', error_detail: 'Mock rejection' }],
      });
    }
    if (
      String(url) ===
      'https://www.googleapis.com/chromewebstore/v1.1/items/mock/publish?publishTarget=default&reviewExemption=false'
    ) {
      expect(options?.method).toBe('POST');
      return Response.json({ status: publishStatus, statusDetail: ['Mock publish detail'] });
    }
    throw new Error(`Unexpected request: ${String(url)}`);
  });
  vi.stubGlobal('fetch', mockFetch);
  try {
    const { ChromeWebStore } = await import('publish-browser-extension');
    const store = new ChromeWebStore(
      {
        zip,
        extensionId: 'mock',
        clientId: 'mock',
        clientSecret: 'mock',
        refreshToken: 'mock',
        skipSubmitReview: false,
        publishTarget: 'default',
        reviewExemption: false,
      },
      () => {},
    );
    await expect(store.submit(false)).rejects.toThrow('INVALID_MANIFEST');
    for (uploadState of ['IN_PROGRESS', 'UNKNOWN', undefined]) {
      await expect(store.submit(false)).rejects.toThrow(uploadState ?? 'MISSING_STATE');
    }
    expect(mockFetch.mock.calls.some(([url]) => String(url).includes('/publish'))).toBe(false);
    uploadState = 'SUCCESS';
    for (publishStatus of [
      ['NOT_AUTHORIZED'],
      ['OK', 'NOT_AUTHORIZED'],
      ['UNKNOWN'],
      [],
      'OK',
      undefined,
    ]) {
      await expect(store.submit(false)).rejects.toThrow('Mock publish detail');
    }
    for (publishStatus of [['OK'], ['ITEM_PENDING_REVIEW'], ['OK', 'ITEM_PENDING_REVIEW']]) {
      await expect(store.submit(false)).resolves.toBeUndefined();
    }
  } finally {
    vi.unstubAllGlobals();
    await rm(directory, { recursive: true, force: true });
  }
});
