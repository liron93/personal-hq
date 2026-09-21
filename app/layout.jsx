import "./globals.css";
import AuthGate from "./AuthGate";
import CompanyNavigator from "./CompanyNavigator";
import PwaInstaller from "./PwaInstaller";

export const metadata = {
  title: "המנכ״ל — Personal HQ",
  description: "ניהול החיים כחברת אחזקות",
  applicationName: "Personal HQ",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "המנכ״ל"
  },
  formatDetection: { telephone: false },
  icons: {
    icon: "/icon.svg",
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }]
  }
};

export const viewport = {
  themeColor: "#0b1a2d",
  colorScheme: "dark"
};

export default function RootLayout({ children }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Hebrew:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <AuthGate>
          {children}
          <CompanyNavigator />
        </AuthGate>
        <PwaInstaller />
      </body>
    </html>
  );
}
