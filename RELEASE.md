# Release Checklist — AgentLens

Status: not released. Items marked **Owner** need a decision from the project owner.

## Blockers found by a packaging dry run

`npx @vscode/vsce@4.1.0 package --no-dependencies` produces a VSIX with the manifest, `package.json`, README, `dist/extension.js`, its source map, `dist/hook.js` (the Claude Code hook script, required by the installer), `media/agentlens.svg` and the Marketplace icon `media/icon.png` (source: `media/icon.svg`). It reports:

- `WARNING LICENSE, LICENSE.md, or LICENSE.txt not found` — **Owner:** choose a license and add the file. `package.json` currently says `UNLICENSED`.
- `publisher` is set to `piya-boy` in `package.json` (chosen from the GitHub account; the extension id is now `piya-boy.agentlens`). The publisher was created on 2026-11-09 at https://marketplace.visualstudio.com/manage/publishers/piya-boy (name `Piya-Boy`, id `piya-boy`, role Owner, no extension uploaded) under the owner's Microsoft account; the owner added the logo and the source repository link on the form. **Owner:** create a Personal Access Token (Azure DevOps, scope Marketplace, Manage) or use another publishing login; no token exists in this repository and I did not create one. Nothing has been published. `vsce` accepts the id (`^[a-z0-9][a-z0-9-]*# Release Checklist — AgentLens

Status: not released. Items marked **Owner** need a decision from the project owner.

## Blockers found by a packaging dry run

`npx @vscode/vsce@4.1.0 package --no-dependencies` produces a VSIX with the manifest, `package.json`, README, `dist/extension.js`, its source map, `dist/hook.js` (the Claude Code hook script, required by the installer), `media/agentlens.svg` and the Marketplace icon `media/icon.png` (source: `media/icon.svg`). It reports:

- `WARNING LICENSE, LICENSE.md, or LICENSE.txt not found` — **Owner:** choose a license and add the file. `package.json` currently says `UNLICENSED`.
, case-insensitive). `private: true` stays: `vsce` ignores it and it only stops an accidental `npm publish`.
- Marketplace icon — done: `media/icon.png` (128x128 RGBA, rendered from `media/icon.svg`) is set as `icon` in `package.json`, and vsce no longer warns about it. **Owner:** confirm the design or replace both files; the activity bar icon is a separate SVG. The 16x16 rendering is muddy (the amber marker is not distinct); 32x32 and 128x128 are readable.

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

- [ ] The file list contains only `package.json`, `README.md`, `LICENSE`, `dist/extension.js`, `dist/extension.js.map`, `dist/hook.js` and `media/**` (the icon files `icon.png` and `icon.svg` are expected there)
- [ ] No source code from `src/`, no `.vscode-test`, no fixtures, no logs
- [ ] Unpack the VSIX (it is a zip; rename it to `.zip`) and run `AGENTLENS_EXTENSION_PATH=<unpacked>/extension npm run test:integration`; every case must pass with the extension loaded from the package, not the repository (done once for 0.0.1 on 2026-11-09, see `TESTING.md`; repeat for each release)
- [ ] Install the VSIX in a clean VS Code profile and run `AgentLens: Enable`, `Disable`, `Pause Auto Focus` and the Activity Bar view

## Publish

- [ ] **Owner** approves publishing and the target (Marketplace, Open VSX or manual VSIX)
- [ ] Tag the release commit
- [ ] Record known limitations in the release notes (see the `ROADMAP.md` notes on unverified items)
