# Robô de relatórios · Naturalle

## O que o supervisor faz (todo dia, 1 ou 2 vezes)

1. Exporta do Questor, em **CSV**, os relatórios do mês (de 01 até hoje), para cada empresa (JMJ = Naturalle, JSM = Selecto):
   - **Faturamento por Documento** (sem imposto)
   - **Faturamento por Vendedor** (com imposto)
   - **Faturamento por Documento com itens** (produtos)
2. Salva os arquivos na pasta do Google Drive **Naturalle – Relatórios Questor**.
   Com o Google Drive para computador instalado, basta exportar direto para essa pasta.
3. Pronto. Em até 10 minutos o robô importa, e o painel mostra os números novos.

O nome do arquivo não importa: o robô reconhece o relatório pelo conteúdo.
Se um arquivo não for reconhecido, ele vai para a subpasta **Com erro** e nada na planilha é alterado.

## O que o robô faz

| Relatório | Vai para a aba |
|---|---|
| Faturamento por Documento (sem imposto) | Sem Imposto Naturalle / Sem Imposto Selecto |
| Faturamento por Vendedor (com imposto) | Com Imposto Naturalle / Com Imposto Selecto |
| Faturamento por Documento com itens | Itens (aba nova, lida pela aba Produtos do painel) |

- Substitui o conteúdo do relatório, mantém as fórmulas das colunas da direita e estende essas fórmulas se o relatório vier maior.
- Copia as notas do mês para a aba **Carteira mes anterior** (o histórico). Com isso a virada do mês não perde dados e o fechamento manual deixa de ser necessário.
- Na aba Itens, troca só o período que veio no arquivo (marca + datas). O histórico de produtos vai se acumulando.
- O vendedor de cada item vem da nota (abas Sem Imposto e histórico). Se a nota não for encontrada, usa o último vendedor do cliente.
- Registra cada importação na aba **Log de importação**.

## Histórico (meses fechados)

Relatórios de meses que já fecharam (ex.: o ano de 2025 inteiro) **não mexem nas abas do mês**:
- **Por documento** → as notas vão para a aba **Carteira mes anterior** (histórico), trocando os meses que vieram no arquivo.
- **Por vendedor** → a nota e o vendedor vão para a aba **Vendedor por nota**; o histórico pega o vendedor por ela e pela aba **De-Para**.
- Vendedor que não está no De-Para (já saiu) fica com o primeiro nome e o painel o marca como **antigo** (sem venda nos últimos 3 meses).
- Pode soltar os arquivos em qualquer ordem. Para um ano inteiro: os dois relatórios (documento e vendedor) de cada empresa.
- Conserto/refazer tudo: rode `reconstruirHistorico()` no editor (relê os relatórios de meses fechados que estão em Processados).

## Instalação (uma vez)

1. Na planilha de vendas: Extensões → Apps Script.
2. Cole `robo-relatorios.gs` num arquivo e o conteúdo de `appsscript.json` no manifesto (Configurações do projeto → mostrar "appsscript.json").
3. Salve, escolha a função `instalar` e clique em Executar. Autorize com a conta dona da planilha.
4. `instalar()` cria a pasta no Drive (com as subpastas Processados e Com erro), as abas Itens e Log de importação e o gatilho de 10 em 10 minutos.

A aba Itens é criada com o id 1771100000, que é o link que o painel já usa.

# Portal seguro (portal.gs) · plataforma única

Endereço único: https://pedroarthur-del.github.io/Painel-de-vendas-Naturalle/ (abre a plataforma; o painel de vendas roda dentro dela, no menu **Vendas**).
A plataforma não lê a planilha direto: entra numa API (App da Web do mesmo projeto do robô), que roda com a conta dona da planilha e entrega a cada pessoa só o que ela pode ver.

## Contas por número de celular corporativo

Configurações → **Pessoas e acessos** → "Novo acesso": número, nome, papel, linhas de venda (para vendedor), senha (mín. 6), situação Ativo.
A mensagem pronta para mandar no WhatsApp aparece na hora. O acesso é do número: se a pessoa sair, troque o nome e a senha e o número continua.

| Papel | Vê |
|---|---|
| Administrador | tudo + Pessoas e acessos, remuneração, senha do acesso `equipe` |
| Gestor | tudo; edita metas e feriados |
| Membro / Leitor | tudo (leitor sem editar) |
| Vendedor | só Vendas (Visão geral, Carteira, Produtos, Campanhas) e Remuneração, com os números dele |

- O filtro é feito **no servidor**: faturamento da empresa e números de outros vendedores nem chegam ao celular do vendedor.
- Trocar senha, mudar acesso ou desativar derruba as sessões daquele número na hora. 5 senhas erradas bloqueiam por 15 minutos.
- O acesso legado `equipe` continua valendo como administrador até você trocar a senha dele (Pessoas e acessos → Senha do acesso equipe).
- Metas: Configurações → **Metas e feriados** (ficam na aba **Metas do painel** da planilha). Regras de comissão e feriados ficam no servidor.
- Vendas → **Resultado da semana**: escolha a semana e a pessoa; gera texto e imagem individual (faturamento, clientes novos, carteira, produto, comissão, campanha).
- Dados montados a cada 10 minutos (gatilho `portalPreaquecer`) e logo após cada importação do robô. "Atualizar dados" (gestão) lê a planilha na hora.

- Encaminhamentos, atas e planejamento ficam no **Firebase** (ver `plataforma/LEIA-ME.md`). O portal só emite o passe (`fbToken`) com a chave guardada em `FB_SA`.

**Ao mudar o código do portal:** cole o novo `portal.gs` no arquivo `portal` do projeto, salve, e Implantar → Gerenciar implantações → lápis → Versão: Nova versão → Implantar (o endereço continua o mesmo).
