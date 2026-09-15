import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import { installDemoBrowserApi } from '@/demo/browserMock';
import './demo.css';

document.body.dataset['demoPage'] = 'true';

void installDemoBrowserApi()
  .then(() => import('./render'))
  .then(({ renderDemo }) => renderDemo());
