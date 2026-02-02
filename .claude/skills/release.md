---
name: release
description: Use when bumping version or releasing Amazon Order Wizard. Covers version bump, commit, and automatic release via GitHub Actions.
---

# Release Workflow

## Quick Release (Recommended)

Only modify the version in root `package.json`:

```bash
# 1. Bump version in root package.json
# Edit package.json: "version": "x.y.z"

# 2. Commit (hook auto-syncs extension versions)
git add package.json
git commit -m "chore: bump version to x.y.z"

# 3. Push to trigger GitHub Actions
git push origin main
```

## What Happens Automatically

1. **post-commit hook** - Syncs version to:
   - `apps/extension/package.json`
   - `apps/extension/public/manifest.json`

2. **GitHub Actions** (`.github/workflows/release.yml`) - When `package.json` changes:
   - Detects version change
   - TypeScript check + Lint
   - Builds extension
   - Creates git tag `vX.Y.Z`
   - Publishes GitHub Release with zip

## Version Files

| File | Auto-synced |
|------|-------------|
| `package.json` (root) | Manual edit |
| `apps/extension/package.json` | ✅ via hook |
| `apps/extension/public/manifest.json` | ✅ via hook |
| `apps/server/Cargo.toml` | ❌ Manual if needed |

## Publishing to Chrome Web Store

1. Download `amazon-order-wizard-vX.Y.Z.zip` from GitHub Releases
2. Log in to [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole)
3. Upload zip package
4. Submit for review

## Troubleshooting

### Tag already exists
```bash
git tag -d vX.Y.Z           # Delete local tag
git push origin :vX.Y.Z     # Delete remote tag
```

### Hook not syncing
```bash
# Ensure hook is executable
chmod +x .git/hooks/post-commit
```
