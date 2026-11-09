/* =====================================================================
   ROBÔ DE RELATÓRIOS · Naturalle (Google Apps Script, dentro da planilha de vendas)

   O supervisor exporta os relatórios do Questor e salva na pasta do Google Drive
   "Naturalle – Relatórios Questor". A cada 10 minutos este robô:
     1. lê cada arquivo novo da pasta e descobre sozinho que relatório é
        (pelo título e pelas colunas, não pelo nome do arquivo);
     2. grava na aba certa, no lugar do que estava lá, como o supervisor fazia à mão:
        • Faturamento por Documento (Sem Imposto) → "Sem Imposto Naturalle/Selecto"
        • Faturamento por Vendedor (Com Imposto)  → "Com Imposto Naturalle/Selecto"
        • Faturamento por Documento com itens (produtos) → aba "Itens"
        As fórmulas que já existem nas abas continuam calculando e são estendidas
        até a última linha, se o relatório vier maior;
     3. guarda as notas do mês na aba "Carteira mes anterior" (histórico), para nenhum
        mês se perder na virada;
     4. move o arquivo para "Processados" (ou "Com erro") e registra tudo na aba
        "Log de importação".

   Instalar: Extensões → Apps Script → colar este arquivo → salvar → rodar instalar().
   Passo a passo completo em automacao/LEIA-ME.md.
   ===================================================================== */
const ROBO = {
  PASTA: 'Naturalle – Relatórios Questor',
  ABA_ITENS: 'Itens',
  GID_ITENS: 1771100000, // id fixo da aba Itens: é o que o painel lê (link publicado ...gid=1771100000)
  ABA_LOG: 'Log de importação',
  ABA_HIST: 'Carteira mes anterior',
  ABA_DOC: { NATURALLE: 'Sem Imposto Naturalle', SELECTO: 'Sem Imposto Selecto' },
  ABA_VEND: { NATURALLE: 'Com Imposto Naturalle', SELECTO: 'Com Imposto Selecto' },
  // colunas calculadas da aba Sem Imposto (as mesmas que o painel lê), base 0
  SI: { cliente: 25, doc: 50, data: 51, vend: 54, flag: 55, valor: 56 },
  CAB_ITENS: ['MARCA', 'ANO', 'MES', 'DIA', 'DOCUMENTO', 'ORIGEM', 'COD_CLIENTE', 'CLIENTE', 'COD_PRODUTO', 'PRODUTO', 'UN', 'QTDE', 'VALOR', 'VALOR_NF', 'VENDEDOR'],
  CAB_HIST: ['MARCA', 'ANO', 'MES', 'DIA', 'DOCUMENTO', 'CLIENTE', 'VENDEDOR', 'VALOR_CENTAVOS'],
};

/* ================= instalação ================= */
function instalar() {
  const raiz = DriveApp.getRootFolder();
  const pasta = pegarPasta_(raiz, ROBO.PASTA);
  pegarPasta_(pasta, 'Processados'); pegarPasta_(pasta, 'Com erro');
  let ss = SpreadsheetApp.getActive();
  aba_(ss, ROBO.ABA_LOG, ['DATA/HORA', 'ARQUIVO', 'RELATÓRIO', 'MARCA', 'DATAS NO ARQUIVO', 'LINHAS', 'RESULTADO']);
  if (!ss.getSheetByName(ROBO.ABA_ITENS)) {
    // cria a aba com o id que o painel já conhece
    Sheets.Spreadsheets.batchUpdate({ requests: [{ addSheet: { properties: { sheetId: ROBO.GID_ITENS, title: ROBO.ABA_ITENS } } }] }, ss.getId());
    SpreadsheetApp.flush();
    ss = SpreadsheetApp.openById(ss.getId()); // reabre para enxergar a aba criada pela API
  }
  const itens = ss.getSheetByName(ROBO.ABA_ITENS);
  if (!itens) throw new Error('não consegui criar a aba Itens; rode instalar() de novo');
  if (!String(itens.getRange(1, 1).getValue()).trim()) {
    itens.getRange(1, 1, 1, ROBO.CAB_ITENS.length).setValues([ROBO.CAB_ITENS]).setFontWeight('bold'); itens.setFrozenRows(1);
  }
  if (itens.getSheetId() !== ROBO.GID_ITENS)
    Logger.log('ATENÇÃO: a aba Itens já existia com outro id (' + itens.getSheetId() + '). Apague-a e rode instalar() de novo, ou troque o link no painel.');
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'processarPasta').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('processarPasta').timeBased().everyMinutes(10).create();
  log_(['', 'Robô instalado', '', '', '', '', 'Pasta: ' + pasta.getUrl()]);
  Logger.log('Pronto. Pasta dos relatórios: ' + pasta.getUrl());
  processarPasta();
}

/* ================= rotina principal ================= */
function processarPasta() {
  const trava = LockService.getScriptLock();
  if (!trava.tryLock(5000)) return;
  try {
    const pasta = pegarPasta_(DriveApp.getRootFolder(), ROBO.PASTA);
    const ok = pegarPasta_(pasta, 'Processados'), ruim = pegarPasta_(pasta, 'Com erro');
    const arquivos = [], it = pasta.getFiles();
    while (it.hasNext()) arquivos.push(it.next());
    if (!arquivos.length) return;
    arquivos.sort((a, b) => a.getDateCreated() - b.getDateCreated());

    // 1) lê e classifica tudo antes de gravar
    const lidos = [];
    arquivos.forEach(f => {
      try {
        const rows = lerArquivo_(f);
        const c = classificar(rows);
        if (!c) throw new Error('não reconheci este relatório (título ou colunas diferentes do esperado)');
        lidos.push({ f, rows, c });
      } catch (e) {
        log_([new Date(), f.getName(), '?', '', '', '', 'ERRO: ' + e.message]); f.moveTo(ruim);
      }
    });
    const ss = SpreadsheetApp.getActive();
    // 2) guarda no histórico as notas que estão nas abas antes de trocar (protege a virada do mês)
    ['NATURALLE', 'SELECTO'].forEach(m => { if (lidos.some(l => l.c.marca === m && l.c.tipo !== 'ITENS')) guardarHistorico_(ss, m); });
    // 3) grava: vendedor antes de documento (o documento busca o vendedor), itens por último
    const ordem = { VENDEDOR: 1, DOCUMENTO: 2, ITENS: 3 };
    lidos.sort((a, b) => ordem[a.c.tipo] - ordem[b.c.tipo]);
    lidos.forEach(({ f, rows, c }) => {
      try {
        let n;
        if (c.tipo === 'ITENS') n = gravarItens_(ss, rows, c);
        else n = gravarBruto_(ss.getSheetByName((c.tipo === 'DOCUMENTO' ? ROBO.ABA_DOC : ROBO.ABA_VEND)[c.marca]), rows);
        log_([new Date(), f.getName(), nomeTipo_(c.tipo), c.marca, c.datas || c.periodo, n, 'ok']);
        f.moveTo(ok);
      } catch (e) {
        log_([new Date(), f.getName(), nomeTipo_(c.tipo), c.marca, c.datas || c.periodo, '', 'ERRO: ' + e.message]); f.moveTo(ruim);
      }
    });
    SpreadsheetApp.flush();
    // 4) depois que as fórmulas recalculam, atualiza o histórico com o mês atual
    ['NATURALLE', 'SELECTO'].forEach(m => { if (lidos.some(l => l.c.marca === m && l.c.tipo !== 'ITENS')) guardarHistorico_(ss, m); });
  } finally { trava.releaseLock(); }
}
const nomeTipo_ = t => ({ DOCUMENTO: 'Faturamento por documento (sem imposto)', VENDEDOR: 'Faturamento por vendedor (com imposto)', ITENS: 'Itens / produtos' }[t] || t);

/* ================= leitura e classificação (puras, testáveis fora do Google) ================= */
function decodificar(bytesUtf8Texto, latin1Texto) {
  // os relatórios do Questor saem em UTF-8; se vier em ANSI (Windows), usa a outra leitura
  return /Relat�rio|�/.test(bytesUtf8Texto) && latin1Texto ? latin1Texto : bytesUtf8Texto;
}
function separadorCSV(texto) {
  const l = texto.slice(0, 2000).split(/\r?\n/)[0] || '';
  return (l.match(/;/g) || []).length > (l.match(/,/g) || []).length ? ';' : ',';
}
const semAcento = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
function marcaDe(empresa) {
  const e = semAcento(empresa).replace(/\s+/g, '');
  if (e.indexOf('JMJ') === 0) return 'NATURALLE';
  if (e.indexOf('JSM') === 0) return 'SELECTO';
  return null;
}
function dataBR(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(String(s || '').trim());
  if (!m) return null;
  let y = +m[3]; if (y < 100) y += 2000;
  return { ano: y, mes: +m[2], dia: +m[1] };
}
function numBR(s) {
  if (typeof s === 'number') return s;
  let t = String(s == null ? '' : s).trim();
  if (!t) return 0;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d+,\d+$/.test(t)) t = t.replace(',', '.');
  const n = +t; return isFinite(n) ? n : 0;
}
function classificar(rows) {
  const r = (rows || []).find(x => x && x.length > 10);
  if (!r) return null;
  const titulo = semAcento(r[2]), marca = marcaDe(r[0]);
  if (!marca) return null;
  const per = /(\d{2}\/\d{2}\/\d{4}).*?(\d{2}\/\d{2}\/\d{4})/.exec(String(r[4] || ''));
  const periodo = per ? per[1] + ' a ' + per[2] : '';
  let tipo = null;
  if (titulo.indexOf('POR VENDEDOR') >= 0 && semAcento(r[6]) === 'DOCUMENTO') tipo = 'VENDEDOR';
  else if (titulo.indexOf('POR DOCUMENTO') >= 0 && semAcento(r[10]).indexOf('DADOS DO DOCUMENTO') === 0 && semAcento(r[22]) === 'PRODUTO') tipo = 'ITENS';
  else if (titulo.indexOf('POR DOCUMENTO') >= 0 && semAcento(r[7]) === 'FILIAL' && semAcento(r[8]).indexOf('DOC') === 0) tipo = 'DOCUMENTO';
  if (!tipo) return null;
  // datas reais das notas (o período informado às vezes vai até o fim do trimestre)
  const col = tipo === 'ITENS' ? 16 : tipo === 'DOCUMENTO' ? 24 : -1;
  let min = null, max = null;
  if (col >= 0) rows.forEach(x => { const d = x && dataBR(x[col]); if (!d) return; const k = d.ano * 10000 + d.mes * 100 + d.dia; if (min == null || k < min) min = k; if (max == null || k > max) max = k; });
  const fmt = k => k == null ? '' : String(k % 100).padStart(2, '0') + '/' + String(Math.floor(k / 100) % 100).padStart(2, '0') + '/' + Math.floor(k / 10000);
  return { tipo, marca, periodo, min, max, datas: min != null ? fmt(min) + ' a ' + fmt(max) : '' };
}
/* converte o texto do relatório no que a importação do Sheets faria (números e datas) */
function converter(v) {
  if (v == null) return '';
  const s = String(v).trim();
  if (s === '') return '';
  const d = dataBR(s); if (d) return new Date(d.ano, d.mes - 1, d.dia);
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || /^-?\d+(,\d+)?$/.test(s)) return numBR(s);
  return s;
}
/* itens (produtos) de um relatório "Faturamento por Documento" com produtos */
function extrairItens(rows, marca) {
  const out = [];
  (rows || []).forEach(r => {
    if (!r || semAcento(r[10]).indexOf('DADOS DO DOCUMENTO') !== 0) return;
    const prod = String(r[33] || '').trim(); if (!prod) return;
    const d = dataBR(r[16]); if (!d) return;
    const doc = String(r[10]).split(':').pop().trim().replace(/\D/g, '');
    const cli = String(r[14] || '').trim(), mc = /^(\d+)\s*-\s*(.*)$/.exec(cli);
    out.push([marca, d.ano, d.mes, d.dia, doc, String(r[12] || '').trim(), mc ? mc[1] : '', mc ? mc[2].trim() : cli,
      String(r[32] || '').trim(), prod, String(r[34] || '').trim(), numBR(r[35]), numBR(r[36]), numBR(r[43]), '']);
  });
  return out;
}

/* ================= gravação no Google Sheets ================= */
function gravarBruto_(sh, rows) {
  if (!sh) throw new Error('aba de destino não encontrada');
  const maxCol = sh.getMaxColumns(), maxRow = Math.max(sh.getMaxRows(), 1);
  // a aba pode ter uma linha de cabeçalho "Column1, Column2…" (tabela do Sheets): o relatório entra embaixo dela
  const ini = /^column\s*\d+$/i.test(String(sh.getRange(1, 1).getDisplayValue()).trim()) ? 2 : 1;
  // colunas com fórmula na 1ª linha de dados = área calculada; o relatório entra antes dela
  const f1 = sh.getRange(ini, 1, 1, maxCol).getFormulas()[0];
  const primeiraFormula = f1.findIndex(x => x !== '');
  const largCSV = Math.max.apply(null, rows.map(r => r.length));
  const larg = primeiraFormula > 0 ? Math.min(largCSV, primeiraFormula) : largCSV;
  if (primeiraFormula > 0 && largCSV > primeiraFormula && rows.some(r => r.slice(primeiraFormula).some(x => String(x).trim() !== '')))
    throw new Error('o relatório tem mais colunas do que o espaço antes das fórmulas da aba; layout do Questor mudou?');
  const dados = rows.map(r => { const o = []; for (let i = 0; i < larg; i++) o.push(converter(r[i])); return o; });
  const fim = ini + dados.length - 1;
  if (fim > maxRow) sh.insertRowsAfter(maxRow, fim - maxRow + 50);
  sh.getRange(ini, 1, sh.getMaxRows() - ini + 1, larg).clearContent();
  sh.getRange(ini, 1, dados.length, larg).setValues(dados);
  // estende as fórmulas de cada linha até o fim do relatório
  if (primeiraFormula >= 0) {
    const f2 = sh.getRange(ini + 1, 1, 1, maxCol).getFormulas()[0];
    f1.forEach((f, i) => {
      if (!f || /ARRAYFORMULA/i.test(f) || !f2[i]) return; // fórmula única ou matricial: não mexe
      const col = i + 1, ultima = ultimaComFormula_(sh, col);
      if (ultima < fim) sh.getRange(ini, col).copyTo(sh.getRange(ultima + 1, col, fim - ultima, 1));
    });
  }
  return dados.length;
}
function ultimaComFormula_(sh, col) {
  const f = sh.getRange(1, col, sh.getMaxRows(), 1).getFormulas();
  for (let i = f.length - 1; i >= 0; i--) if (f[i][0]) return i + 1;
  return 0;
}
/* notas da aba Sem Imposto → histórico (sem repetir; atualiza vendedor/valor do mês corrente) */
function guardarHistorico_(ss, marca) {
  const si = ss.getSheetByName(ROBO.ABA_DOC[marca]); if (!si) return;
  const lr = si.getLastRow(); if (lr < 1) return;
  const v = si.getRange(1, 1, lr, Math.min(si.getMaxColumns(), ROBO.SI.valor + 1)).getValues();
  const notas = [];
  v.forEach(r => {
    if (Number(r[ROBO.SI.flag]) !== 1) return;
    let d = r[ROBO.SI.data]; if (!(d instanceof Date)) { const x = dataBR(d); if (!x) return; d = new Date(x.ano, x.mes - 1, x.dia); }
    const vend = String(r[ROBO.SI.vend] || '').trim();
    notas.push([marca, d.getFullYear(), d.getMonth() + 1, d.getDate(), String(r[ROBO.SI.doc]).trim(), String(r[ROBO.SI.cliente] || '').trim(),
      (!vend || vend.charAt(0) === '#') ? 'SEM VENDEDOR' : vend, Math.round(numBR(r[ROBO.SI.valor]) * 100)]);
  });
  if (!notas.length) return;
  const h = aba_(ss, ROBO.ABA_HIST, ROBO.CAB_HIST);
  const hv = h.getLastRow() > 1 ? h.getRange(2, 1, h.getLastRow() - 1, 8).getValues() : [];
  const chave = r => semAcento(r[0]) + '|' + Number(r[1]) + '|' + Number(r[2]) + '|' + String(r[4]).trim();
  // os meses que estão na aba Sem Imposto passam a valer como estão lá (nota cancelada sai do histórico)
  const meses = {}, novasK = {}; notas.forEach(n => { meses[n[1] * 100 + n[2]] = 1; novasK[chave(n)] = 1; });
  const fica = hv.filter(r => Number(r[1]) > 2000 && !(semAcento(r[0]) === marca && meses[Number(r[1]) * 100 + Number(r[2])]));
  const vistos = {}; fica.forEach(r => { vistos[chave(r)] = 1; });
  const tudo = fica.concat(notas.filter(n => !vistos[chave(n)]));
  if (h.getMaxRows() < tudo.length + 1) h.insertRowsAfter(h.getMaxRows(), tudo.length + 1 - h.getMaxRows() + 100);
  if (hv.length) h.getRange(2, 1, hv.length, 8).clearContent();
  h.getRange(2, 1, tudo.length, 8).setValues(tudo);
}
/* itens: substitui as linhas da mesma marca dentro das datas do arquivo; busca o vendedor pela nota */
function gravarItens_(ss, rows, c) {
  const itens = extrairItens(rows, c.marca);
  if (!itens.length) throw new Error('nenhum item encontrado no relatório');
  const vend = {}, porCliente = {}; // nota → vendedor; reserva: vendedor mais recente do cliente
  const codCli = s => (/^(\d+)/.exec(String(s).trim()) || [])[1] || '';
  const h = ss.getSheetByName(ROBO.ABA_HIST);
  if (h && h.getLastRow() > 1) h.getRange(2, 1, h.getLastRow() - 1, 8).getValues()
    .sort((x, y) => (Number(x[1]) * 100 + Number(x[2])) - (Number(y[1]) * 100 + Number(y[2])))
    .forEach(r => { if (semAcento(r[0]) !== c.marca) return; const v = String(r[6]).trim(); vend[String(r[4]).trim()] = v;
      const k = codCli(r[5]); if (k && v && v !== 'SEM VENDEDOR') porCliente[k] = v; });
  const si = ss.getSheetByName(ROBO.ABA_DOC[c.marca]);
  if (si && si.getLastRow() > 0) si.getRange(1, 1, si.getLastRow(), ROBO.SI.vend + 1).getValues().forEach(r => { const d = String(r[ROBO.SI.doc]).trim(), v = String(r[ROBO.SI.vend] || '').trim(); if (d && v && v.charAt(0) !== '#') vend[d] = v; });
  itens.forEach(i => { i[14] = vend[i[4]] || porCliente[i[6]] || ''; });
  const sh = aba_(ss, ROBO.ABA_ITENS, ROBO.CAB_ITENS);
  const old = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, ROBO.CAB_ITENS.length).getValues() : [];
  const dentro = r => { const k = Number(r[1]) * 10000 + Number(r[2]) * 100 + Number(r[3]); return semAcento(r[0]) === c.marca && k >= c.min && k <= c.max; };
  const fica = old.filter(r => r[0] !== '' && !dentro(r));
  const tudo = fica.concat(itens).sort((a, b) => (a[1] * 10000 + a[2] * 100 + a[3]) - (b[1] * 10000 + b[2] * 100 + b[3]) || String(a[0]).localeCompare(String(b[0])));
  if (sh.getMaxRows() < tudo.length + 1) sh.insertRowsAfter(sh.getMaxRows(), tudo.length + 1 - sh.getMaxRows() + 100);
  sh.getRange(2, 1, Math.max(old.length, 1), ROBO.CAB_ITENS.length).clearContent();
  sh.getRange(2, 1, tudo.length, ROBO.CAB_ITENS.length).setValues(tudo);
  return itens.length;
}

/* ================= utilidades ================= */
function lerArquivo_(f) {
  const tipo = f.getMimeType();
  if (tipo === MimeType.GOOGLE_SHEETS) return SpreadsheetApp.openById(f.getId()).getSheets()[0].getDataRange().getDisplayValues();
  if (!/csv|text|octet-stream|excel/i.test(tipo) && !/\.(csv|txt)$/i.test(f.getName())) throw new Error('formato não suportado (' + tipo + '). Exporte em CSV.');
  const b = f.getBlob(), txt = decodificar(b.getDataAsString('UTF-8'), b.getDataAsString('ISO-8859-1'));
  return Utilities.parseCsv(txt.replace(/^﻿/, ''), separadorCSV(txt));
}
function pegarPasta_(pai, nome) { const it = pai.getFoldersByName(nome); return it.hasNext() ? it.next() : pai.createFolder(nome); }
function aba_(ss, nome, cab) {
  let sh = ss.getSheetByName(nome);
  if (!sh) { sh = ss.insertSheet(nome); sh.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold'); sh.setFrozenRows(1); }
  return sh;
}
function log_(linha) {
  const ss = SpreadsheetApp.getActive(), sh = aba_(ss, ROBO.ABA_LOG, ['DATA/HORA', 'ARQUIVO', 'RELATÓRIO', 'MARCA', 'DATAS NO ARQUIVO', 'LINHAS', 'RESULTADO']);
  sh.insertRowAfter(1); sh.getRange(2, 1, 1, linha.length).setValues([linha]);
}

/* testes fora do Google (node) */
if (typeof module !== 'undefined') module.exports = { classificar, extrairItens, converter, numBR, dataBR, marcaDe, separadorCSV };
