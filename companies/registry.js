import { Home, Wallet, Dumbbell, Briefcase, Brain } from "lucide-react";
import * as beit from "./beit-hadash/model";
import * as kesef from "./kesef/model";
import * as health from "./health/model";

export const COMPANIES = [
  { slug: "beit-hadash", name: "בית חדש", icon: Home, active: true, storeKey: beit.STORE_KEY, init: beit.INIT, summarize: beit.summarize },
  { slug: "kesef", name: "כלכלה והשקעות", icon: Wallet, active: true, storeKey: kesef.STORE_KEY, init: kesef.INIT, summarize: kesef.summarize },
  { slug: "health", name: "אימון ותזונה", icon: Dumbbell, active: true, storeKey: health.STORE_KEY, init: health.INIT, summarize: health.summarize },
  { slug: "avoda", name: "חיפוש עבודה", icon: Briefcase, active: false },
  { slug: "nefesh", name: "רווחה נפשית", icon: Brain, active: false },
];
