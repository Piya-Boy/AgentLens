# Release Checklist — AgentLens

Status: not released. Items marked **Owner** need a decision from the project owner.

## Blockers found by a packaging dry run

`npx @vscode/vsce@4.1.0 package --no-dependencies` produces a 7-file VSIX (manifest, `package.json`, README, `dist/extension.js`, its source map, `media/agentlens.svg`). It reports:

- `WARNING LICENSE, LICENSE.md, or LICENSE.txt not found` — **Owner:** choose a license and add the file. `package.json` currently says `UNLICENSED`.
- `publisher` is not set in `package.json` — **Owner:** create or choose a Marketplace publisher. Required to publish, not to build a local VSIX.
- No `icon` PNG for the Marketplace listing — **Owner:** provide a 128x128 PNG. The activity bar icon is an SVG and is separate.

## Before every release

- [ ] Branch is up to date and working tree is clean (`git status`)
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run test:integration`
- [ ] Manual scenarios from `TESTING.md` section 4 run and recorded (none run so far)
- [ ] `ROADMAP.md` and `README.md` match the shipped behavior
- [ ] Version bumped in `package.json` and `package-lock.json`
- [ ] `SECURITY.md` checklist reviewed; no item ticked without current evidence
- [ ] `npm audit --omit=dev` reports no vulnerabilities

## Package and inspect

```text
npx @vscode/vsce package --no-dependencies
npx @vscode/vsce ls
```

- [ ] The file list contains only `package.json`, `README.md`, `LICENSE`, `dist/extension.js`, `dist/extension.js.map` and `media/**`
- [ ] No source code from `src/`, no `.vscode-test`, no fixtures, no logs
- [ ] Install the VSIX in a clean VS Code profile and run `AgentLens: Enable`, `Disable`, `Pause Auto Focus` and the Activity Bar view

## Publish

- [ ] **Owner** approves publishing and the target (Marketplace, Open VSX or manual VSIX)
- [ ] Tag the release commit
- [ ] Record known limitations in the release notes (see the `ROADMAP.md` notes on unverified items)
