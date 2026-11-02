
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "UZON — Created in Uzbekistan. Connected to the world.",
    short_name: "UZON",
    description:
      "Messenger, stories, vertical clips, long-form video and creator studio.",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    background_color: "#050B2A",
    theme_color: "#075BFF",
    lang: "ru",
    categories: ["social"],
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
