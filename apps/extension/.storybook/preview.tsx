import type { Preview } from '@storybook/react-vite';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@/entrypoints/sidepanel/index.css';
import './preview.css';

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    controls: { expanded: true },
    options: { storySort: { order: ['Orders', 'Workflow'] } },
    viewport: {
      options: {
        narrow: { name: 'Side panel · 320px', styles: { width: '320px', height: '740px' } },
        standard: { name: 'Side panel · 400px', styles: { width: '400px', height: '800px' } },
        wide: { name: 'Side panel · 480px', styles: { width: '480px', height: '900px' } },
      },
    },
  },
  initialGlobals: { viewport: { value: 'standard', isRotated: false } },
};

export default preview;
