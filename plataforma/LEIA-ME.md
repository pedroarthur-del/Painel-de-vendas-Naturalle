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

## Como funciona hoje (modo equipe)

Sem a nuvem ligada, entra com a senha da equipe (a mesma do painel de vendas). Os quadros de
encaminhamentos, planejamento e remuneração ficam salvos **só no navegador de quem usa**.
Serve para testar e montar a estrutura; para a equipe toda usar, ligue a nuvem.

## Ligar a nuvem (Firebase) · uma vez, uns 15 minutos

1. **console.firebase.google.com** → Adicionar projeto → nome `plataforma-naturalle` (Analytics pode desligar).
2. **Authentication** → Começar → ative **E-mail/senha**.
   Em *Configurações → Domínios autorizados*, adicione `pedroarthur-del.github.io`.
3. **Firestore Database** → Criar banco → região `southamerica-east1 (São Paulo)` → modo produção.
   Aba **Regras** → apague tudo, cole o conteúdo de `firestore.rules` → Publicar.
4. **Configurações do projeto** (engrenagem) → Seus apps → ícone **</>** (Web) → registre.
   Copie o bloco `firebaseConfig` e cole em `plataforma/config.js` no lugar de `firebase: null,`:
   ```js
   firebase: { apiKey: "...", authDomain: "...", projectId: "...", storageBucket: "...", messagingSenderId: "...", appId: "..." },
   ```
   (Essas chaves do Firebase são públicas por natureza; quem protege os dados são as regras do passo 3.)
5. **Authentication → Usuários → Adicionar usuário**: crie o seu acesso (seu e-mail e uma senha forte).
   Entre na plataforma com `pedroarthur@gomesdematos.com.br`: a plataforma copia os dados que estiverem no seu navegador
   (ou o ponto de partida do projeto) para a nuvem.
6. **Configurações → Nuvem e dados → Conectar vendas**: digite a senha do painel de vendas.
   A chave fica no servidor e só abre para quem tem a aba Vendas, Planejamento ou Remuneração.
7. **Configurações → Pessoas e acessos**: cadastre cada pessoa com e-mail, papel e abas. Ao salvar,
   ela recebe um e-mail para criar a própria senha.

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
