# Agent instructions

## Formatting

After making any changes, run Prettier from this folder:

```sh
npm run format
```

It formats the whole project with the settings in `.prettierrc.json` (no semicolons, single quotes, 120
columns). `npm run format:check` reports files that aren't formatted without changing them.

## Versions

Don't change Ember's version (`version` in `package.json`) as part of a commit or feature. A version bump is
the owner's decision, made when they say a release is ready. Ember is pre-release at 0.1.0 and goes to 1.0.0
when the owner says it's ready for the public.

`WLED-VERSION` is the WLED release Ember is built and tested for. Don't change it either unless asked; it's set
once the firmware-specific data in `README.md` has been checked against a new release. Nothing that ships
should read the firmware checkout in `../wled-firmware`: it's for reference and the mock's generator scripts.

When the owner asks for a version bump, check that everything is up to date before committing it:

- `version` in `package.json` and `package-lock.json` (`npm version <x.y.z> --no-git-tag-version` sets both).
- Every Markdown file (`README.md`, `AGENTS.md`, `PARITY.md`, `src/lib/fxcolors.md` and any others): versions
  they name, install and removal steps, feature lists and screenshots that no longer match the app.
- `WLED-VERSION` and the README's firmware-specific data table, if this release targets a new WLED version.
- `npm run build` prints the expected `Ember <version> (<hash>) for WLED <version>`.
- Formatting (`npm run format:check`), typecheck and lint pass.

Report anything out of date to the owner instead of guessing, and make the bump its own commit. Tag it
(`ember-v<x.y.z>`) only when the owner says it's a release.
