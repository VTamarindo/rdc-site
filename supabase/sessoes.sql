-- Romance de Cavalaria · um aparelho por vez (Supabase)
-- Rode uma vez no Supabase: SQL Editor → New query → cole tudo → Run. (Aplicado no projeto do site em 10/11/2026.)
-- Uma linha por conta e jogo: qual aba (de qual navegador) está com o jogo aberto. Quem abre o jogo pede a vez
-- (sessao_pede); a aba que tinha a vez confere a cada poucos segundos (sessao_pulso), vê que perdeu, salva, sobe o save,
-- libera (sessao_libera, dizendo qual espaço estava aberto) e fecha. Só a própria conta lê e grava a sua linha (RLS).

create table if not exists public.sessoes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  game text not null check (game ~ '^[a-z0-9_-]{1,32}$'),
  aba text not null check (length(aba) <= 64),             -- id da aba que tem a vez
  navegador text not null check (length(navegador) <= 64), -- id do navegador (abas do mesmo navegador se acertam sozinhas)
  desde timestamptz not null default now(),
  visto_em timestamptz not null default now(),             -- último sinal de vida da aba que tem a vez
  liberado boolean not null default false,                 -- a aba anterior já salvou e fechou
  slot smallint,                                           -- o espaço que estava aberto lá (para abrir direto nele)
  primary key (user_id, game)
);

alter table public.sessoes enable row level security;
drop policy if exists "dono lê" on public.sessoes;
drop policy if exists "dono cria" on public.sessoes;
drop policy if exists "dono muda" on public.sessoes;
create policy "dono lê" on public.sessoes for select to authenticated using ((select auth.uid()) = user_id);
create policy "dono cria" on public.sessoes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "dono muda" on public.sessoes for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update on public.sessoes to authenticated;
revoke all on public.sessoes from anon;

-- pede a vez: grava esta aba como dona e devolve como estava antes (idade = segundos desde o último sinal da anterior)
create or replace function public.sessao_pede(p_game text, p_aba text, p_navegador text)
returns table (aba text, navegador text, liberado boolean, idade double precision)
language plpgsql security invoker set search_path = '' as $$
#variable_conflict use_column
declare v record;
begin
  select s.aba, s.navegador, s.liberado, extract(epoch from now() - s.visto_em) as idade into v
    from public.sessoes s where s.user_id = auth.uid() and s.game = p_game for update;
  insert into public.sessoes as s (user_id, game, aba, navegador, desde, visto_em, liberado, slot)
    values (auth.uid(), p_game, p_aba, p_navegador, now(), now(), false, null)
    on conflict (user_id, game) do update set aba = excluded.aba, navegador = excluded.navegador, desde = now(), visto_em = now(), liberado = false, slot = null;
  if v.aba is not null then return query select v.aba::text, v.navegador::text, v.liberado::boolean, v.idade::double precision; end if;
end $$;

-- sinal de vida: quem tem a vez renova o visto_em; devolve a dona atual (outra aba = esta perdeu a vez)
create or replace function public.sessao_pulso(p_game text, p_aba text)
returns table (aba text, navegador text, liberado boolean, slot smallint)
language plpgsql security invoker set search_path = '' as $$
#variable_conflict use_column
begin
  update public.sessoes s set visto_em = now() where s.user_id = auth.uid() and s.game = p_game and s.aba = p_aba;
  return query select s.aba, s.navegador, s.liberado, s.slot from public.sessoes s where s.user_id = auth.uid() and s.game = p_game;
end $$;

-- libera: a aba antiga avisa a nova (p_para) que já salvou, e qual espaço estava aberto; p_para = a própria aba ao sair do jogo
create or replace function public.sessao_libera(p_game text, p_para text, p_slot smallint)
returns void language sql security invoker set search_path = '' as $$
  update public.sessoes s set liberado = true, slot = p_slot where s.user_id = auth.uid() and s.game = p_game and s.aba = p_para;
$$;

revoke all on function public.sessao_pede(text, text, text) from public, anon;
revoke all on function public.sessao_pulso(text, text) from public, anon;
revoke all on function public.sessao_libera(text, text, smallint) from public, anon;
grant execute on function public.sessao_pede(text, text, text) to authenticated;
grant execute on function public.sessao_pulso(text, text) to authenticated;
grant execute on function public.sessao_libera(text, text, smallint) to authenticated;
