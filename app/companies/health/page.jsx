import AccessGate from "../AccessGate";
import Company from "@/companies/health/Company";

export default function Page() {
  return <AccessGate slug="health"><Company /></AccessGate>;
}
