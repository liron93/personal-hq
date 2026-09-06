import "./globals.css";
import AuthGate from "./AuthGate";

export const metadata = { title: "המנכ״ל — personal-hq", description: "ניהול החיים כחברת אחזקות" };

export default function RootLayout({ children }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;700&family=Frank+Ruhl+Libre:wght@500;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
