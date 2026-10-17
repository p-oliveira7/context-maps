# Releasing

Context Maps follows [Semantic Versioning](https://semver.org/). The version lives in two places that a test
keeps in sync: `package.json` (`version`) and `version.js` (`VERSION`, used by the app and the CLI).

## While working

Every pull request that changes behaviour adds a line under **`## [Unreleased]`** in `CHANGELOG.md`
(`Added`, `Changed`, `Fixed`, `Removed` or `Security`). Docs-only and test-only changes need no entry.

## Cutting a release

1. Pick the next version: breaking change → major (minor while below 1.0.0), new feature → minor, fix → patch.
2. On a branch `chore/release-X.Y.Z`:
   - Rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD` and add a fresh empty `## [Unreleased]` above it.
   - Update the compare links at the bottom of `CHANGELOG.md`.
   - Set the same version in `package.json` and `version.js`.
   - Run `npm test` (it fails if the two versions differ) and the browser tests.
3. Open the pull request and merge it into `main`.
4. Tag the merge commit and publish the release, using the changelog section as the notes:
   ```bash
   git checkout main && git pull
   git tag -a vX.Y.Z -m "Context Maps X.Y.Z"
   git push origin vX.Y.Z
   ```
   Then create the GitHub release for the tag (title `vX.Y.Z`, notes from `CHANGELOG.md`).

The running version is shown at the bottom of the presentation menu in the app and by
`node skills/context-maps/scripts/rm.mjs --version`.
