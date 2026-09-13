import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import { installDemoBrowserApi } from '@/demo/browserMock';
import './demo.css';

installDemoBrowserApi();
document.body.dataset.demoPage = 'true';

void import('./render').then(({ renderDemo }) => renderDemo());
