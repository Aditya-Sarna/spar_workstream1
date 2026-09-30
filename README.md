# spar_workstream1

Literature corpus and review site for SPAR Workstream 1 (AI-enabled biological misuse).

Live site: https://sparworkstream1.vercel.app/

App and pipeline live in [`corpus-explorer/`](corpus-explorer/). Protocol notes are in [`corpus-explorer/docs/IMPLEMENTATION.md`](corpus-explorer/docs/IMPLEMENTATION.md).

```bash
cd corpus-explorer
npm ci
npm run build
npm start
```

Do not run `npm run harvest` unless you intend to replace the identified set. Re-screen with `npm run screen` against the committed `data/records.json`.
