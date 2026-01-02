import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { AuthProvider } from 'react-oidc-context';
import { cognitoAuthProviderProps } from './config';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <AuthProvider
      {...cognitoAuthProviderProps}
      onSigninCallback={() => {
        // Clean up the OAuth callback parameters from the URL
        window.history.replaceState({}, document.title, window.location.pathname);
      }}
    >
      <App />
    </AuthProvider>
  </StrictMode>,
);
