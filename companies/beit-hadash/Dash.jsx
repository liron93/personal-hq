"use client";
import { Check, Plus } from "lucide-react";
import { GREEN, RUST, AMBER, MUTED, LINE, cardStyle, primaryBtn } from "@/lib/theme";
import { ils, daysUntil, uid } from "@/lib/format";
import { Sec, Row, Metric, EditableNum } from "@/lib/ui";
import { effP, iPaid, salePayments } from "./model";

function PaymentRow({ label, amount, due, done, onAmount, onDue, onToggle }) {
  const d = daysUntil(due);
  const urgent = !done && d <= 14;
  return (
    <Row label={label}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input type="date" className="hq-field" value={due ? due.slice(0, 10) : ""} onChange={e => onDue(e.target.value)}
          style={{ fontSize: 12, background: "transparent", color: MUTED, width: 110 }} />
        <EditableNum value={amount} onChange={onAmount} />
        <button data-hq-edit="1" onClick={onToggle} style={{ width: 22, height: 22, borderRadius: "50%", border: `1px solid ${done ? GREEN : (urgent ? RUST : MUTED)}`, background: done ? GREEN : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {done && <Check size={13} color="#fff" />}
        </button>
      </div>
    </Row>
  );
}

// פעימה שהקונה של הדירה הנוכחית משלם לנו — תיאור חופשי, תאריך, סכום, וי כשהתקבלה
function SalePayRow({ p, onChange, onRemove }) {
  const d = p.due ? daysUntil(p.due) : null;
  const urgent = !p.done && d !== null && d <= 14;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${LINE}`, gap: 8 }}>
      <input className="hq-field" defaultValue={p.label} key={p.id + p.label} onBlur={e => onChange({ ...p, label: e.target.value })}
        placeholder="תיאור הפעימה" style={{ background: "transparent", fontFamily: "inherit", fontSize: 14, color: MUTED, flex: 1, minWidth: 0 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input type="date" className="hq-field" value={p.due ? p.due.slice(0, 10) : ""} onChange={e => onChange({ ...p, due: e.target.value })}
          style={{ fontSize: 12, background: "transparent", color: MUTED, width: 110 }} />
        <EditableNum value={p.amount} onChange={v => onChange({ ...p, amount: v })} />
        <button data-hq-edit="1" onClick={() => onChange({ ...p, done: !p.done })} style={{ width: 22, height: 22, borderRadius: "50%", border: `1px solid ${p.done ? GREEN : (urgent ? RUST : MUTED)}`, background: p.done ? GREEN : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {p.done && <Check size={13} color="#fff" />}
        </button>
        <span onClick={onRemove} style={{ fontSize: 12, color: RUST, cursor: "pointer", flexShrink: 0 }}>הסר</span>
      </div>
    </div>
  );
}

export default function Dash({ d, upd, core, coreUpd }) {
  const { cfg, sale, buy, mil } = d;
  const payments = salePayments(sale);
  const received = payments.filter(p => p.done).reduce((s, p) => s + (p.amount || 0), 0);
  const saleNet = sale.price - sale.agentFee - sale.lawyerFee - sale.penalty - cfg.mortgageBal;
  const gap = buy.p2 - buy.mortgage - received;
  const net = core.mySalary + core.wifeSalary - ((core.frozen ? 0 : core.mortgageMonthly) + cfg.newMortgageMonthly + cfg.living);
  const expTotal = d.exp.reduce((s, e) => s + effP(e), 0);
  const expPaid = d.exp.reduce((s, e) => s + iPaid(e), 0);
  const renoBgt = d.reno.reduce((s, r) => s + effP(r), 0);
  const renoPaid = d.reno.reduce((s, r) => s + iPaid(r), 0);

  return (
    <div>
      {cfg.mortgageBal === 0 && (
        <div style={{ background: "rgba(201,138,27,.12)", color: AMBER, borderRadius: 2, padding: "8px 12px", marginBottom: 14, fontSize: 13 }}>
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
        <Row last label="פער לגישור" bold><span style={{ fontSize: 15, color: gap > 0 ? RUST : GREEN }}>{gap > 0 ? ils(gap) : "מכוסה"}</span></Row>
      </div>

      <Sec title="פעימות מהקונה" />
      <div style={cardStyle}>
        {payments.map(p => (
          <SalePayRow key={p.id} p={p}
            onChange={np => upd("sale.payments", payments.map(x => x.id === p.id ? np : x))}
            onRemove={() => upd("sale.payments", payments.filter(x => x.id !== p.id))} />
        ))}
        <div style={{ padding: "10px 0 2px" }}>
          <button
            onClick={() => upd("sale.payments", [...payments, { id: uid(), label: "פעימה חדשה", amount: 0, due: "", done: false }])}
            style={{ ...primaryBtn, fontSize: 13, height: 32, gap: 6 }}
          >
            <Plus size={14} /> הוסף פעימה
          </button>
        </div>
        <Row last label="סה״כ התקבל מהקונה" bold><span style={{ fontSize: 15, color: GREEN }}>{ils(received)}</span></Row>
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
        <Metric label="שיפוץ נשאר" value={ils(renoBgt - renoPaid)} color={AMBER} />
      </div>
    </div>
  );
}
