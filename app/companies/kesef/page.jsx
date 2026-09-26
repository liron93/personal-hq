import AccessGate from "../AccessGate";
import CompanyShell from "../CompanyShell";
import Company from "@/companies/kesef/Company";

export default function Page() {
  return <AccessGate slug="kesef"><CompanyShell title="כלכלה והשקעות" fullWidth><Company /></CompanyShell></AccessGate>;
}
