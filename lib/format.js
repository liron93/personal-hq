export const ils = v => "₪" + Math.round(v || 0).toLocaleString("he-IL");
export const toN = s => parseFloat(String(s).replace(/[,₪\s]/g, "")) || 0;
export const uid = () => Math.random().toString(36).slice(2, 10);
export const daysUntil = d => Math.ceil((new Date(d) - new Date()) / 86400000);
export const MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
