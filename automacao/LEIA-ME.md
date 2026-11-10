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

## Instalação (uma vez)

1. Na planilha de vendas: Extensões → Apps Script.
2. Cole `robo-relatorios.gs` num arquivo e o conteúdo de `appsscript.json` no manifesto (Configurações do projeto → mostrar "appsscript.json").
3. Salve, escolha a função `instalar` e clique em Executar. Autorize com a conta dona da planilha.
4. `instalar()` cria a pasta no Drive (com as subpastas Processados e Com erro), as abas Itens e Log de importação e o gatilho de 10 em 10 minutos.

A aba Itens é criada com o id 1771100000, que é o link que o painel já usa.

# Portal seguro do painel (portal.gs)

O painel não lê mais a planilha "publicada na web". Ele entra numa API (App da Web do mesmo projeto do robô),
que roda com a conta dona da planilha e entrega a cada pessoa só o que ela pode ver.

| Quem | Usuário | Vê |
|---|---|---|
| Gestão / consultoria / supervisor | `equipe` + senha da equipe | tudo, como antes |
| Vendedor | o usuário dele (ex.: `allyson`) + chave individual | só as linhas, notas, clientes, produtos, campanha e comissão dele |

- O filtro é feito **no servidor**: o faturamento da empresa e os números de outros vendedores nem chegam ao celular do vendedor.
- Encaminhamentos e atas ficam na plataforma, que só aceita o usuário `equipe`.
- Chaves dos vendedores: painel → aba **Config** → **Acessos dos vendedores** → "Gerar acesso". A chave aparece uma vez, com a mensagem pronta para mandar no privado. "Nova chave" ou "Bloquear" derrubam o acesso na hora.
- Senha da equipe: painel → Config → **Senha da equipe**. Ao trocar, todo mundo da equipe entra de novo.
- 5 senhas erradas seguidas bloqueiam aquele usuário por 15 minutos.
- Metas digitadas no painel ficam na aba **Metas do painel** da planilha (valem para todos). Feriados e regras de comissão ficam no servidor.
- Os dados são montados a cada 10 minutos (gatilho `portalPreaquecer`) e logo depois de cada importação do robô. "Atualizar dados" (equipe) lê a planilha na hora.

**Ao mudar o código do portal:** Implantar → Gerenciar implantações → lápis → Versão: Nova versão → Implantar (o endereço continua o mesmo).
