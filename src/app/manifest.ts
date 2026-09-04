import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Distil — Personal Knowledge Capture",
    short_name: "Distil",
    description: "Save articles and turn them into focused, actionable insight.",
    start_url: "/save",
    display: "standalone",
    background_color: "#f6f3ee",
    theme_color: "#3730a3",
    orientation: "portrait-primary",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
