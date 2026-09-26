import AccessGate from "../AccessGate";
import Company from "@/companies/nefesh/Company";

export default function Page() {
  return <AccessGate slug="nefesh"><Company /></AccessGate>;
}
