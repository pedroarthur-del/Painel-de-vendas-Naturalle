/* =====================================================================
   CONFIGURAÇÃO DA PLATAFORMA NATURALLE
   É o único arquivo que muda quando a nuvem for ligada. Ao atualizar a
   plataforma, troque os outros arquivos e MANTENHA este.
   ===================================================================== */
window.PLATAFORMA = {
  cliente: { nome: "Naturalle Ice Up", curto: "Naturalle", cidade: "Fortaleza · CE" },

  /* Nuvem (Firebase · projeto plataforma-naturalle). Estas chaves são públicas por natureza:
     quem protege os dados são as regras (firestore.rules) e o passe emitido pelo portal. */
  firebase: {
    apiKey: "AIzaSyDthGOy-vNfTJ5Sa9Z2AVijSpGJtGEbQeA",
    authDomain: "plataforma-naturalle.firebaseapp.com",
    projectId: "plataforma-naturalle",
    storageBucket: "plataforma-naturalle.firebasestorage.app",
    messagingSenderId: "346727787701",
    appId: "1:346727787701:web:a1c5923eadde902e3022fc",
  },
  /* Login único no portal (número + senha). O Firebase guarda encaminhamentos, atas e planejamento. */
  loginPortal: true,

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
