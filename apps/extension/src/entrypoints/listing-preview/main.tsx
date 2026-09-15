import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@/entrypoints/sidepanel/index.css';
import './preview.css';
import { createRoot } from 'react-dom/client';
import { z } from 'zod';
import { FillResultDialog } from '@/content/fbFormFiller/FillResultDialog';
import { FILL_FIELDS } from '@/content/fbFormFiller/formFiller';
import { PreviewModal } from '@/content/fbMarketplace/PreviewModalComponent';
import { FBListingDataSchema } from '@/schemas/fbListing';

const element = document.getElementById('root');
if (!element) {
  throw new Error('Root element not found');
}
const root = createRoot(element);

function openPreview(event: MessageEvent) {
  if (event.source !== null && event.source !== window.parent) {
    return;
  }
  const port = event.ports[0];
  if (!port) {
    return;
  }
  if (
    event.data?.type === 'ordercue:fill-result' &&
    /^https?:\/\/([a-z0-9-]+\.)*facebook\.com$/.test(event.origin)
  ) {
    const results = z
      .array(z.object({ field: z.enum(FILL_FIELDS), error: z.string().optional() }))
      .parse(event.data.results);
    window.removeEventListener('message', openPreview);
    root.render(
      <FillResultDialog
        results={results}
        onRetry={() => port.postMessage({ type: 'retry' })}
        onKeep={() => port.postMessage({ type: 'keep' })}
        onDone={() => port.postMessage({ type: 'done' })}
      />,
    );
    return;
  }
  if (
    event.data?.type !== 'ordercue:preview' ||
    !/^https?:\/\/([a-z0-9-]+\.)*amazon\.com$/.test(event.origin)
  ) {
    return;
  }
  const listing = FBListingDataSchema.parse(event.data.listing);
  window.removeEventListener('message', openPreview);
  root.render(
    <PreviewModal
      listing={listing}
      onCancel={() => port.postMessage({ type: 'cancel' })}
      onConfirm={(updated) => port.postMessage({ type: 'confirm', listing: updated })}
    />,
  );
}

window.addEventListener('message', openPreview);
