"use client";
import { useState } from "react";
import { Plus, Check, X } from "lucide-react";
import { INK, GREEN, MUTED, LINE, cardStyle, inputStyle, primaryBtn } from "@/lib/theme";
import { uid } from "@/lib/format";
import { Sec } from "@/lib/ui";

/*
  רכיב משותף לכל תת-חברה: רשימת משימות + עדכון למנכ"ל.
  מקבל d, setD ומצפה ל-d.tasks ([{id,text,done}]) ו-d.updates ([{id,date,text}]) —
  אותו מבנה בכל model.js. אין כאן שום דבר ספציפי לתת-חברה מסוימת.
*/
export default function CompanyTasks({ d, setD }) {
  const [newTask, setNewTask] = useState("");
  const [newUpdate, setNewUpdate] = useState("");
  const addTask = () => { if (!newTask.trim()) return; setD(p => ({ ...p, tasks: [...p.tasks, { id: uid(), text: newTask.trim(), done: false }] })); setNewTask(""); };
  const toggleTask = id => setD(p => ({ ...p, tasks: p.tasks.map(t => t.id === id ? { ...t, done: !t.done } : t) }));
  const removeTask = id => setD(p => ({ ...p, tasks: p.tasks.filter(t => t.id !== id) }));
  const addUpdate = () => { if (!newUpdate.trim()) return; setD(p => ({ ...p, updates: [{ id: uid(), date: new Date().toISOString(), text: newUpdate.trim() }, ...p.updates] })); setNewUpdate(""); };

  return (
    <div>
      <Sec title="עדכון למנכ״ל" />
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input className="hq-field" value={newUpdate} onChange={e => setNewUpdate(e.target.value)} onKeyDown={e => e.key === "Enter" && addUpdate()} placeholder="מה חדש היום?" style={{ ...inputStyle, flex: 1 }} />
        <button onClick={addUpdate} style={primaryBtn}><Plus size={16} /></button>
      </div>
      <div style={{ display: "grid", gap: 8, marginBottom: 24 }}>
        {d.updates.map(u => <div key={u.id} style={{ fontSize: 14 }}><span style={{ color: MUTED, fontSize: 12 }}>{new Date(u.date).toLocaleDateString("he-IL")} — </span>{u.text}</div>)}
      </div>

      <Sec title="משימות" />
      <div style={cardStyle}>
        {d.tasks.map((t, i) => (
          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: i === d.tasks.length - 1 ? "none" : `1px solid ${LINE}` }}>
            <button onClick={() => toggleTask(t.id)} style={{ border: `1px solid ${t.done ? GREEN : MUTED}`, background: t.done ? GREEN : "transparent", borderRadius: "50%", width: 20, height: 20, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {t.done && <Check size={12} color="#fff" />}
            </button>
            <span style={{ flex: 1, fontSize: 15, textDecoration: t.done ? "line-through" : "none", color: t.done ? MUTED : INK }}>{t.text}</span>
            <button onClick={() => removeTask(t.id)} style={{ border: "none", background: "none", cursor: "pointer", color: MUTED }}><X size={14} /></button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input className="hq-field" value={newTask} onChange={e => setNewTask(e.target.value)} onKeyDown={e => e.key === "Enter" && addTask()} placeholder="משימה חדשה..." style={{ ...inputStyle, flex: 1 }} />
        <button onClick={addTask} style={primaryBtn}><Plus size={16} /></button>
      </div>
    </div>
  );
}
