// Configuração do site. Edite só aqui.
// netzachUrl: onde fica o jogo. "netzach/" = a pasta do jogo dentro deste site.
// Quando tiver a página do Echad no itch.io, cole o endereço entre as aspas.
// Exemplo: echadUrl: "https://seunome.itch.io/echad"
window.SITE = {
  netzachUrl: "netzach/",
  echadUrl: "",
  // Supabase: o projeto "Romance de Cavalaria", só do site (o mesmo das contas, em netzach/js/conta.js). Project Settings → API. Usado pelo formulário de Feedback da página inicial,
  // que grava na tabela public.feedback (supabase/feedback.sql). A chave é a publishable / "anon public", feita para
  // ficar à vista. NUNCA cole aqui a chave secret / service_role. Vazio = o formulário avisa que o envio está sendo ligado.
  supabaseUrl: "https://cyzldbitvtknniexqjkp.supabase.co",
  supabaseKey: "sb_publishable_YK8dhOvCfNAl2aSjuroBwg_gYQ5mm-7"
};
