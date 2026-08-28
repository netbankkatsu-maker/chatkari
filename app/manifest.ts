import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Chatkari — AIマッチングチャット",
    short_name: "Chatkari",
    description: "架空の成人AIキャラクターと話せるマッチングチャット",
    start_url: "/",
    display: "standalone",
    background_color: "#fff9f8",
    theme_color: "#ef5c7a",
    orientation: "portrait-primary",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
