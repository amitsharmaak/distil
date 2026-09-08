# Disabled Neon Auth UI dependency

Distil uses the official `@neondatabase/auth` Next.js server and client adapters, but not its
prebuilt UI exports. The pinned `0.5.0-beta` SDK nevertheless declares
`@neondatabase/auth-ui` as a mandatory runtime dependency. That unused subtree currently contains
an invalid Better Auth peer resolution and AGPL-licensed packages.

This local package is an explicit fail-closed replacement for that unused dependency. Importing a
legacy Neon Auth UI entry point throws immediately. Remove this override when a pinned official SDK
release makes the UI a separately installed dependency, as the upstream README already documents.
