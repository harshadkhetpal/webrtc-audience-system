// In development: proxy handles routing to localhost:3001
// In production: REACT_APP_BACKEND_URL points to the Railway backend
const BACKEND_URL =
  process.env.REACT_APP_BACKEND_URL ||
  (process.env.NODE_ENV === 'production' ? '' : '');

export default BACKEND_URL;
