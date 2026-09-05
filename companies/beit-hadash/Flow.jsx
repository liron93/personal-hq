"use client";
import { useState } from "react";
import { GREEN, RUST, MUTED, cardStyle, tabBtn } from "@/lib/theme";
import { ils, MONTHS } from "@/lib/format";

export default function Flow({ d }) {
  const { cfg } = d;
  const [scen, setScen] = useState("curr");
  const rows = []; let cum = 0;
  const [sY, sM1] = (cfg.flowStart || "2025-06").split("-").map(Number);
  const [eY, eM1] = (cfg.flowEnd || "2027-12").split("-").map(Number);
  for (let y = sY; y <= eY; y++) {
    const mStart = y === sY ? sM1 - 1 : 0, mEnd = y === eY ? eM1 - 1 : 11;
    for (let m = mStart; m <= mEnd; m++) {
      const key = `${y}-${String(m + 1).padStart(2, "0")}`;
      const sold = key > cfg.saleMonth;
      const raise = scen === "future" && key >= cfg.raiseMonth;
      const inc = (raise ? cfg.myRaise : cfg.mySalary) + cfg.wifeSalary + (key >= cfg.athensMonth ? cfg.athensMonthly : 0);
      const oldM = sold ? 0 : (cfg.frozen ? 0 : cfg.mortgageMonthly);
      const out = oldM + cfg.newMortgageMonthly + cfg.living;
      const net = inc - out; cum += net;
      rows.push({ key, label: `${MONTHS[m]} ${y}`, inc, out, net, cum, isSale: key === cfg.saleMonth });
    }
  }
  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <button onClick={() => setScen("curr")} style={tabBtn(scen === "curr")}>שכר נוכחי</button>
        <button onClick={() => setScen("future")} style={tabBtn(scen === "future")}>שכר עתידי</button>
      </div>
      {rows.map(r => (
        <div key={r.key} style={{ ...cardStyle, marginBottom: 8, borderRight: r.isSale ? `3px solid ${GREEN}` : cardStyle.border }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 4px" }}>
            <span style={{ fontSize: 14 }}>{r.label}{r.isSale ? " · חודש המכירה" : ""}</span>
            <span style={{ fontSize: 15, color: r.net >= 0 ? GREEN : RUST }}>{r.net >= 0 ? "+" : ""}{ils(r.net)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: MUTED, paddingBottom: 8 }}>
            <span>נכנס: {ils(r.inc)}</span>
            <span>יוצא: {ils(r.out)}</span>
            <span style={{ color: r.cum >= 0 ? GREEN : RUST }}>מצטבר: {r.cum >= 0 ? "+" : ""}{ils(r.cum)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
