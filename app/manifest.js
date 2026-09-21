export default function manifest() {
  return {
    name: "Personal HQ — המנכ״ל",
    short_name: "המנכ״ל",
    description: "ניהול החיים כחברת אחזקות",
    start_url: "/",
    display: "standalone",
    background_color: "#08111f",
    theme_color: "#0b1a2d",
    dir: "rtl",
    lang: "he",
    orientation: "portrait-primary",
    categories: ["productivity", "finance", "health"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" }
    ]
  };
}
