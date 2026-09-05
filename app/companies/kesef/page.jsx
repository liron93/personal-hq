import CompanyShell from "../CompanyShell";

// שלד — תת-חברה שעוד לא הוקמה. כשמתחילים: תיקייה companies/kesef/ עם model.js + Company.jsx, ועדכון ב-companies/registry.js
export default function Page() {
  return (
    <CompanyShell title="כלכלה והשקעות">
      <p style={{ opacity: 0.6, lineHeight: 1.7 }}>תת-החברה הזו עוד לא הוקמה. היא תיפתח כשנגיע אליה בסדר העדיפויות.</p>
    </CompanyShell>
  );
}
