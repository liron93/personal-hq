"use client";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { INK, BG, GREEN, AMBER, RUST, MUTED, LINE, cardStyle } from "@/lib/theme";
import { ils } from "@/lib/format";
import { Sec, Row } from "@/lib/ui";
import { ASSET_KEYS, snapshotNow } from "./model";

// שלושה צבעים מ-lib/theme + שלושה גוונים תואמים לאפיקים שאין להם צבע קבוע
const AREA_COLORS = {
  cash: GREEN,
  stocks: AMBER,
  funds: RUST,
  crypto: "#C8A15A",
  pension: "#4F6D70",
  kerenHishtalmut: "#7E6B8F",
};

const LABEL = Object.fromEntries(ASSET_KEYS.map(({ k, l }) => [k, l]));
const mLabel = m => { const [y, mo] = m.split("-"); return `${mo}/${y.slice(2)}`; };

export default function History({ d, setD }) {
  const hist = (d.history || []).slice().sort((a, b) => (a.month < b.month ? -1 : 1));
  const save = () => setD(prev => snapshotNow(prev));

  const btn = (
    <button onClick={save} style={{ width: "100%", border: "none", background: INK, color: BG, borderRadius: 2, padding: "10px 0", cursor: "pointer", fontFamily: "inherit", fontSize: 14, marginBottom: 16 }}>
      שמור תמונת מצב עכשיו
    </button>
  );

  if (hist.length < 2) {
    return (
      <div>
        {btn}
        <div style={{ ...cardStyle, padding: 16, color: MUTED, fontSize: 14, lineHeight: 1.7 }}>
          עוד אין מספיק היסטוריה להציג מגמה — נחזור לכאן בעוד חודש.
        </div>
      </div>
    );
  }

  const chartRows = hist.map(h => ({ month: mLabel(h.month), ...h.assets }));
  const listRows = hist.map((h, i) => ({ month: h.month, total: h.total, delta: i > 0 ? h.total - hist[i - 1].total : null }));

  return (
    <div>
      {btn}

      <Sec title="שווי נקי לאורך הזמן" />
      {/* recharts מסתדר LTR — עוטפים כדי שלא יתהפך בתוך העמוד ה-RTL */}
      <div style={{ ...cardStyle, padding: "14px 8px 6px", direction: "ltr" }}>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={chartRows} margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
            <CartesianGrid stroke={LINE} vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: MUTED }} tickLine={false} axisLine={{ stroke: LINE }} />
            <YAxis tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={false} width={56}
              tickFormatter={v => (v === 0 ? "₪0" : "₪" + Math.round(v / 1000) + "k")} />
            <Tooltip
              formatter={(value, name) => [ils(value), LABEL[name] || name]}
              labelStyle={{ color: INK }} contentStyle={{ fontSize: 12, borderRadius: 4, border: `1px solid ${LINE}`, direction: "rtl" }} />
            <Legend formatter={name => LABEL[name] || name} wrapperStyle={{ fontSize: 12, direction: "rtl" }} />
            {ASSET_KEYS.map(({ k }) => (
              <Area key={k} type="monotone" dataKey={k} stackId="nw"
                stroke={AREA_COLORS[k]} fill={AREA_COLORS[k]} fillOpacity={0.75} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <Sec title="לפי חודש" />
      <div style={cardStyle}>
        {listRows.map((r, i) => (
          <Row key={r.month} label={mLabel(r.month)} last={i === listRows.length - 1}>
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 14 }}>{ils(r.total)}</span>
              {r.delta != null && (
                <span style={{ fontSize: 12, color: r.delta >= 0 ? GREEN : RUST }}>
                  {r.delta >= 0 ? "▲" : "▼"} {ils(Math.abs(r.delta))}
                </span>
              )}
            </span>
          </Row>
        ))}
      </div>
    </div>
  );
}
