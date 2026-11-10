-- Romance de Cavalaria · tabela dos saves na nuvem (Supabase)
-- Rode uma vez no Supabase: SQL Editor → New query → cole tudo → Run.
-- Cada linha é um espaço de save de um jogo de uma conta. Ninguém lê nem grava o save de outra conta (RLS).

create table if not exists public.saves (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  game text not null check (game ~ '^[a-z0-9_-]{1,32}$'),   -- 'netzach' (e, depois, 'echad')
  slot smallint not null check (slot between 1 and 9),
  saved_at bigint not null,                                  -- quando o save foi gravado (ms, relógio do jogo)
  data text,                                                 -- o save inteiro, em texto JSON enxuto; null = espaço apagado
  updated_at timestamptz not null default now(),
  primary key (user_id, game, slot),
  constraint saves_tamanho check (data is null or length(data) <= 200000)   -- até 200 KB por espaço (hoje uns 6 KB)
);

alter table public.saves enable row level security;

drop policy if exists "dono lê" on public.saves;
drop policy if exists "dono cria" on public.saves;
drop policy if exists "dono muda" on public.saves;
drop policy if exists "dono apaga" on public.saves;
create policy "dono lê" on public.saves for select to authenticated using ((select auth.uid()) = user_id);
create policy "dono cria" on public.saves for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "dono muda" on public.saves for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "dono apaga" on public.saves for delete to authenticated using ((select auth.uid()) = user_id);

-- updated_at acompanha cada gravação (só para consulta no painel; o jogo compara saved_at)
create or replace function public.saves_toca() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists saves_toca on public.saves;
create trigger saves_toca before update on public.saves for each row execute function public.saves_toca();

grant select, insert, update, delete on public.saves to authenticated;
revoke all on public.saves from anon;
