// נקודת הכניסה היחידה למידע חיצוני. היום היא קוראת את המידע הידני הקיים בלבד;
// מחר מחליפים את createFinanceAdapter במימוש API, בלי לשנות את ממשקי התצוגה.
import { bEff, budgetAlerts } from "./model";

export function createFinanceAdapter({ core, finance }) {
  const apiState = finance?.apiConnection?.status || "demo";
  const income = Number(core?.mySalary || 0) + Number(core?.wifeSalary || 0) + Number(core?.athensMonthly || 0);
  const budget = finance?.budget || [];
  const recurring = budget.reduce((sum, item) => sum + bEff(item), 0) + (core?.frozen ? 0 : Number(core?.mortgageMonthly || 0));
  const commitments = (finance?.commitments || []).filter(item => item.status !== "שולם");
  const upcoming = commitments.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const alerts = budgetAlerts(budget);
  return {
    mode: apiState === "connected" ? "connected" : "demo", // מקור ידני בלבד — לא חיבור לחשבון
    state: apiState === "error" ? "error" : apiState === "loading" ? "loading" : (income || budget.length || commitments.length ? "ready" : "empty"),
    refreshedAt: finance?.apiConnection?.refreshedAt || null,
    accounts: [], transactions: [], loans: [],
    income, recurring, upcoming, commitments, alerts,
    available: income - recurring - upcoming,
    budget: budget.map(item => ({ ...item, planned: Number(item.est || 0), actual: Number(item.act || 0) })),
  };
}

// חוזה API עתידי: { mode:"connected", refreshedAt, accounts:[{id,name,balance,currency}],
// transactions:[{id,date,amount,direction,category,status}], loans:[{id,balance,monthlyPayment}], ... }
