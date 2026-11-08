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
