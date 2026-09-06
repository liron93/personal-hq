"use client";
import { Check } from "lucide-react";
import { GREEN, RUST, GOLD, MUTED, cardStyle } from "@/lib/theme";
import { ils, daysUntil } from "@/lib/format";
import { Sec, Row, Metric, EditableNum } from "@/lib/ui";
import { effP, iPaid } from "./model";

function PaymentRow({ label, amount, due, done, onAmount, onDue, onToggle }) {
  const d = daysUntil(due);
  const urgent = !done && d <= 14;
  return (
    <Row label={label}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input type="date" value={due ? due.slice(0, 10) : ""} onChange={e => onDue(e.target.value)}
          style={{ fontSize: 12, border: "none", background: "transparent", color: MUTED, width: 110 }} />
        <EditableNum value={amount} onChange={onAmount} />
        <button onClick={onToggle} style={{ width: 22, height: 22, borderRadius: "50%", border: `1px solid ${done ? GREEN : (urgent ? RUST : MUTED)}`, background: done ? GREEN : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {done && <Check size={13} color="#fff" />}
        </button>
      </div>
    </Row>
  );
}

export default function Dash({ d, upd, core, coreUpd }) {
  const { cfg, sale, buy, mil } = d;
  const saleNet = sale.price - sale.agentFee - sale.lawyerFee - sale.penalty - cfg.mortgageBal;
  const gap = buy.p2 - buy.mortgage - (sale.depositDone ? sale.deposit : 0);
  const net = core.mySalary + core.wifeSalary - ((core.frozen ? 0 : core.mortgageMonthly) + cfg.newMortgageMonthly + cfg.living);
  const expTotal = d.exp.reduce((s, e) => s + effP(e), 0);
  const expPaid = d.exp.reduce((s, e) => s + iPaid(e), 0);
  const renoBgt = d.reno.reduce((s, r) => s + effP(r), 0);
  const renoPaid = d.reno.reduce((s, r) => s + iPaid(r), 0);

  return (
    <div>
      {cfg.mortgageBal === 0 && (
        <div style={{ background: "#F4E3D3", color: "#6B4A22", borderRadius: 4, padding: "8px 12px", marginBottom: 14, fontSize: 13 }}>
          יתרת המשכנתא הקיימת לא הוזנה — מלא אותה למטה כדי שהחישוב יהיה מדויק
        </div>
      )}

      <Sec title="נטו ממכירת הדירה" />
      <div style={cardStyle}>
        <Row label="מחיר מכירה"><EditableNum value={sale.price} onChange={v => upd("sale.price", v)} /></Row>
        <Row label="מתווך"><EditableNum value={sale.agentFee} onChange={v => upd("sale.agentFee", v)} /></Row>
        <Row label='עו"ד מוכר'><EditableNum value={sale.lawyerFee} onChange={v => upd("sale.lawyerFee", v)} /></Row>
        <Row label="קנס פירעון מוקדם"><EditableNum value={sale.penalty} onChange={v => upd("sale.penalty", v)} /></Row>
        <Row label="יתרת משכנתא קיימת"><EditableNum value={cfg.mortgageBal} onChange={v => upd("cfg.mortgageBal", v)} /></Row>
        <Row last label="נטו לכיס" bold><span style={{ fontSize: 17, color: saleNet > 0 ? GREEN : RUST }}>{ils(saleNet)}</span></Row>
      </div>

      <Sec title="תשלומים לקבלן ומשכנתא" />
      <div style={cardStyle}>
        <PaymentRow label="פעימה 2 לקבלן" amount={buy.p2} due={buy.p2Due} done={buy.p2Done}
          onAmount={v => upd("buy.p2", v)} onDue={v => upd("buy.p2Due", v)} onToggle={() => upd("buy.p2Done", !buy.p2Done)} />
        <PaymentRow label={buy.p3Label} amount={buy.p3} due={buy.p3Due} done={buy.p3Done}
          onAmount={v => upd("buy.p3", v)} onDue={v => upd("buy.p3Due", v)} onToggle={() => upd("buy.p3Done", !buy.p3Done)} />
        <Row label="סכום משכנתא חדשה"><EditableNum value={buy.mortgage} onChange={v => upd("buy.mortgage", v)} /></Row>
        <Row label="משכנתא חדשה מאושרת"><input type="checkbox" checked={!!buy.mortgageOk} onChange={e => upd("buy.mortgageOk", e.target.checked)} /></Row>
        <Row label={`מקדמת קונה התקבלה (${ils(sale.deposit)})`}><input type="checkbox" checked={!!sale.depositDone} onChange={e => upd("sale.depositDone", e.target.checked)} /></Row>
        <Row last label="פער לגישור" bold><span style={{ fontSize: 15, color: gap > 0 ? RUST : GREEN }}>{gap > 0 ? ils(gap) : "מכוסה"}</span></Row>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <Metric label="תזרים חודשי נטו" value={ils(net)} color={net >= 0 ? GREEN : RUST} sub={core.frozen ? "משכנתא מוקפאת" : "שתי משכנתאות"} />
        <Metric label="הוצאות חד״פ" value={ils(expPaid)} sub={`מתוך ${ils(expTotal)}`} />
      </div>

      <Sec title="הטבות מילואים" />
      <div style={cardStyle}>
        <Row label={`מענק (${ils(mil.grant)})`}><input type="checkbox" checked={!!mil.grantDone} onChange={e => upd("mil.grantDone", e.target.checked)} /></Row>
        <Row label={`הלוואה (${ils(mil.loan)}, ללא ריבית)`}><input type="checkbox" checked={!!mil.loanDone} onChange={e => upd("mil.loanDone", e.target.checked)} /></Row>
        <Row last label="הקפאת משכנתא"><input type="checkbox" checked={!!core.frozen} onChange={e => coreUpd("frozen", e.target.checked)} /></Row>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <Metric label="שיפוץ שולם" value={ils(renoPaid)} sub={`מתוך ${ils(renoBgt)}`} />
        <Metric label="שיפוץ נשאר" value={ils(renoBgt - renoPaid)} color={GOLD} />
      </div>
    </div>
  );
}
