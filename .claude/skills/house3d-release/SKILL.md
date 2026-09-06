---
name: house3d-release
description: |
  Releases a new version of sowel-house-3d. Use when the user asks to "release", "tag", "publish" the app, or says "créer une release", "publier", "tagger".
  Version bump via PR, tag on main, GitHub release with the static build tarball the showroom deploys.
disable-model-invocation: true
argument-hint: "<version> (e.g. 0.2.0)"
---

# sowel-house-3d — release workflow

Release version: $ARGUMENTS

Main is protected (PR required, linear history). A release is a **PR merge followed by a tag on main**.

## Step 1: Version

Semver, from `$ARGUMENTS`; if absent, read `package.json`, suggest the next minor, ask to confirm.

## Step 2: Pre-flight

```bash
git checkout main && git pull
git status --porcelain      # must be empty
npm run validate
```

## Step 3: Release PR

```bash
git checkout -b release/v<version>
# Bump "version" in package.json (release.yml refuses a mismatch with the tag)
# Add a `## v<version>` entry to CHANGELOG.md
git add package.json CHANGELOG.md
git commit -m "release: v<version>"
git push -u origin release/v<version>
gh pr create --title "release: v<version>" --body "Version bump for v<version>"
```

Present the PR and **wait for explicit approval before merging**.

## Step 4: Tag on main

```bash
git checkout main && git pull
git log -1                       # must be "release: v<version>"
git tag v<version> && git push origin v<version>
gh run watch                     # release.yml builds dist/ and publishes sowel-house-3d-<version>.tar.gz
```

## Step 5: Showroom

The showroom pins the app version in its compose. Open a PR there bumping it, and say so to the user.
