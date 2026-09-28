import type { MetadataRoute } from "next";
import { t } from "@/i18n";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: t.app.name,
    short_name: t.app.name,
    description: t.app.tagline,
    start_url: "/",
    display: "standalone",
    background_color: "#f6f5f1",
    theme_color: "#0f766e",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
