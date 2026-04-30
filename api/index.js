// Vercel serverless entry point.
// NOTE: Vercel's serverless filesystem is read-only (except /tmp, which is ephemeral).
// CSV writes will NOT persist across requests on Vercel. For real persistence, host on
// Render / Railway / Fly.io / a VPS / Replit Deployments — anywhere with a real disk.
module.exports = require('../server.js');
