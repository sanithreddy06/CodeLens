# CodeLens security and incident response

Report vulnerabilities privately to **mudiyalasanith2006@gmail.com**. Include affected version, reproducible steps using your own data, and impact. Never send live credentials, tokens, or other users’ code. Do not disclose sensitive reports in public issues. There is no promised bounty or response-time guarantee.

## Implemented controls

- Salted scrypt password hashing; HTTP-only, SameSite cookies and Secure cookies in production.
- Per-account resource authorization, CSRF tokens for authenticated mutations, custom request headers, and origin checks.
- Per-IP and per-account request limits, bounded password operations, queue, upload, storage, and AI request limits. Limits are local to one process.
- CSP restricts scripts to this origin, blocks plugins and framing, and restricts form destinations. Inline styles remain permitted for graph/rendering libraries. Sensitive browser APIs are disabled.
- Password-reset links use random tokens, hashed storage, 15-minute expiry, single use, and session revocation. Email format validation is not verified-email signup.
- Account exports/deletion/session revocation require the current password. Account deletion is refused while work is active and for accounts still present in `LOGIN_USERS` to avoid recreation at restart.
- ZIP path and expansion limits, source filtering, and best-effort secret redaction. Imported projects are not executed.
- Provider failure logs omit raw provider messages. AI output remains untrusted and may be inaccurate.

## Deployment responsibilities

1. Use HTTPS at the ingress. Do not expose the Node port publicly. Set `NODE_ENV=production`; remove bootstrap `LOGIN_USERS` after initialization.
2. Configure exact origin/proxy settings. Never trust arbitrary forwarded headers. For separate frontend hosting, set equivalent CSP headers on that host; the API cannot protect HTML hosted elsewhere.
3. Put request-body limits, per-IP limits, WAF/DDoS protection, connection limits, and alerts at the edge. The application cannot absorb volumetric attacks itself.
4. Run one instance until the queue, rate limits, and database are shared safely. Load-test realistic workloads before assigning a capacity target.
5. Restrict database/uploads/backup filesystem access. Use encrypted disks and encrypted offsite backups; define retention and test restore. Application deletion is logical deletion, not forensic erasure of database pages or old backups.
6. Monitor security errors and email delivery failures without recording request bodies, cookies, reset links, source, or credentials. Define log retention and review access regularly.
7. Review dependency advisories and run all tests for updates. CI audits production dependencies at high/critical severity. An audit is not a penetration test.
8. Configure and test an email sender. Complete verified-email onboarding before unrestricted public signup, or close signup with `ALLOW_SIGNUP=false`.

## Incident procedure

- Record detection time, affected version, scope, and an incident owner in a restricted record.
- Contain: close signup, block abusive traffic, disable affected integrations, or take the service offline if data access is at risk.
- Rotate compromised provider/deployment credentials and revoke affected sessions. Preserve relevant logs securely without creating more copies of user content.
- Determine which users and data were affected, whether access persists, and the applicable reporting/notification requirements. Escalate legal deadlines promptly to qualified counsel.
- Notify affected users and competent authorities when required, with verified facts and protective steps; do not speculate about exposure.
- Patch and test, restore only trusted backups, apply previously requested deletions after restore, then reopen gradually. Document follow-up actions and verify them.
