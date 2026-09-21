import CompanyShell from "../CompanyShell";
import AccessGate from "../AccessGate";

// שלד — תת-חברה שעוד לא הוקמה. כשמתחילים: תיקייה companies/imun/ עם model.js + Company.jsx, ועדכון ב-companies/registry.js
export default function Page() {
  return (
    <AccessGate slug="imun">
    <CompanyShell title="אימון ותזונה">
      <p style={{ opacity: 0.6, lineHeight: 1.7 }}>תת-החברה הזו עוד לא הוקמה. היא תיפתח כשנגיע אליה בסדר העדיפויות.</p>
    </CompanyShell>
    </AccessGate>
  );
}
