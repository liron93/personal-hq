import AccessGate from "../AccessGate";
import CompanyShell from "../CompanyShell";
import Company from "@/companies/avoda/Company";

export default function Page() {
  return (
    <AccessGate slug="avoda">
    <CompanyShell title="קריירה" fullWidth>
      <Company />
    </CompanyShell>
    </AccessGate>
  );
}
