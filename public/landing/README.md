# Landing media provenance

- `fundworkspace-logo.png`: user-supplied FundWorkspace logo PNG from the Codex attachment for this redesign. The PNG is used directly; no SVG derivative is generated.
- `fundworkspace-logo-transparent.png`: 2048×2048 transparent-background PNG derived deterministically from `fundworkspace-logo.png`; the original source remains unchanged.
- `research-expert.png`: sanitized crop of a local HarnessKit fixture from the Diligence Research and optional Expert validation flow. Tenant identity, account data, named expert data, and internal agent guidance/schema content are removed from the public derivative.
- `deals.png`: copy of the repository-owned Deal workspace screenshot (`public/screenshots/deals.png`).
- `lp-portal.png`: copy of the repository-owned LP Portal screenshot (`public/screenshots/lp-portal.png`).

The public product screenshots contain only fixture/demo data and are kept as static evidence rather than fetched from authenticated runtime APIs. Public derivatives are reviewed separately from their authenticated source captures.

The transparent logo derivative uses the imagegen skill's `remove_chroma_key.py` helper with border auto-keying, soft matte thresholds `8/96`, white despill, and a one-pixel edge contraction.
