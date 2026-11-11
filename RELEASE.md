# Release Checklist — AgentLens

Status: 0.0.1 was uploaded to the Visual Studio Marketplace on 2026-11-09 with the owner's approval and passed verification (see the extension name item below); there is no Git tag and no GitHub release yet. Version 0.0.2 (the start-up offer for the Claude Code hook, ADR-009; commit `465f981`) was uploaded on 2026-11-11 with the owner's approval ("up" in chat) and passed verification: the VSIX is `agentlens-file-monitor-0.0.2.vsix` with sha256 `ead6f8aa7afc7e09f4ee34553823b026fb2994402b238d411b62be44e3c62ce6`, packaged with `npx @vscode/vsce@4.1.0 package --no-dependencies`, and the integration suite passed 29 of 29 against its unpacked contents. The public listing shows Version 0.0.2 (see `TESTING.md`). It went up through the Marketplace page for the owner's account (Manage, row menu, Update) as an update to 0.0.1. Items marked **Owner** need a decision from the project owner.

## Blockers found by a packaging dry run

`npx @vscode/vsce@4.1.0 package --no-dependencies` produces a VSIX with the manifest, `package.json`, README, `dist/extension.js`, its source map, `dist/hook.js` (the Claude Code hook script, required by the installer), `media/agentlens.svg` and the Marketplace icon `media/icon.png` (source: `media/icon.svg`). It reports:

- `WARNING LICENSE, LICENSE.md, or LICENSE.txt not found` — **Owner:** choose a license and add the file. `package.json` currently says `UNLICENSED`.
- `publisher` is set to `piya-boy` in `package.json` (chosen from the GitHub account; the extension id was `piya-boy.agentlens` until the name was changed, see the extension name item below). The publisher was created on 2026-11-09 at https://marketplace.visualstudio.com/manage/publishers/piya-boy (name `Piya-Boy`, id `piya-boy`, role Owner, no extension uploaded) under the owner's Microsoft account; the owner added the logo and the source repository link on the form. **Owner:** create a Personal Access Token (Azure DevOps, scope Marketplace, Manage) or use another publishing login; no token exists in this repository and I did not create one. Nothing has been published. `vsce` accepts the id (`^[a-z0-9][a-z0-9-]*$`, case-insensitive). `private: true` stays: `vsce` ignores it and it only stops an accidental `npm publish`.
- Extension name — the Marketplace web upload of the first 0.0.1 VSIX (name `agentlens`) was refused on 2026-11-09 with "The extension 'agentlens' already exists in the Marketplace. Please use a different 'name' in the package.json file." The existing extension is `vibe-x-ai.agentlens`, also titled "AgentLens"; two more have similar names (`sumonbis.agentlens-supervisor`, `MohithShrivastava.agentlens-viewer`). With the owner's approval, `name` is now `agentlens-file-monitor`, so the extension id is `piya-boy.agentlens-file-monitor`. That upload was refused again with "The extension display name is taken. Please try a different one." (`AgentLens` is the display name of `vibe-x-ai.agentlens`), so, again with the owner's approval, `displayName` is now `AgentLens File Monitor`. Command ids and setting keys keep the `agentlens.` prefix and the product is still called AgentLens in the README and docs. The third upload (VSIX sha256 `c988ddc2ed8e0ec75ecf6b5679610dd02ec1e88f3b9980752f636a17e6ffeda3`) was accepted by the web form on 2026-11-09, showed `Verifying 0.0.1` for about five minutes and then passed. The listing is live at https://marketplace.visualstudio.com/items?itemName=piya-boy.agentlens-file-monitor (released 2026-11-09 22:06 local time, Free, availability Public, 0 installs, unique identifier `piya-boy.agentlens-file-monitor`). Version 0.0.1 cannot be uploaded again under this id, so any fix needs a new version number.
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

- [x] **Owner** approves publishing and the target — done for 0.0.1 on the Marketplace ("Upload 0.0.1 now, as it is", 2026-11-09, with the UNLICENSED manifest and the opt-in update check included) and for 0.0.2 ("up", 2026-11-11); Open VSX was not touched
- [ ] Tag the release commit
- [ ] Record known limitations in the release notes (see the `ROADMAP.md` notes on unverified items)
