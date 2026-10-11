# CodeLens release checklist

This is a work plan, not a security certification. Leave items unchecked until there is recorded evidence that they work in the deployed environment. Deployment instructions are in [DEPLOYMENT.md](DEPLOYMENT.md).

## Invitation-only beta

- [ ] Deploy a production build with fake AI disabled, HTTPS, persistent storage, and unique account passwords.
- [ ] Verify login, logout, import, source browsing, history deletion, restart recovery, and AI-disabled behavior on the deployed service.
- [ ] Keep one application instance while the queue and SQLite database use local storage.
- [ ] Limit access to invited testers and explain that only public or non-sensitive code should be uploaded during the beta.
- [ ] Configure uptime checks, error alerts, and a support contact; keep credentials and uploaded source out of logs.
- [ ] Schedule offsite backups with restricted access, encryption, and expiration; restore a backup into an isolated instance.
- [ ] Record a working release and verify how to roll back without losing stored data.
- [ ] Test the selected real AI provider and record response quality, latency, and cost before enabling it for testers.

## Before public signup

- [ ] Implement verified email signup, secure expiring password-reset links, and session revocation after password changes.
- [ ] Provide account deletion and personal-data export; cover source, analyses, conversations, pending uploads, and backup expiration in the retention policy.
- [ ] Document exactly which source snippets reach AI providers, which vendors process data, and the configured retention settings.
- [ ] Publish reviewed privacy, terms, and acceptable-use documents with a real contact address and jurisdiction-appropriate rights procedures.
- [ ] Assess cookie consent based on the analytics and cookies actually used.
- [ ] Independently test authentication, CSRF, cross-account access, malicious ZIPs, outbound fetching, and credential leakage using OWASP ASVS as a review baseline.
- [ ] Test AI prompt injection, unsupported answers, citation accuracy, provider outages, timeouts, and retry behavior with representative repositories.
- [ ] Add enforceable token or monetary AI budgets and alerts in addition to request-count limits.
- [ ] Configure edge attack protection and verify trusted proxy settings; confirm rate limits use the real client identity.
- [ ] Load-test realistic imports and concurrent sessions; record supported capacity, queue limits, and behavior under overload.
- [ ] Validate the actual production container, health checks, graceful shutdown, backup restoration, and rollback procedure.
- [ ] Review mobile use, keyboard navigation, accessibility, onboarding, and actionable failure messages.
- [ ] Establish incident handling, dependency-update ownership, and a vulnerability-reporting contact.

## Before expanding infrastructure or product scope

- [ ] Before adding replicas, implement coordinated queue claiming, shared rate limits, and storage accessible to all workers; verify restart and duplicate-delivery behavior.
- [ ] Choose database and object-storage changes using measured capacity and recovery requirements.
- [ ] Before supporting private repositories, implement narrowly scoped authorization, revocation, and repository access checks.
- [ ] Before charging, implement server-enforced plan limits, verified and idempotent payment webhooks, cancellation, and refund handling.

## Release evidence

For each release, record the commit or version, deployment date, environment, checks performed, results, known limitations, rollback target, and person responsible. Do not record passwords, API keys, or customer source in this document.
