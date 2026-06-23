// Vercel serverless entry point. Vercel turns files under /api into functions;
// an Express app is itself a (req, res) handler, so we just re-export it.
// vercel.json rewrites /api/* and /webhook/* here, and Express sees the
// original path and routes as it does locally. (backend/index.js only calls
// app.listen() when run directly, so importing it here never starts a server.)
import app from '../backend/index.js';

export default app;
