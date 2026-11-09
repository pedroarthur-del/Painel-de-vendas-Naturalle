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

  /* Links das planilhas, criptografados com a senha da equipe (mesmo cofre do painel de vendas).
     Sem a senha, ninguém descobre de onde vêm os dados. */
  cofreVendas: {"salt": "TAjqhc1YRDxvKaX/HMtTlw==", "iv": "ePXvTgc3Iid4xIQd", "dados": "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", "iter": 250000},

  desenvolvidoPor: "Gomes de Matos Consultoria · Consultor Pedro Marques",
};
