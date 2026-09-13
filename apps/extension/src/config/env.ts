// OAuth public-client metadata is bundled into every published extension. Environment
// variables remain available for alternate deployments without making local builds
// depend on an ignored .env file.
export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'https://order-wizard-api.fly.dev';
export const cognitoAuthority =
  import.meta.env.VITE_COGNITO_AUTHORITY ||
  'https://cognito-idp.us-west-1.amazonaws.com/us-west-1_OmCa6h5mU';
export const cognitoClientId =
  import.meta.env.VITE_COGNITO_CLIENT_ID || '2g61sgjultqdm7n9j2lusopfpd';
export const cognitoDomain =
  import.meta.env.VITE_COGNITO_DOMAIN ||
  'https://us-west-1omca6h5mu.auth.us-west-1.amazoncognito.com';
