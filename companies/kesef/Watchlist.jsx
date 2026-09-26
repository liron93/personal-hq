"use client";
import { useState } from "react";
import { RefreshCw, Plus, ChevronDown } from "lucide-react";
import { INK, BG, GREEN, RUST, MUTED, LINE, cardStyle, inputStyle, primaryBtn } from "@/lib/theme";
import { ils } from "@/lib/format";
import { Sec, Row, EditableNum } from "@/lib/ui";
import { apiFetch, apiErrorMessage } from "@/lib/api-client.mjs";
import { newWatchItem, positionStatus } from "./model";

const usd = v => (v == null ? "—" : "$" + Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const pctNum = v => (v == null ? "—" : (Math.round(v * 100) / 100).toLocaleString("he-IL") + "%");
const fmtTime = t => (t ? new Date(t).toLocaleString("he-IL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }) : "טרם עודכן");

async function fetchQuote(symbol) {
  const res = await apiFetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(apiErrorMessage(res.status, json.error, "שגיאה בשליפת נתונים משירות המידע."));
  return json; // { price, sector, peRatio, dividendYield, fetchedAt }
}

function Pill({ color, children }) {
  return <span style={{ fontSize: 11, color: BG, background: color, borderRadius: 2, padding: "2px 9px", whiteSpace: "nowrap" }}>{children}</span>;
}

function RuleFields({ item, group, fields, patchRule }) {
  return (
    <div>
      {fields.map(([key, label]) => (
        <Row key={key} label={label}>
          <EditableNum value={item[group][key] ?? ""} onChange={v => patchRule(item.id, group, key, v)} />
        </Row>
      ))}
    </div>
  );
}

export default function Watchlist({ d, setD, totalNetWorth }) {
  const list = d.watchlist || [];
  const usdIls = d.usdIls || 1;

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ symbol: "", name: "" });
  const [addErr, setAddErr] = useState(null);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [busy, setBusy] = useState({});
  const [rowErr, setRowErr] = useState({});
  const [refreshingAll, setRefreshingAll] = useState(false);

  const patchItem = (id, patch) => setD(p => ({ ...p, watchlist: p.watchlist.map(w => (w.id === id ? { ...w, ...patch } : w)) }));
  const patchRule = (id, group, key, val) =>
    setD(p => ({ ...p, watchlist: p.watchlist.map(w => (w.id === id ? { ...w, [group]: { ...w[group], [key]: val } } : w)) }));
  const removeItem = id => { setD(p => ({ ...p, watchlist: p.watchlist.filter(w => w.id !== id) })); setOpenId(null); };

  const applyQuote = (id, q) => patchItem(id, {
    currentPrice: q.price, sector: q.sector, peRatio: q.peRatio, dividendYield: q.dividendYield, lastFetched: q.fetchedAt,
  });

  async function refreshOne(item) {
    setBusy(b => ({ ...b, [item.id]: true }));
    setRowErr(e => ({ ...e, [item.id]: null }));
    try {
      applyQuote(item.id, await fetchQuote(item.symbol));
    } catch (e) {
      setRowErr(er => ({ ...er, [item.id]: e.message }));
    } finally {
      setBusy(b => ({ ...b, [item.id]: false }));
    }
  }

  async function refreshAll() {
    setRefreshingAll(true);
    for (const item of list) {
      // ברצף — לא להעמיס על מכסת הקריאות של Finnhub
      // eslint-disable-next-line no-await-in-loop
      await refreshOne(item);
    }
    setRefreshingAll(false);
  }

  async function addItem() {
    const symbol = form.symbol.trim().toUpperCase();
    const name = form.name.trim();
    if (!symbol || !name) { setAddErr("צריך סימבול ושם."); return; }
    setAdding(true);
    setAddErr(null);
    try {
      const q = await fetchQuote(symbol);
      setD(p => ({ ...p, watchlist: [...p.watchlist, newWatchItem(symbol, name, q)] }));
      setForm({ symbol: "", name: "" });
      setShowAdd(false);
    } catch (e) {
      setAddErr(e.message);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: MUTED }}>
          שער USD→₪
          <EditableNum value={usdIls} onChange={v => setD(p => ({ ...p, usdIls: v || 1 }))} />
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={refreshAll} disabled={refreshingAll || !list.length} style={{ ...primaryBtn, opacity: refreshingAll || !list.length ? 0.5 : 1, gap: 6, padding: "0 12px", height: 34 }}>
          <RefreshCw size={14} /> {refreshingAll ? "מרענן..." : "רענן הכל"}
        </button>
        <button onClick={() => { setShowAdd(s => !s); setAddErr(null); }} style={{ ...primaryBtn, gap: 6, padding: "0 12px", height: 34 }}>
          <Plus size={14} /> הוסף מניה
        </button>
      </div>

      {showAdd && (
        <div style={{ ...cardStyle, padding: 14 }}>
          <div style={{ display: "grid", gap: 8 }}>
            <input className="hq-field" placeholder="סימבול (למשל AAPL)" dir="ltr" value={form.symbol}
              onChange={e => setForm(f => ({ ...f, symbol: e.target.value }))} style={{ ...inputStyle, textAlign: "left" }} />
            <input className="hq-field" placeholder="שם המניה" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={addItem} disabled={adding} style={{ flex: 1, border: "none", background: INK, color: BG, borderRadius: 2, padding: "8px 0", cursor: "pointer", fontFamily: "inherit", opacity: adding ? 0.6 : 1 }}>
                {adding ? "מושך נתונים..." : "הוסף"}
              </button>
              <button onClick={() => setShowAdd(false)} style={{ flex: 1, border: `1px solid ${LINE}`, background: "transparent", borderRadius: 2, padding: "8px 0", cursor: "pointer", fontFamily: "inherit" }}>ביטול</button>
            </div>
            {addErr && <div style={{ fontSize: 12, color: RUST }}>{addErr}</div>}
          </div>
        </div>
      )}

      {!list.length && !showAdd && (
        <div style={{ ...cardStyle, padding: 16, fontSize: 14, color: MUTED, lineHeight: 1.7 }}>
          עדיין אין מניות ברשימת המעקב. הוסף אחת עם סימבול ושם — שאר הנתונים יימשכו אוטומטית.
        </div>
      )}

      {list.map(item => {
        const st = positionStatus(item, totalNetWorth, usdIls);
        const open = openId === item.id;
        return (
          <div key={item.id} style={{ ...cardStyle, padding: "10px 16px" }}>
            <div onClick={() => setOpenId(open ? null : item.id)} style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15 }}>
                  <span dir="ltr" style={{ fontWeight: 600 }}>{item.symbol}</span>
                  <span style={{ color: MUTED, marginRight: 8 }}>{item.name}</span>
                </div>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
                  {usd(item.currentPrice)} · עודכן {fmtTime(item.lastFetched)}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                {st.inEntryZone && <Pill color={GREEN}>במחיר מתחת לסף הכניסה שלך</Pill>}
                {st.inExitZone && <Pill color={RUST}>עבר את סף היציאה שלך</Pill>}
                {!st.inEntryZone && !st.inExitZone && <span style={{ fontSize: 11, color: MUTED }}>אין התראה פעילה</span>}
                <ChevronDown size={14} color={MUTED} style={{ transform: open ? "rotate(180deg)" : "none" }} />
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 14px", fontSize: 12, color: MUTED, marginTop: 6 }}>
              <span>P/E: {item.peRatio == null ? "—" : (Math.round(item.peRatio * 10) / 10).toLocaleString("he-IL")}</span>
              <span>דיבידנד: {pctNum(item.dividendYield)}</span>
              <span>סקטור: {item.sector || "—"}</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 14px", fontSize: 12, marginTop: 4 }}>
              <span>יחידות: {item.unitsHeld || 0}</span>
              <span>שווי אחזקה: {ils(st.positionValue)}</span>
              <span style={{ color: INK }}>{pctNum(st.positionPercent)} מהתיק</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
              <button onClick={() => refreshOne(item)} disabled={!!busy[item.id]} style={{ fontSize: 12, border: `1px solid ${LINE}`, background: "transparent", borderRadius: 2, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5, color: MUTED }}>
                <RefreshCw size={12} /> {busy[item.id] ? "מרענן..." : "רענן מחיר"}
              </button>
              {rowErr[item.id] && <span style={{ fontSize: 11, color: RUST }}>{rowErr[item.id]}</span>}
            </div>

            {open && (
              <div style={{ marginTop: 12, borderTop: `1px solid ${LINE}`, paddingTop: 10, display: "grid", gap: 10 }}>
                <Row label="יחידות שברשותי">
                  <EditableNum value={item.unitsHeld || 0} onChange={v => patchItem(item.id, { unitsHeld: v })} />
                </Row>

                <div>
                  <div style={{ fontSize: 12, color: MUTED, marginBottom: 4 }}>למה המניה הזו (תזה אישית)</div>
                  <textarea defaultValue={item.thesis} key={item.id} onBlur={e => patchItem(item.id, { thesis: e.target.value })}
                    rows={4} style={{ width: "100%", border: `1px solid ${LINE}`, borderRadius: 2, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", direction: "rtl", resize: "vertical" }} />
                </div>

                <Sec title="כללי כניסה שלי" />
                <div style={{ ...cardStyle, marginBottom: 0, padding: "0 12px" }}>
                  <RuleFields item={item} group="entry" patchRule={patchRule}
                    fields={[["priceBelow", "מחיר מתחת ל- ($)"], ["portfolioPercentBelow", "אחוז מהתיק מתחת ל- (%)"]]} />
                </div>

                <Sec title="כללי יציאה שלי" />
                <div style={{ ...cardStyle, marginBottom: 0, padding: "0 12px" }}>
                  <RuleFields item={item} group="exit" patchRule={patchRule}
                    fields={[["priceAbove", "מחיר מעל ל- ($)"], ["portfolioPercentAbove", "אחוז מהתיק מעל ל- (%)"]]} />
                </div>

                <button onClick={() => removeItem(item.id)} style={{ fontSize: 12, color: RUST, background: "none", border: "none", cursor: "pointer", textAlign: "right", padding: 0, fontFamily: "inherit" }}>
                  הסר מרשימת המעקב
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
