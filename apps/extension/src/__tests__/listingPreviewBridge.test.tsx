// @vitest-environment jsdom
import { isValidElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

const renderPreview = vi.hoisted(() => vi.fn());
vi.mock('react-dom/client', () => ({ createRoot: () => ({ render: renderPreview }) }));

const listing = {
  title: 'Headphones',
  price: '35',
  originalPrice: '50',
  description: '',
  condition: 'new',
  category: 'electronics',
  pickupLocation: '',
  images: ['https://example.com/product.jpg'],
  orderNumber: 'sample',
  orderDate: '2026-09-01',
};

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it('rejects other origins and missing ports, then accepts an extension sender with null source', async () => {
  const element = document.createElement('div');
  element.id = 'root';
  document.body.append(element);
  const postMessage = vi.fn();
  // The browser supplies this port; only its postMessage boundary is used by the entrypoint.
  const port = { postMessage } as unknown as MessagePort;
  await import('@/entrypoints/listing-preview/main');
  const dispatch = (origin: string, ports: MessagePort[]) =>
    window.dispatchEvent(
      new MessageEvent('message', {
        origin,
        source: null,
        data: { type: 'ordercue:preview', listing },
        ports,
      }),
    );
  dispatch('https://www.amazon.com.attacker.example', [port]);
  dispatch('https://www.amazon.com', []);
  expect(renderPreview).not.toHaveBeenCalled();
  dispatch('https://www.amazon.com', [port]);
  expect(renderPreview).toHaveBeenCalledOnce();
  const rendered = renderPreview.mock.calls[0]?.[0];
  if (
    !isValidElement<{ onCancel: () => void; onConfirm: (value: typeof listing) => void }>(rendered)
  ) {
    throw new Error('Preview entrypoint did not render the dialog');
  }
  rendered.props.onCancel();
  rendered.props.onConfirm(listing);
  expect(postMessage.mock.calls).toEqual([[{ type: 'cancel' }], [{ type: 'confirm', listing }]]);
  dispatch('https://www.amazon.com', [port]);
  expect(renderPreview).toHaveBeenCalledOnce();
});
