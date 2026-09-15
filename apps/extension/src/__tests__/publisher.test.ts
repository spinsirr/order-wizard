import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { expect, it, vi } from 'vitest';

it('uses WXT API v2, rejects incomplete uploads and propagates submission failures', async () => {
  const require = createRequire(import.meta.url);
  const wxtRequire = createRequire(require.resolve('wxt'));
  expect(wxtRequire.resolve('publish-browser-extension')).toBe(
    require.resolve('publish-browser-extension'),
  );
  const directory = await mkdtemp(join(tmpdir(), 'ordercue-upload-test-'));
  const zip = join(directory, 'fixture.zip');
  await writeFile(zip, 'Local mock upload only');
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const item = 'publishers/mock-publisher/items/mock';
  let uploadState: string | undefined = 'FAILED';
  let publishStatus = 403;
  const mockFetch = vi.fn<typeof fetch>(async (url, options) => {
    if (options?.body instanceof Readable) {
      await options.body.toArray();
    }
    if (String(url) === 'https://oauth2.googleapis.com/token') {
      return Response.json({ access_token: 'mock-only', token_type: 'Bearer' });
    }
    if (String(url) === `https://chromewebstore.googleapis.com/v2/${item}:fetchStatus`) {
      return Response.json({
        submittedItemRevisionStatus: { state: 'PENDING_REVIEW' },
      });
    }
    if (String(url) === `https://chromewebstore.googleapis.com/upload/v2/${item}:upload`) {
      return Response.json({ uploadState });
    }
    if (String(url) === `https://chromewebstore.googleapis.com/v2/${item}:publish`) {
      expect(options?.method).toBe('POST');
      expect(JSON.parse(String(options?.body))).toEqual({
        publishType: 'DEFAULT_PUBLISH',
        skipReview: false,
      });
      return Response.json(
        publishStatus === 200 ? { state: 'PENDING_REVIEW' } : { error: 'Mock publish denied' },
        { status: publishStatus },
      );
    }
    throw new Error(`Unexpected request: ${String(url)}`);
  });
  vi.stubGlobal('fetch', mockFetch);
  try {
    const { ChromeWebStoreV2 } = await import('publish-browser-extension');
    const store = new ChromeWebStoreV2({
      apiVersion: 'v2',
      zip,
      extensionId: 'mock',
      publisherId: 'mock-publisher',
      serviceAccountClientEmail: 'mock@example.invalid',
      serviceAccountPrivateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      skipSubmitReview: false,
      cancelPending: false,
      publishType: 'DEFAULT_PUBLISH',
      skipReview: false,
    });
    await expect(store.submit(true)).resolves.toBeUndefined();
    expect(mockFetch.mock.calls.some(([url]) => String(url).includes(':upload'))).toBe(false);
    for (uploadState of ['FAILED', 'UPLOAD_IN_PROGRESS', 'UNKNOWN', undefined]) {
      await expect(store.submit(false)).rejects.toThrow('CWS item upload state');
    }
    expect(mockFetch.mock.calls.some(([url]) => String(url).includes(':publish'))).toBe(false);
    uploadState = 'SUCCEEDED';
    await expect(store.submit(false)).rejects.toThrow('Mock publish denied');
    publishStatus = 200;
    await expect(store.submit(false)).resolves.toBeUndefined();
    expect(mockFetch.mock.calls.some(([url]) => String(url).includes(':cancelSubmission'))).toBe(
      false,
    );
  } finally {
    vi.unstubAllGlobals();
    await rm(directory, { recursive: true, force: true });
  }
});
