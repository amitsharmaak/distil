# Distil identity

Approved on 2026-10-01: the open lowercase d, contemporary editorial wordmark and cobalt/ink
palette. The accepted reference is [the refined board](logo-concepts/04-refined-editorial-focus.png).
Open [the asset preview](brand-assets.html) for actual display sizes and light/dark treatments.

## Masters and use

`src/components/brand/artwork.ts` is the single geometry and palette source. The mark was rebuilt
as clean vector curves; the approved lettering was outlined from the reference, preserving its
shape and spacing. The wordmark is artwork, not a font. Neither it nor the symbol embeds a bitmap
or needs a font, external resource, gradient or runtime image request.

Use `DistilLogo` from `src/components/brand/distil-logo.tsx` in React. Its wordmark follows
`currentColor`; the symbol stays cobalt. `compact` displays the symbol alone. It has an accessible
"Distil logo" name, an intrinsic size and no focusable controls. Give it a height and `w-auto` to
preserve proportions.

| Asset                                       | Use                                                             |
| ------------------------------------------- | --------------------------------------------------------------- |
| `public/brand/distil-logo.svg`              | Cobalt symbol and ink wordmark on light surfaces                |
| `public/brand/distil-logo-light.svg`        | Cobalt symbol and ivory wordmark on dark surfaces               |
| `public/brand/distil-logo-mono.svg`         | Single-color ink lockup                                         |
| `public/brand/distil-wordmark.svg`          | Outlined wordmark alone                                         |
| `public/brand/distil-mark.svg`              | Cobalt symbol; `-mono` and `-light` versions are also available |
| `public/brand/distil-app-icon.svg`          | Ivory symbol on a rounded ink tile                              |
| `public/brand/distil-app-icon-maskable.svg` | Full-bleed ink background and inset symbol for platform masks   |

Palette: cobalt `#315df5`, ink `#172329`, ivory `#f6f3ed`. Keep clear space around the logo; never
stretch it or close its horizontal aperture. The reviewed sidebar height is 28 px, authentication
height is 40 px and extension popup width is 120 px. Browser icons have dedicated 16/32/48/128 px
exports. The regular web icons are 192/512 px; the maskable icon is a separate 512 px file and the
Apple icon is 180 px. The maskable artwork fits within the central safe circle and has an opaque
background. The ICO contains 16/32/48/64 px frames; `src/app/icon.svg` supplies scalable metadata.

## Regeneration

```sh
npm run brand:generate
npm run brand:check
```

The generator exports 23 assets, including the extension's local `brand.svg`, toolbar icons and
440 × 280 store image. It uses a direct, locked Sharp dependency already used by Next.js;
no network or image generation is needed. `brand:check` compares committed bytes against the
master output. If the approved geometry changes, regenerate instead of editing individual exports.

The wordmark was traced once with Potrace 2.1.8 (threshold 128, curve tolerance 0.35) from the
main lockup of the approved raster board, then stored as paths. Potrace is not a project dependency
and is not needed to regenerate assets. The symbol is manually constructed geometry.

## Integration boundary

These changes update the sidebar, legacy login, hosted sign-in card, favicon, web manifest,
home-screen icons, extension popup/settings and store artwork. Capture endpoints, permissions,
production origins and extension connection behavior are unchanged. The extension manifest keeps
its existing version; any published-store version change belongs to the release step.

The concurrent `codex/ui-modernization` branch introduced a separate
`src/components/layout/brand-mark.tsx` containing the old funnel. When integrating both branches,
keep that branch's layout changes and use `DistilLogo` for its brand region. Remove its obsolete
funnel component if unused; do not overwrite its layout or retain two competing logos. The UI
refresh and this task own their own branches; neither merges the other's work.

Production release and Chrome Web Store upload are separate from preparing these assets.
