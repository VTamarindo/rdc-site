-- Romance de Cavalaria · tabela do formulário de Feedback da página inicial (Supabase)
-- Rode uma vez no Supabase: SQL Editor → New query → cole tudo → Run. (Já aplicado em 10/11/2026.)
-- Qualquer visitante pode ENVIAR um feedback; ninguém de fora lê. Para ler: painel do Supabase → Table Editor → feedback.

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  sobre text not null check (sobre in ('Netzach', 'Echad', 'O site', 'Outro')),
  tipo text not null check (tipo in ('Ideia', 'Bug', 'Elogio', 'Outro')),
  mensagem text not null check (char_length(btrim(mensagem)) between 1 and 4000),
  email text check (email is null or (char_length(email) <= 200 and email ~ '^[^@\s]+@[^@\s]+$')),
  user_id uuid default auth.uid() references auth.users (id) on delete set null,  -- quem estava logado (ou null)
  navegador text check (navegador is null or char_length(navegador) <= 300),
  lido boolean not null default false                                              -- marque no painel quando ler
);

alter table public.feedback enable row level security;

drop policy if exists "qualquer um envia" on public.feedback;
create policy "qualquer um envia" on public.feedback for insert to anon, authenticated
  with check (lido = false and (user_id is null or user_id = (select auth.uid())));

revoke all on public.feedback from anon, authenticated;
grant insert (sobre, tipo, mensagem, email, navegador) on public.feedback to anon, authenticated;
