-- מבטל את ההעתקה של 020: מוחק רק את השורות במרחב המשותף. company_state (המקור) לא נגע ולא ישתנה.
delete from public.workspace_state where workspace_id = '<WORKSPACE_ID>'::uuid;
