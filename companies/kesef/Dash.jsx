"use client";
import { GREEN, RUST, MUTED, cardStyle } from "@/lib/theme";
import { ils } from "@/lib/format";
import { Sec, Row, Metric } from "@/lib/ui";
import { ASSET_KEYS, bEff, assetsTotal } from "./model";

export default function Dash({ d, core }) {
  const netWorth = assetsTotal(d.assets);
  const income = (core.mySalary || 0) + (core.wifeSalary || 0);
  const budgetTotal = d.budget.reduce((s, b) => s + bEff(b), 0);
  const mortgage = core.frozen ? 0 : (core.mortgageMonthly || 0);
  const left = income - budgetTotal - mortgage;

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <Metric label="שווי נקי" value={ils(netWorth)} color={GREEN} />
        <Metric label="נשאר לחיסכון/השקעה החודש" value={ils(left)} color={left >= 0 ? GREEN : RUST} />
      </div>

      <Sec title="שווי נקי — פירוט לפי אפיק" />
      <div style={cardStyle}>
        <Row label="סך הכל" bold><span style={{ fontSize: 17, color: GREEN }}>{ils(netWorth)}</span></Row>
        {ASSET_KEYS.map(({ k, l }, i) => {
          const v = d.assets[k] || 0;
          const pct = netWorth > 0 ? Math.round((v / netWorth) * 100) : 0;
          return (
            <Row key={k} label={l} last={i === ASSET_KEYS.length - 1}>
              <span style={{ fontSize: 13 }}>{ils(v)}<span style={{ color: MUTED, fontSize: 12 }}> · {pct}%</span></span>
            </Row>
          );
        })}
      </div>

      <Sec title="תזרים חודשי" />
      <div style={cardStyle}>
        <Row label="הכנסה (שלי + אשתי)"><span style={{ fontSize: 14, color: GREEN }}>{ils(income)}</span></Row>
        <Row label="תקציב חודשי — סך הקטגוריות"><span style={{ fontSize: 14, color: RUST }}>−{ils(budgetTotal)}</span></Row>
        <Row label={core.frozen ? "החזר משכנתא קיימת (מוקפאת)" : "החזר משכנתא קיימת"}>
          <span style={{ fontSize: 14, color: RUST }}>−{ils(mortgage)}</span>
        </Row>
        <Row last label="נשאר לחיסכון/השקעה החודש" bold>
          <span style={{ fontSize: 17, color: left >= 0 ? GREEN : RUST }}>{ils(left)}</span>
        </Row>
      </div>
    </div>
  );
}
