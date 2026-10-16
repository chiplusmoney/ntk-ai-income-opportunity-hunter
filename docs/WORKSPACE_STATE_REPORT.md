# Workspace state

Date: 2026-10-16. Version 0.4.1. Verdict: **M5b_PARTIAL_CLOUDFLARE_ACCESS_BLOCKED**.

Canonical source: WORKING, branch main, repository https://github.com/chiplusmoney/ntk-ai-income-opportunity-hunter. Final source commit and clean-tree result are generated externally by the packager. Source rollback branch: m5b-pre-hardening-20261015 at a66532d.

The project root retains WORKING, DESIGN_REFERENCES, ARCHIVE and HANDOFF_TO_CHATGPT. Ignored local runtime scratch remains outside the portable source package. Do not copy runtime credentials, CLI sessions, dependencies, build output or Git internals into the handoff.

Superseded handoff files are preserved together under a timestamped ARCHIVE child. Exactly one current canonical ZIP is published to HANDOFF_TO_CHATGPT, with its checksum and metadata computed from the completed archive. Its source excludes node_modules, dist, local env files and .git; source files and design references are included.

Resources preserved: existing Firebase project/database/Hosting; existing Render service and mounted Secret File; existing Cloudflare Worker. No replacement resource, billing change or M6 work. Fresh credential values must stay server-side. The optional runtime used for validation is Node 24.20 on this machine; the project declares >=24.20 <25.
