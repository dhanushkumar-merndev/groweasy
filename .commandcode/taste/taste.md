# code-review
- Apply senior backend production-readiness standards: check for module-level side effects, non-deterministic values, JSDoc on all functions (exports and internal helpers), security concerns (e.g., missing env var warnings), and dead code. Confidence: 0.75

# auth
- Remove demo/fallback auth mode — app must work via OAuth only, no system-user bypass. Confidence: 0.75

# logging
- Never log raw error objects or Zod issues directly — extract only safe fields (message, path) to avoid leaking stack traces, passwords, or API keys to logs. Confidence: 0.70
