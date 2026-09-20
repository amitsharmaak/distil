# Test links

`links.json` is the registry of URLs used to exercise ingestion, one entry per content shape.
Add a link whenever a new kind of source is tested; keep the `label` to what makes it a distinct
case. Categories so far: `article`, `x-long-post`, `x-article`, `x-video`, `youtube`,
`meeting-notes`.

## Bulk import

Posts every link to `/api/v1/captures` on the chosen origin with a capture token (create one on
Settings → Capture). Duplicates are skipped by the server, so it is safe to re-run.

```bash
npm run links:import -- --origin http://localhost:3000 --token <capture token>
```

Options: `--category youtube` to import one category, `--dry-run` to list without posting. The
script prints one line per link with the receipt status; use `/api/v1/captures` (signed in) to
watch them move from `queued` to `ready`.
