-- Romance de Cavalaria · erros que aconteceram no jogo dos jogadores (netzach/js/erros.js manda; Supabase)
-- Rode uma vez no Supabase: SQL Editor → New query → cole tudo → Run.
-- Qualquer jogador pode ENVIAR um erro; ninguém de fora lê. Para ler: painel do Supabase → Table Editor → erros.
-- O jogo manda no máximo alguns erros por partida e nunca o mesmo duas vezes; os limites de tamanho seguram abuso.

create table if not exists public.erros (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  jogo text not null check (jogo in ('Netzach', 'Echad')),
  versao text not null check (char_length(versao) <= 40),
  mensagem text not null check (char_length(btrim(mensagem)) between 1 and 1000),
  onde text check (onde is null or char_length(onde) <= 3000),          -- arquivo, linha e a pilha de chamadas
  aparelho text check (aparelho is null or aparelho in ('pc', 'celular')),
  navegador text check (navegador is null or char_length(navegador) <= 300),
  user_id uuid default auth.uid() references auth.users (id) on delete set null,  -- quem estava logado (ou null)
  visto boolean not null default false                                             -- marque no painel quando resolver
);

alter table public.erros enable row level security;

drop policy if exists "qualquer um envia" on public.erros;
create policy "qualquer um envia" on public.erros for insert to anon, authenticated
  with check (visto = false and (user_id is null or user_id = (select auth.uid())));

revoke all on public.erros from anon, authenticated;
grant insert (jogo, versao, mensagem, onde, aparelho, navegador) on public.erros to anon, authenticated;
