# Public launch requirements — 14 October 2026

The application changes in this release are a security and privacy baseline, not a compliance certification or proof that a public deployment is safe.

## Identity and documents

Policy pages identify **CodeLens**, **India**, and **mudiyalasanith2006@gmail.com**, supplied by the operator. Before public release, confirm the legal identity/address behind the trading name and publish any additional required business disclosures. Have Indian counsel review the Terms, privacy notice, consent flow, eligibility, grievance handling, and applicable commencement dates. Do not describe the product as “DPDP compliant” based on these documents alone.

Official starting points:
- [MeitY DPDP Rules and notifications](https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa?pageTitle=Digit)
- [DPDP Act](https://www.meity.gov.in/static/uploads/2024/02/Digital-Personal-Data-Protection-Act-2023-1.pdf)
- [OWASP HTTP headers guidance](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html)

## Items that need real deployment decisions

- [ ] Confirm target countries and whether access is restricted to adults; the signup confirmation is self-attestation, not verified age. Do not onboard children without a reviewed consent/verification process.
- [ ] Implement verified-email signup. Current signup checks address syntax and records Terms acceptance; it does not prove ownership.
- [ ] Inventory the actual host, region, backup service, email sender, active AI provider and any downstream model provider. Publish recipient/transfer details and confirm contracts, retention, and training settings before enabling AI for user content.
- [ ] Define and implement backup, database-journal, provider, and infrastructure-log retention. Publish those periods. Exercise deletion requests across processors and restore workflows; deleting an account does not delete existing backup files.
- [ ] Set up grievance handling, identity checks for requests, deadlines, escalation, and incident response. Confirm the provided contact mailbox is monitored.
- [ ] Deploy HTTPS, protected storage, offsite backups, uptime/error alerts, WAF/edge limits, and a tested rollback path.
- [ ] Load-test, restore-test, and independently security-test the deployed version, including email reset, source isolation, malicious ZIPs, AI rendering, and proxy/IP behavior.
- [ ] Add monetary AI budgets and provider spending alerts; request limits alone do not cap spend.
- [ ] Review material policy changes and reacceptance for existing accounts. Acceptance is currently recorded for new public signups only; administrator-created accounts must receive the policies separately.

No advertising or analytics tracking was added. Reassess consent and the privacy notice before introducing trackers, billing, private repository access, or new recipients.
