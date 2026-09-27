import AccessGate from "../AccessGate";
import CompanyShell from "../CompanyShell";
import Company from "@/companies/beit-hadash/Company";

export default function Page() {
  return <AccessGate slug="beit-hadash"><CompanyShell title="בית חדש" fullWidth><Company /></CompanyShell></AccessGate>;
}
