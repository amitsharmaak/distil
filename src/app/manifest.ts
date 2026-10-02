import type { MetadataRoute } from "next";
import { ICON_VERSION } from "@/components/brand/icon-version";

/** Installed apps refetch an icon only when its URL changes; see `ICON_VERSION`. */
const icon = (name: string) => `/icons/${name}.png?v=${ICON_VERSION}`;

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Distil — Personal Knowledge Capture",
    short_name: "Distil",
    description: "Save articles and turn them into focused, actionable insight.",
    // Today is the home of the app. `id` is pinned so that a later change of `start_url` does not
    // change the identity of an installed app: without it the identity is derived from `start_url`.
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f6f3ed",
    theme_color: "#172329",
    orientation: "portrait-primary",
    icons: [
      { src: icon("icon-192"), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: icon("icon-512"), sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: icon("icon-maskable-512"),
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    // Capture stays one long-press (or right-click) away from the installed app's icon.
    shortcuts: [
      {
        name: "Save a link",
        short_name: "Save",
        description: "Save a link to Distil.",
        url: "/save",
        icons: [{ src: icon("icon-192"), sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
