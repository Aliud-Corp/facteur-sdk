# Security policy

This policy covers the four npm packages published from this repository (`@facteur-eu/sdk`, `playwright-facteur`, `cypress-facteur`, `create-facteur`) and the Facteur service they call (facteur.eu, app.facteur.eu, the API). If you found a vulnerability in one of them, this page tells you where to send it and what happens next.

## Report a vulnerability

Do not open a public issue. Use one of these two private channels:

- the **Report a vulnerability** button of this repository's Security tab (GitHub private vulnerability reporting);
- an email to **security@facteur.eu**.

Say which package and version, or which address of the service, what an attacker can do, and how to reproduce it. A proof of concept helps; data that belongs to someone else does not, so please test against your own account.

## What happens next

1. We acknowledge your report within **3 working days** (Monday to Friday, French public holidays excepted).
2. We confirm or rule out the vulnerability, tell you how we rate it, and keep you informed until the fix ships.
3. The fix ships as a new patch or minor release of every supported version. Its GitHub security advisory says which versions are affected, which version fixes it, and what to do meanwhile. We request a CVE identifier when the vulnerability affects a published version.
4. You are credited in the advisory, unless you prefer not to be.

## Coordinated disclosure

We ask you to keep the vulnerability private until the fix is released, and for no more than 90 days after your report. If we need longer, we say why and agree on a date with you. Once the fix is out, the advisory is public, and you are free to publish your own write-up.

## Supported versions

| Version | Security fixes |
| --- | --- |
| 3.x | Until 15 November 2031, five years after 3.0.0 was released |
| 2.0.0 | None. Targets an API that no longer exists, deprecated on npm |
| 1.0.0 | None. Targets an API that no longer exists, deprecated on npm |
| 0.0.0 | None. Deprecated on npm |

The four packages share one version number and one support period. When a new major version ships, the previous one keeps its date above.

Each release of this repository is named `<package>@<version>` and carries the software bill of materials (SBOM) of that version: a CycloneDX file that lists the runtime dependencies, to check whether a vulnerability in a dependency reaches you.

## Actively exploited vulnerabilities

Facteur is published by a company established in France, and the packages are subject to the EU Cyber Resilience Act (Regulation (EU) 2024/2847, article 14). When we learn that a vulnerability in one of the packages is actively exploited, we report it through the ENISA single reporting platform, with CERT-FR (ANSSI) as the coordinating authority:

| Step | Deadline |
| --- | --- |
| Early warning | 24 hours after we become aware of the exploitation |
| Vulnerability notification | 72 hours after we become aware of it |
| Final report | 14 days after a fix or mitigation is available |

A severe incident that affects the security of the packages follows the same path: early warning within 24 hours, notification within 72 hours, final report within one month.

We also tell the users of the affected versions, through the advisory and the release notes, what the vulnerability is and what to do about it, without waiting for the final report.
