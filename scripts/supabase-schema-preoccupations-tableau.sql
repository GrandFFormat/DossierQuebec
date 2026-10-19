-- « Ce qui vous préoccupe », 4e étape (Martin, 19 oct. 2026) : le tableau de Mon dossier suit les
-- approbations tout de suite. Cette fonction ne rend que des totaux (messages reçus, personnes par
-- sujet approuvé), jamais un message ni un compte. À exécuter une fois dans Supabase.
create or replace function public.preoccupations_tableau()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'recus', (select count(*) from public.preoccupations where statut <> 'spam'),
    'sujets', coalesce((
      select json_agg(t order by t.n desc, t.sujet)
      from (select sujet, count(distinct user_id)::int as n
            from public.preoccupations
            where statut = 'classe' and sujet is not null
            group by sujet) t), '[]'::json)
  );
$$;
grant execute on function public.preoccupations_tableau() to anon, authenticated;
