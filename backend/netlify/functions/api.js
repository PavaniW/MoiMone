// Netlify Functions entry point. Wraps the Express app so the whole API runs
// as a single serverless function. A redirect in netlify.toml sends every
// request here, and serverless-http hands the original path to Express.
import serverless from 'serverless-http';
import app from '../../index.js';

export const handler = serverless(app);
