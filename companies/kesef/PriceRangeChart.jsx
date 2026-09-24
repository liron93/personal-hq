"use client";

// גרף תיאורי בלבד: קו סגירה יומית לאורך הטווח שהתקבל מהספק. אין קווי מגמה,
// אין תחזית, אין סימון קנייה/מכירה — רק תיאור של מה שקרה. SVG פשוט, בלי ספריית
// גרפים, כדי לא להכביד את הטאב הזה (recharts כבר נטען בנפרד רק בטאב ההיסטוריה).
export default function PriceRangeChart({ bars }) {
  const points = Array.isArray(bars) ? bars.filter(b => Number.isFinite(b?.close)) : [];
  if (points.length < 2) {
    return <p role="status">אין מספיק נתוני מחיר להצגת גרף תיאורי.</p>;
  }
  const width = 600, height = 160, padX = 8, padY = 10;
  const closes = points.map(p => p.close);
  const min = Math.min(...closes), max = Math.max(...closes);
  const span = max - min || 1;
  const xStep = (width - padX * 2) / (points.length - 1);
  const y = c => height - padY - ((c - min) / span) * (height - padY * 2);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(padX + i * xStep).toFixed(1)},${y(p.close).toFixed(1)}`).join(' ');
  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label={`גרף תיאורי של מחיר הסגירה היומי, מ-${points[0].date} עד ${points.at(-1).date}`}>
        <path d={path} fill="none" stroke="#80e1de" strokeWidth="2" />
      </svg>
      <figcaption style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#abc0d2', gap: 8, flexWrap: 'wrap' }}>
        <span dir="ltr">{points[0].date} — {points.at(-1).date}</span>
        <span dir="ltr">שפל {min.toLocaleString('en-US')} · שיא {max.toLocaleString('en-US')}</span>
      </figcaption>
    </figure>
  );
}
