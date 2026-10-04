-- החזרה לאחור של 001_hevy_connection. מוחק את הטבלה ואת כל החיבורים השמורים בה.

begin;

drop policy if exists health_hevy_connection_select_own on public.health_hevy_connection;
drop table if exists public.health_hevy_connection;

commit;
