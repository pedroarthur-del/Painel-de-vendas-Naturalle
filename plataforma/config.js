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
  cofreVendas: {"salt": "TAjqhc1YRDxvKaX/HMtTlw==", "iv": "Zm8wKu5sZHF1ABzo", "dados": "whf1RXE7t3rdPYq5NBIvAjq94CcO3BksCXTOKiMwKtweBHuprXP4BHNOcmJLbFmEca02QMHiD/p/j+BUqJqp+T/1bByKWc/B/uwDtJtDE9XoiNgWuwo2pDnYcNaAs95e8kyb2mZY8jqAyYP8PNyL4Oqw2GSG1KDwLFDdd8bVYQ5HCGNixupaxu3tjK+uxzWIgo2cniPCo0jj7M2WAGnwNE1r3ny1cPOCAjVoaUBtUjjmqde0conkrmjZ/+1CkJSLfmxWV4AuCkmxAyaLkGEVXOmraTjBrFHVk8pb8dg4WBjFWujoaJj2byO/cOB0hiEquHyTjZuOFYs7oCwf1/8Ql3nqUI+mZYsyF8cmDVogfj+8FcHjBWuNGDRzNSeFaujhYNnNO/oyy133/c5U2AC2HI6X4afhbgft0+W/eJkJfLxDy0+P4veJA+lvZW+9rY09Vcr/fx+fjj9Vp3ZQR7ynzOG/3/0iW2aC+HJhbw35Nd2BrH3BhKuklComniU+TNOwn6jyjGNcXmS/unUNz2uLsWxL/Rrxk9TDaIjnXN2IdSybdsvyjk/S9JmNU55ytWyzCVkmgORTMwqc89x9tbbIswgI47dxnZBls5Acn/rXaQGVAYC9Isjl9SXLP0NbHaj88ZYnonQ5vj1YOouiPQldYLPjBEBjCiiuWPAZ9J79DN6WDT6vUwbt7/h9cnwQAqqgS/7wUOELrNS9BifXSmnqJAJp5qYiMysC03ocdHSUZzULGEtdHzXP+9eW5ShkVwDTlqQskbd4o1YvVhYID3iFTYYblDtQtys6GI9EIkqLFYthM1EjV3uH8sGVQkRt30+e+/fPI3DCSs4C3lLr+h1i+PD/zxXhfy+JfRQ2BsyPUMhX6ZNu+8axhKhbwsh1YQD6GQspEBO4+WmWG2XpHMVYTwJMI+GI32nQ224FeRhO9p3Qn5/fq/ox3JQttJ5VaixaaNBFJ1jpKE9e6LzvNpoeC8Eisb+LHYQ0dY9Wtb9GJ6MvKxh0Ysjv7bqJmC/Qe/p5HjQTmtp5T6CP8/Fn08bHCrL9gL6SsRlwF9UeExruAgINI/xVij9T7HF/deZzfSwkwhxBeAJh8YAY2aQWYVoelYuUV4Lu3sv+Gz7WyKYG9RK+2RJzz6f7f+onFsErO7ZP81yovDE4ZTwy0y/hchAasPS9N5pXzRnlmcDrx9qu/dDImXsSisJTr6ADz8JWNwVIQceRs26zRGdgiiL6U6Y82odV4PKLeeya69Zlm31yrZUKdbibNH2evojybq3515SHADZB7MbMtV2VCLCwA2uNsgkhnekjqbBHAeF9u/92ZIjst7hpnelhC6msZMk5cQd7AsoukGUrhkz4HlQFnCPrjsjn9yTqSpPCo+3uQTNYRc5Y30DTKwnNMsqhHgBUTaKRoHtR791Uvky0joZoFO6GW9ioaKBgBeWwSAVJiPmsAXAGYnfIsK/ytIZaQQPcahkyEq1nh5FMQTXM8xbpiMFftCazJxxNxlsEn46ylgKAceEsmf5qNVZVo7HjT+fewYqwUfAaxwyr4ep4voDeXHJp2Hh9TA6cRFVXJ9424rIaU3vd7EaTo5trTgIXN/btLcdRne6X3ZAajDueS4BWLEopOpgGHRg=", "iter": 250000},

  desenvolvidoPor: "Gomes de Matos Consultoria · Consultor Pedro Marques",
};
