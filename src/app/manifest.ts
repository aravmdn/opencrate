import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OpenCrate",
    short_name: "OpenCrate",
    description: "Find artist-approved music downloads and open catalog matches.",
    start_url: "/",
    display: "standalone",
    background_color: "#f2f0e9",
    theme_color: "#121210",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
