export function createOwnedStore(client) {
  async function identity(expectedOwner) {
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user) throw new Error("נדרשת התחברות מחדש לפני שמירה או טעינה");
    if (expectedOwner && data.user.id !== expectedOwner) throw new Error("החשבון השתנה. יש לרענן לפני המשך העבודה");
    return data.user.id;
  }

  async function load(key, initial) {
    const ownerId = await identity();
    const { data, error } = await client.from("company_state").select("data,updated_at")
      .eq("user_id", ownerId).eq("company_key", key).maybeSingle();
    if (error) throw new Error("לא ניתן לטעון את הנתונים מהענן. נסו שוב");
    return { ownerId, revision: data?.updated_at ?? null, value: data?.data ?? structuredClone(initial) };
  }

  async function save(key, value, snapshot) {
    const ownerId = await identity(snapshot.ownerId);
    const timestamp = Math.max(Date.now(), Date.parse(snapshot.revision || "1970-01-01") + 1);
    const row = { user_id: ownerId, company_key: key, data: value, updated_at: new Date(timestamp).toISOString() };
    let request;
    if (snapshot.revision === null) {
      request = client.from("company_state").insert(row);
    } else {
      request = client.from("company_state").update({ data: value, updated_at: row.updated_at })
        .eq("user_id", ownerId).eq("company_key", key).eq("updated_at", snapshot.revision);
    }
    const { data, error } = await request.select("data,updated_at").maybeSingle();
    if (error || !data) throw new Error("השמירה לא אושרה: ייתכן שינוי בחלון אחר או תקלה ברשת. הטופס נשמר פתוח; העתיקו אותו לפני רענון");
    return { ownerId, revision: data.updated_at, value: data.data };
  }
  return { load, save };
}
