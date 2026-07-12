# code-review
- Apply senior backend production-readiness standards: check for module-level side effects, non-deterministic values, missing JSDoc on exports, security concerns (e.g., missing env var warnings), and dead code. Confidence: 0.70

# auth
- Remove demo/fallback auth mode — app must work via OAuth only, no system-user bypass. Confidence: 0.75
