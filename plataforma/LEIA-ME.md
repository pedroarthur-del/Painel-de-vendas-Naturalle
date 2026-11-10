# Plataforma Comercial Naturalle

Hub da área comercial num link só, com menu lateral recolhível:

| Aba | O que tem |
|---|---|
| Início | Picolé do mês (vendido x meta), encaminhamentos atrasados, próximos prazos, próxima reunião |
| Vendas | O painel de vendas atual (`../index.html`), sem pedir a senha de novo |
| Encaminhamentos | Quadro estilo Trello (arrastar entre colunas), reuniões com ata que gera encaminhamentos, lembretes por e-mail |
| Planejamento comercial | Frentes e iniciativas com responsável, prazo e andamento; metas mensais x realizado |
| Remuneração | Comissão de cada vendedor e do supervisor pelo atingimento, com simulação e planilha para baixar |
| Configurações | Pessoas e acessos (papel e abas de cada um), segurança, nuvem, privacidade |

Endereço: `https://pedroarthur-del.github.io/Painel-de-vendas-Naturalle/plataforma/`
O painel de vendas da raiz continua funcionando como antes.

## Onde fica cada coisa

| O quê | Onde fica |
|---|---|
| Encaminhamentos, atas, planejamento, responsáveis, configurações da plataforma | **Google Firebase** (Cloud Firestore, projeto `plataforma-naturalle`, São Paulo), igual para toda a gestão, em tempo real |
| Vendas, carteira, produtos, campanhas, metas e feriados | Planilha da Naturalle, entregue pelo portal seguro (Apps Script), filtrada por pessoa |
| Contas (número de celular + senha) e regras de comissão | Portal seguro (Apps Script) |

Login único: número + senha no portal. Com a sessão válida, o portal emite um passe do Firebase
(token personalizado com papel, nome e abas; vale 3 h e a plataforma renova sozinha).
Trocar a senha ou desativar o número corta a renovação. Vendedor não recebe passe: não lê nada do Firebase.

Se o Firebase não responder, a plataforma avisa e guarda o que for cadastrado só naquele navegador.

## Instalação da nuvem (feita em 10/11/2026)

1. Projeto Firebase `plataforma-naturalle` (sem Analytics/Gemini), Firestore em `southamerica-east1`, modo produção.
2. Authentication ligado (nenhum provedor: o login é pelo token do portal). Domínio autorizado: `pedroarthur-del.github.io`.
3. Regras: conteúdo de `firestore.rules` em Firestore → Regras → Publicar.
4. `config.js`: `firebase` preenchido e `loginPortal: true`.
5. Chave do servidor: Firebase → Configurações do projeto → Contas de serviço → **Gerar nova chave privada**.
   Solte o `.json` no Meu Drive. O gatilho de 10 min do portal (ou `portalFirebaseChave()` no editor)
   guarda a chave nas Propriedades do script (`FB_SA`) e manda o arquivo para a lixeira. A chave nunca vai para o GitHub.
6. Primeiro login de um administrador: a plataforma leva para a nuvem o que estava salvo naquele navegador
   (ou o ponto de partida do projeto). Em Configurações → Nuvem e dados há o botão para enviar de novo (só soma).

## Lembretes por e-mail (robô no Google Apps Script)

1. Em **script.google.com**, com a mesma conta dona do projeto Firebase → Novo projeto.
2. Cole `robo-emails.gs` em Código.gs. Em *Configurações do projeto*, marque *Mostrar o arquivo de manifesto*
   e cole `appsscript.json`.
3. Troque `PROJETO` pelo projectId do Firebase.
4. Rode `instalar()` uma vez e autorize.
5. Na plataforma: **Encaminhamentos → Lembretes por e-mail** → ligue os lembretes.

O robô envia a fila a cada 10 minutos (novo encaminhamento, lembrete, ata) e todo dia às 7h lembra
os prazos e cobra os atrasados. No dia escolhido manda o resumo semanal para a gestão.

## Segurança

- Login por e-mail e senha de cada pessoa (Firebase Authentication); convites por e-mail.
- Papéis (Administrador, Gestor, Membro, Leitor) e **abas liberadas por pessoa**, conferidos pelo servidor (`firestore.rules`).
  Ex.: o supervisor pode ver Vendas e Encaminhamentos sem ver Remuneração.
- Bloqueio progressivo de senha errada (3 → 1 min, 6 → 5 min, 9 → 15 min) e saída automática por inatividade.
- Links da planilha criptografados (AES-GCM); no modo equipe, senha extra opcional por aba.
- Política de segurança de conteúdo (CSP), sem scripts de terceiros fora das bibliotecas usadas, página fora do Google (`noindex`).

## Arquivos

| Arquivo | Para quê |
|---|---|
| `index.html` | Página da plataforma |
| `config.js` | **Único arquivo que muda** (nuvem, admins, endereço) |
| `assets/app.js` | Plataforma (módulos, acesso, dados) |
| `assets/vendas-dados.js` | Leitura da aba Vendas da planilha |
| `assets/app.css` | Visual |
| `firestore.rules` | Regras de acesso do servidor |
| `robo-emails.gs` + `appsscript.json` | Robô de e-mails |

Desenvolvido por Gomes de Matos Consultoria · Consultor Pedro Marques.
