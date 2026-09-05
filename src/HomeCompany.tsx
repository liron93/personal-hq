import { useEffect, useMemo, useState } from 'react'
import { Check, ClipboardList, Landmark, PackageCheck, Plus, Sofa, Truck, Wrench } from 'lucide-react'

type Workstream = 'שיפוץ והכנה' | 'רכישות וריהוט' | 'ספקים וחיבורים' | 'יום המעבר'
type Item = { id: number; title: string; owner: string; due: string; stream: Workstream; done: boolean }
const initialItems: Item[] = [
  { id: 1, title: 'לסגור תכנית עבודה סופית לשיפוץ', owner: 'אתם', due: 'לקבוע', stream: 'שיפוץ והכנה', done: false },
  { id: 2, title: 'לוודא מועד התקנת מיזוג', owner: 'ספק', due: 'לקבוע', stream: 'שיפוץ והכנה', done: false },
  { id: 3, title: 'רשימת פריטים הכרחיים ליום הראשון', owner: 'אתם', due: 'לקבוע', stream: 'רכישות וריהוט', done: false },
  { id: 4, title: 'תיאום אינטרנט, חשמל, מים וגז', owner: 'אתם', due: 'לקבוע', stream: 'ספקים וחיבורים', done: false },
  { id: 5, title: 'בחירת מוביל ותיאום אריזה', owner: 'אתם', due: 'לקבוע', stream: 'יום המעבר', done: false },
]
const icons = { 'שיפוץ והכנה': Wrench, 'רכישות וריהוט': Sofa, 'ספקים וחיבורים': Landmark, 'יום המעבר': Truck }

export function HomeCompany() {
  const [items, setItems] = useState<Item[]>(() => JSON.parse(localStorage.getItem('personal-hq-home-items') || 'null') || initialItems)
  const [newTask, setNewTask] = useState('')
  const [decision, setDecision] = useState(() => localStorage.getItem('personal-hq-home-decision') || '')
  useEffect(() => localStorage.setItem('personal-hq-home-items', JSON.stringify(items)), [items])
  useEffect(() => localStorage.setItem('personal-hq-home-decision', decision), [decision])
  const open = items.filter((item) => !item.done)
  const progress = useMemo(() => Math.round(((items.length - open.length) / items.length) * 100), [items.length, open.length])
  const toggle = (id: number) => setItems((list) => list.map((item) => item.id === id ? { ...item, done: !item.done } : item))
  const add = () => { if (!newTask.trim()) return; setItems((list) => [...list, { id: Date.now(), title: newTask.trim(), owner: 'לא הוגדר', due: 'לקבוע', stream: 'שיפוץ והכנה', done: false }]); setNewTask('') }
  return <section className="home-company"><div className="home-header"><div><p className="eyebrow">חברת הבית החדש · מצב הקמה</p><h2>חדר הבקרה למעבר</h2><p>כל מה שחייב לקרות כדי להיכנס לבית מוכן — בלי ניהול בראש.</p></div><div className="home-progress"><strong>{progress}%</strong><span>הושלם</span></div></div><section className="home-principles"><div><PackageCheck size={19} /><span><strong>מטרת העל</strong> בית שאפשר לישון בו ביום המעבר.</span></div><div><ClipboardList size={19} /><span><strong>כלל החלטה</strong> מה שלא הכרחי לכניסה — יכול לחכות.</span></div></section><section className="home-board">{(Object.keys(icons) as Workstream[]).map((stream) => { const Icon = icons[stream]; const streamItems = items.filter((item) => item.stream === stream); return <article className="home-stream" key={stream}><div className="stream-title"><span><Icon size={18} /></span><h3>{stream}</h3><small>{streamItems.filter((item) => !item.done).length} פתוחות</small></div>{streamItems.map((item) => <button className={`home-task ${item.done ? 'done' : ''}`} onClick={() => toggle(item.id)} key={item.id}><span className="task-check">{item.done && <Check size={14} />}</span><span><strong>{item.title}</strong><small>{item.owner} · {item.due}</small></span></button>)}</article>})}</section><section className="home-bottom"><div className="decision-box"><p className="eyebrow">ההחלטה הבאה</p><textarea value={decision} onChange={(event) => setDecision(event.target.value)} placeholder="איזו החלטה, אם תתקבל היום, תוריד הכי הרבה סיכון מהמעבר?" /></div><div className="task-adder"><p className="eyebrow">להכניס משימה לחדר הבקרה</p><div><input value={newTask} onChange={(event) => setNewTask(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && add()} placeholder="למשל: לבקש הצעת מחיר לנגרות" /><button onClick={add} aria-label="הוספת משימה"><Plus size={19} /></button></div><small>{open.length} משימות פתוחות כרגע</small></div></section></section>
}
