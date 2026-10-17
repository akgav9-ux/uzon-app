import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "UZON — Created in Uzbekistan. Connected to the world.",
    short_name: "UZON",
    description: "Messenger, stories, vertical clips, long-form video and creator studio.",
    start_url: "/home",
    display: "standalone",
    background_color: "#10121B",
    theme_color: "#10121B",
    lang: "ru",
    categories: ["social"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
