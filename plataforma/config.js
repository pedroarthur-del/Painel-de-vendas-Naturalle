/* =====================================================================
   CONFIGURAÇÃO DA PLATAFORMA NATURALLE
   É o único arquivo que muda quando a nuvem for ligada. Ao atualizar a
   plataforma, troque os outros arquivos e MANTENHA este.
   ===================================================================== */
window.PLATAFORMA = {
  cliente: { nome: "Naturalle Ice Up", curto: "Naturalle", cidade: "Fortaleza · CE" },

  /* Conexão com a nuvem (Firebase). Cole aqui o firebaseConfig do projeto
     (passo a passo no LEIA-ME.md). Enquanto estiver null, a plataforma roda no
     MODO EQUIPE: entra com a senha da equipe e os quadros (encaminhamentos,
     planejamento, remuneração) ficam salvos só no navegador de quem usa. */
  firebase: null,

  /* E-mails que entram como Administrador desde o primeiro acesso na nuvem.
     Precisam ser os mesmos da lista em firestore.rules. */
  adminsIniciais: ["pedroarthur@gomesdematos.com.br"],

  /* Endereço público (usado nos links dos e-mails) */
  urlPublica: "https://pedroarthur-del.github.io/Painel-de-vendas-Naturalle/plataforma/",

  /* Painel de vendas que abre na aba Vendas */
  painelVendas: "../index.html",

  /* Portal seguro dos dados de vendas (Google Apps Script, "Robô de relatórios Naturalle").
     A planilha não é publicada na web: só quem entra com usuário e senha recebe os dados. */
  apiUrl: "https://script.google.com/macros/s/AKfycbzavM1NerZ3fO0CcX-GDCwobIeiB9Z3UZC-OCMxK0-w-8foQsIFWuYl4Bg9fGTtlS8zig/exec",

  desenvolvidoPor: "Gomes de Matos Consultoria · Consultor Pedro Marques",
};
