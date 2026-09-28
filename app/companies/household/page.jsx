import AccessGate from "../AccessGate";
import CompanyShell from "../CompanyShell";
import Company from "@/companies/household/Company";

export default function Page() {
  return <AccessGate slug="household"><CompanyShell title="משק בית" fullWidth><Company /></CompanyShell></AccessGate>;
}
