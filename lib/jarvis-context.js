// הקונטקסט שנשלח ל-JARVIS. fail-closed: רק חלקים של חברות שמותר למשתמש לראות. חלק של חברה מוסתרת לא נשלח בכלל
// (לא null ולא ערכי ברירת מחדל), כדי שגם ה-prompt של ה-API לא יקבל שום רמז לנתוני חברה שאינה שלו.
// טהור, בלי React ובלי רשת, כדי שאפשר לבדוק אותו.

/**
 * @param {{visible:Set<string>, greeting:string, openTasks:number, urgentActions:object[], income:number, core:object|null, coreDenied:boolean, summaries:object}} p
 */
export function buildJarvisContext({ visible, greeting, openTasks, urgentActions, income, core, coreDenied, summaries }) {
  if (!Object.keys(summaries || {}).length) return null;
  const s = slug => summaries[slug]?.summary;
  const d = slug => summaries[slug]?.data;
  const homeItems = (d("beit-hadash")?.items || [])
    .filter(item => item.beforeMove && item.status !== "הושלם")
    .map(item => ({ name: item.name, status: item.status, dueDate: item.dueDate || null, estimate: item.estimate || null }));
  const wellbeingToday = d("nefesh")?.today;
  const openDecisions = (d("nefesh")?.decisions || []).filter(item => item?.status === "open").map(item => item.title || item.text).filter(Boolean);
  const home = s("beit-hadash")?.renovation, finance = s("kesef"), career = s("avoda"), health = s("health");
  return {
    greeting, openTasks, urgentActions,
    ...(!coreDenied ? { money: { income, mortgageMonthly: core?.mortgageMonthly ?? null } } : {}),
    ...(visible.has("beit-hadash") ? { home: { items: homeItems, paid: home?.paid ?? null, planned: home?.planned ?? null } } : {}),
    ...(visible.has("kesef") ? { finance: { netWorth: finance?.netWorth ?? null, overBudget: finance?.overBudget ?? null } } : {}),
    ...(visible.has("avoda") ? { career: { activeJobs: career?.activeJobs ?? null, nextStep: career?.nextStep ?? null } } : {}),
    ...(visible.has("health") ? { health: { weekWorkouts: health?.weekWorkouts ?? null, weekMeals: health?.weekMeals ?? null, goal: health?.profile?.goal ?? null } } : {}),
    ...(visible.has("nefesh") ? { wellbeing: { load: wellbeingToday?.load || null, status: wellbeingToday?.status || null, openDecisions } } : {}),
  };
}
