// Defaults to the local API while developing. Set REACT_APP_API_BASE_URL in
// Netlify/other deployment settings to point at the deployed backend.
export const BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000/api/v1';
