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
  cofreVendas: {"salt": "TAjqhc1YRDxvKaX/HMtTlw==", "iv": "ZiIYYUZvQsUayp2r", "dados": "OC3Ac7gDSlARZusK3hrtMoExjX1FWs74jT1zLw1xeOkAefLcKzSPMI4i8Lrn8yELhy5GlM823MxTgm1KUrw/S1xfU5aGVmnT0/8NDHyGKZYw6OATwJWU86Iy4Pk+KwyYvyFviJ3NMArwmnFG5taQwIqzaajRDHQ3N35ajn+KIgZQZarPMqhpC9x3jDkaUR84/nPdJ+GMPgRmmIIRRUH6wCGn7i1APvbMg7oHkk5z7uLGoNsrz1lVHppf1piJpnM10ve2i2M4v2PwnOUcowCojObZLGfxxLaB4b/hghtECFt5nO7XiqqUF83As/K+wgQQLkwV8dLpTMAsWMuvMUedcfFQaUFvRtUvImnTu+az0DZaioksLGk6i2MPM/kQcvDXPy3DIhlU+Cud6qYMwuZC3XoRVUYQ9r9nl3Rv+I0x+1JQ4o6neSHRZulPxVLXkKEfrdWBmlkHM/ZZaMe3d06NuzzMviMnPRUlIdCZNMjEWD8EttL6y5/A2/dVmTg81VwWKS6zvbN+Zgkmv8M2vt+PUALdhG/7Y5RTTolUgCkEOsrmXZfaNFXM9zVI3RNZgX0qxeaB/8IriFqpDMBQwxYw8PC+/GOew/Oncy4sX/Z/h9F1qVo82nq1M2Z0j/IhTrU1VXV64iL5GcWXv4/fUWRB60gD82RSFWwTv5qup6sooGqZEVRncC44rCz3BUGSJf6rEYJxdFGLTGw/GKALrLhA+sbNQjOo8yHyLht8iOr9JCXSb5jGK4SBdd/VOqykKGT3hOv0SG80ESbKoI5Nnb38gbVptW4rISeLQDTd522XRkADIwp+qfK5TdDOhtr1JHqt/XwPqImgGFxvLtG+WzXe0MJ6hsLX4q1CL9T/rIyNdLpgN1sarfq0/ReHnqfBEXTpV8C3raUcEyXO6G9MzkyUSrvr2CzUBd5adAJEPp/X8m+hk5mEGjj4EhmX0Wse9RC65oeS1hj0s7mGVsOtP8GARDGewH5f0+umvmDIoner6AruQnF4vUsKLHnNcmzFf9CYe7Ln/hs3UDOgQQDc2AMJ1Hi09lTNyw2Kbz2c3rj8aLy/zkVE4YkQilL11812anJIYt4HBnQtAbe3fYiGgUVGVqqjzebyJZ/sVVTJm9PvKqI6G7rs8s5cAwegcYYYNz9++T5HCKYEaTdLpRBGEro/NGf6Ypu9kckZJpdymiYLgIOltC6Yh7gH33g8sF645dRB9pC3yb4olRpDSDu19FhYTwzp3AbGvTXwhTCl4bIWEVMLrYM3kRn4Hcf+PQ3UeupRs+sYF/C8vlDM7jv5tBTs30NrgtoZNy6cqRfK6OtwcwPGtwIXPtb4sE2prBnO0DkrwDPsINGo+QqeuT+gjriFN9MnWZRSdlxUB/Z7BUDtsIFxJv7SDdIDZhDKqxQOguWltJvzhS2nrraKNQtbiX6CLjMvmHaz+KMa5nrrvNApOpGZXHGFSAPTMoPeaMDe+1zCbpmYGOjDle256YAtGQ99uhVXsSMZ84zC2SpFjUowZ4mFDfvskMBnCuBgY88G1jUrWm7KeFeTsVDU58jUwx6JItXDvr1cvNZGGpfAaMl7mTMD+7jRWfRiKO+H18vi6XiftwcSTJJVLNgn346Qy/Up7iExeNN+2CyjT0iCTkY/CrYqEIyX223l+WORRdty5EfzyRKU9LyE3Xj+Z1UZA27cy+c1BMgmhlmsg6ovUQb074+QjbXybVLSyYRVznIbBYtlcpR1dKkj03ZpaUIk9rRTgxDSTWtvXm+UcJ/7QKZgMX7SSAlWVJ7D4wKuqQ7HiJYuK6plU3SrYgWo24dw/cRuGDlffs47cARkq+KgcnHpGiToMoD6jMdDAjXsnDpf6RSgCCpF9mFNydG7fbLxrsytlBzhHZNzvsfkFIo1OQ==", "iter": 250000},

  desenvolvidoPor: "Gomes de Matos Consultoria · Consultor Pedro Marques",
};
