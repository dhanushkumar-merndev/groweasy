# auth
- Proxy Better Auth through Vercel/Next.js rewrites when frontend and backend are on different domains to avoid cross-domain cookie issues. Confidence: 0.40
- For direct cross-origin setups (no proxy), configure CORS with credentials: true, set auth client baseURL to the backend URL with fetchOptions: { credentials: "include" }, and add the frontend origin to trustedOrigins. Confidence: 0.60
- Do not use account.skipStateCookieCheck: true — it bypasses OAuth CSRF security. Confidence: 0.70
- When calling the backend directly (no proxy), set authClient baseURL to the backend URL, configure CORS with credentials: true, set trustedOrigins to the frontend domain, and point Google OAuth redirect URI to the backend domain. Confidence: 0.60
