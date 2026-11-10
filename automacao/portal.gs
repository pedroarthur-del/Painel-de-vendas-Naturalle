/* =====================================================================
   PORTAL · API segura do painel de vendas Naturalle (Google Apps Script)

   O painel (GitHub Pages) não lê mais a planilha publicada na web. Ele pede os dados
   a esta API, que roda com a conta dona da planilha:
     • equipe (gestão/consultoria): usuário "equipe" + senha da equipe → todas as abas;
     • vendedor: usuário (ex.: "allyson") + chave individual → SÓ as linhas dele, e só as
       colunas que o painel usa. Faturamento da empresa, outros vendedores, totais de
       relatório: nada disso sai do servidor para o vendedor.

   Segurança
     • senhas guardadas como hash (SHA-256 iterado com sal) nas Propriedades do script;
     • sessão por token assinado (HMAC-SHA256) com validade; trocar a chave do vendedor
       ou a senha da equipe derruba as sessões antigas;
     • bloqueio por tentativas erradas (5 erros → 15 min);
     • a planilha deixa de ser publicada na web; o vendedor nunca recebe o link dela.

   Implantar: Implantar → Nova implantação → App da Web → Executar como: eu →
   Quem pode acessar: qualquer pessoa. Primeira vez: rode portalInstalar() no editor.
   ===================================================================== */
const PORTAL = {
  ABAS: {
    vendas: 'Vendas', vendasN: 'Vendas Naturalle', vendasS: 'Vendas Selecto',
    semN: 'Sem Imposto Naturalle', semS: 'Sem Imposto Selecto',
    hist: 'Carteira mes anterior', corr: 'Corridinha do Sorvete', itens: 'Itens',
  },
  ABA_METAS: 'Metas do painel',
  CAB_METAS: ['ANO', 'MES', 'GRUPO', 'VENDEDOR', 'META', 'ATUALIZADO EM', 'POR'],
  SI: { cliente: 25, doc: 50, data: 51, vend: 54, flag: 55, valor: 56 }, // colunas que o painel usa na aba Sem Imposto
  ITER: 2000,               // voltas do hash de senha
  CACHE_S: 21600,           // pacotes prontos ficam no cache até 6 h (o gatilho renova a cada 10 min)
  SESSAO_H: 12,             // validade da sessão sem "lembrar"
  LEMBRAR_D: 30,            // validade com "lembrar neste aparelho"
  ERROS_MAX: 5, BLOQUEIO_S: 900,
};
const VENDEDORES_PADRAO = {
  allyson: { nome: 'Allyson', linhas: ['ALLYSON'], corr: 'Allyson' },
  genesia: { nome: 'Genésia', linhas: ['GENESIA'], corr: 'Genésia' },
  laudemir: { nome: 'Laudemir', linhas: ['LAUDEMIR'], corr: 'Laudemir' },
  raimundo: { nome: 'Raimundo Jr', linhas: ['RAIMUNDO JR'], corr: 'Raimundo Jr' },
  rebeca: { nome: 'Rebeca', linhas: ['REBECA'], corr: 'Rebeca' },
  rodrigo: { nome: 'Rodrigo', linhas: ['RODRIGO', 'RODRIGO SORVETES'], corr: 'Rodrigo' },
  paulo: { nome: 'Paulo Sérgio', linhas: ['PAULO SERGIO'], corr: '' },
};

/* ================= entrada HTTP ================= */
function doGet() { return portalJson_({ ok: true, servico: 'portal-naturalle' }); }
function doPost(e) {
  let pedido = {};
  try { pedido = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return portalJson_({ ok: false, erro: 'pedido inválido' }); }
  try { return portalJson_(portalRotear_(pedido)); }
  catch (err) {
    const msg = String(err && err.message || err);
    const publico = /^(PORTAL:)/.test(msg) ? msg.replace('PORTAL:', '') : 'erro interno';
    if (!/^PORTAL:/.test(msg)) console.error(err);
    return portalJson_({ ok: false, erro: publico });
  }
}
function portalJson_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function portalFalha_(msg) { throw new Error('PORTAL:' + msg); }

function portalRotear_(p) {
  const acao = String(p.acao || '');
  if (acao === 'saude') return { ok: true, versao: 3, agora: new Date().toISOString() };
  if (acao === 'login') return portalLogin_(p);
  const s = portalSessao_(p.t); // lança se inválida
  if (acao === 'eu') return { ok: true, papel: s.papel, nome: s.nome, id: s.u };
  if (acao === 'dados') { if (p.forcar && s.papel === 'equipe') portalPreaquecer(); return { ok: true, papel: s.papel, nome: s.nome, id: s.u, gz: portalAbasGz_(s), extra: portalExtra_(s) }; }
  if (s.papel !== 'equipe') portalFalha_('sem permissão');
  // ---- só equipe ----
  if (acao === 'metaSalvar') return portalMetaSalvar_(p, s);
  if (acao === 'vendedores') return { ok: true, lista: portalVendedoresPublico_() };
  if (acao === 'vendedorSalvar') return portalVendedorSalvar_(p);
  if (acao === 'vendedorChave') return portalVendedorChave_(p);
  if (acao === 'vendedorBloquear') return portalVendedorBloquear_(p);
  if (acao === 'equipeSenha') return portalEquipeSenha_(p);
  if (acao === 'remunSalvar') return portalRemunSalvar_(p);
  if (acao === 'feriadosSalvar') return portalFeriadosSalvar_(p);
  portalFalha_('ação desconhecida');
}

/* ================= senhas, tokens, bloqueio ================= */
function portalProps_() { return PropertiesService.getScriptProperties(); }
function portalLerJson_(k, padrao) { try { const v = portalProps_().getProperty(k); return v ? JSON.parse(v) : padrao; } catch (e) { return padrao; } }
function portalGravarJson_(k, v) { portalProps_().setProperty(k, JSON.stringify(v)); }
function portalSegredo_() {
  const s = portalProps_().getProperty('PORTAL_SEGREDO');
  if (!s) portalFalha_('portal não instalado');
  return s;
}
function portalAleatorio_(n) {
  let s = ''; while (s.length < n) s += Utilities.getUuid().replace(/-/g, '');
  return s.slice(0, n);
}
function portalHash_(senha, sal) {
  const U = Utilities, salB = U.newBlob(sal).getBytes();
  let h = U.computeDigest(U.DigestAlgorithm.SHA_256, sal + '|' + senha, U.Charset.UTF_8);
  for (let i = 0; i < PORTAL.ITER; i++) h = U.computeDigest(U.DigestAlgorithm.SHA_256, h.concat(salB));
  return U.base64Encode(h);
}
function portalIguais_(a, b) { a = String(a); b = String(b); if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
const portalNormSenhaEquipe_ = v => String(v || '').trim().toUpperCase().replace(/\s+/g, '');
const portalNormChave_ = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const portalNormU_ = v => String(v || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

function portalTokenCriar_(o) {
  const corpo = Utilities.base64EncodeWebSafe(JSON.stringify(o), Utilities.Charset.UTF_8);
  const ass = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(corpo, portalSegredo_()));
  return corpo + '.' + ass;
}
function portalSessao_(t) {
  const partes = String(t || '').split('.');
  if (partes.length !== 2) portalFalha_('sessão expirada');
  const ass = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(partes[0], portalSegredo_()));
  if (!portalIguais_(ass, partes[1])) portalFalha_('sessão expirada');
  let o; try { o = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(partes[0])).getDataAsString('UTF-8')); } catch (e) { portalFalha_('sessão expirada'); }
  if (!o.exp || Date.now() > o.exp) portalFalha_('sessão expirada');
  if (o.p === 'equipe') {
    const eq = portalLerJson_('PORTAL_EQUIPE', null);
    if (!eq || eq.ver !== o.v) portalFalha_('sessão expirada');
    return { papel: 'equipe', u: 'equipe', nome: 'Equipe' };
  }
  const reg = portalLerJson_('PORTAL_VENDEDORES', {}), v = reg[o.u];
  if (!v || v.ativo === false || !v.hash || v.ver !== o.v) portalFalha_('sessão expirada');
  return { papel: 'vendedor', u: o.u, nome: v.nome, linhas: v.linhas || [], corr: v.corr || '' };
}
function portalBloqueado_(u) {
  const c = CacheService.getScriptCache(), n = Number(c.get('ERR:' + u) || 0);
  return n >= PORTAL.ERROS_MAX;
}
function portalErro_(u) {
  const c = CacheService.getScriptCache(), k = 'ERR:' + u, n = Number(c.get(k) || 0) + 1;
  c.put(k, String(n), PORTAL.BLOQUEIO_S);
}
function portalLogin_(p) {
  const u = portalNormU_(p.u) || 'equipe';
  if (portalBloqueado_(u)) portalFalha_('muitas tentativas erradas; aguarde 15 minutos');
  Utilities.sleep(300 + Math.floor(Math.random() * 300)); // dificulta tentativa em massa
  const dur = p.lembrar ? PORTAL.LEMBRAR_D * 864e5 : PORTAL.SESSAO_H * 36e5;
  if (u === 'equipe') {
    const eq = portalLerJson_('PORTAL_EQUIPE', null);
    if (!eq) portalFalha_('portal não instalado');
    if (!portalIguais_(portalHash_(portalNormSenhaEquipe_(p.s), eq.sal), eq.hash)) { portalErro_(u); portalFalha_('usuário ou senha incorretos'); }
    CacheService.getScriptCache().remove('ERR:' + u);
    return { ok: true, papel: 'equipe', nome: 'Equipe', id: 'equipe', t: portalTokenCriar_({ p: 'equipe', u: 'equipe', v: eq.ver, exp: Date.now() + dur }) };
  }
  const reg = portalLerJson_('PORTAL_VENDEDORES', {}), v = reg[u];
  if (!v || v.ativo === false || !v.hash || !portalIguais_(portalHash_(portalNormChave_(p.s), v.sal), v.hash)) { portalErro_(u); portalFalha_('usuário ou senha incorretos'); }
  CacheService.getScriptCache().remove('ERR:' + u);
  v.ultimoAcesso = new Date().toISOString(); reg[u] = v; portalGravarJson_('PORTAL_VENDEDORES', reg);
  return { ok: true, papel: 'vendedor', nome: v.nome, id: u, t: portalTokenCriar_({ p: 'v', u: u, v: v.ver, exp: Date.now() + dur }) };
}

/* ================= dados ================= */
const portalNorm_ = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ').toUpperCase();
function portalUltimaLinha_(sh) {
  const n = sh.getLastRow(); if (n < 1) return 0;
  const a = sh.getRange(1, 1, n, 1).getDisplayValues();
  for (let i = a.length - 1; i >= 0; i--) if (String(a[i][0]).trim() !== '') return i + 1;
  return 0;
}
function portalLerAba_(ss, nome, maxCol) {
  const sh = ss.getSheetByName(nome); if (!sh) return [];
  const n = portalUltimaLinha_(sh), c = Math.min(sh.getLastColumn(), maxCol || 60);
  if (!n || !c) return [];
  return sh.getRange(1, 1, n, c).getDisplayValues();
}
function portalMetasLinhas_(ss) {
  const sh = ss.getSheetByName(PORTAL.ABA_METAS); if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues()
    .filter(r => Number(r[0]) > 2000 && Number(r[1]) >= 1 && r[4] !== '' && r[4] != null)
    .map(r => ({ ano: Number(r[0]), mes: Number(r[1]), grupo: String(r[2] || '__all'), vend: String(r[3] || '__all'), meta: Number(r[4]) || 0 }));
}
function portalLerTudo_() {
  const ss = SpreadsheetApp.getActive(), A = PORTAL.ABAS, abas = {};
  Object.keys(A).forEach(k => { abas[k] = portalLerAba_(ss, A[k], k === 'semN' || k === 'semS' ? 57 : 40); });
  return abas;
}
/* abas de cada perfil: equipe recebe tudo; vendedor só o que é dele (linhas e colunas) */
function portalAbasDe_(abas, s) {
  if (s.papel === 'equipe') return abas;
  const meu = {}; (s.linhas || []).forEach(l => { meu[portalNorm_(l)] = 1; });
  const ehMeu = v => !!meu[portalNorm_(v)];
  const out = {};
  ['vendas', 'vendasN', 'vendasS'].forEach(k => { out[k] = portalFiltrarVendas_(abas[k], ehMeu); });
  ['semN', 'semS'].forEach(k => {
    const SI = PORTAL.SI, manter = [SI.cliente, SI.doc, SI.data, SI.vend, SI.flag, SI.valor];
    out[k] = (abas[k] || []).filter(r => ehMeu(r[SI.vend])).map(r => r.map((x, i) => manter.indexOf(i) >= 0 ? x : ''));
  });
  ['hist', 'itens'].forEach(k => {
    const rows = abas[k] || []; if (!rows.length) { out[k] = []; return; }
    const iv = rows[0].map(portalNorm_).indexOf('VENDEDOR');
    out[k] = iv < 0 ? [] : [rows[0]].concat(rows.slice(1).filter(r => ehMeu(r[iv])));
  });
  const rows = abas.corr || [];
  if (rows.length) {
    const h = rows[0].map(portalNorm_), ip = h.indexOf('PARTICIPANTE'), il = h.indexOf('LINHAS NA ABA VENDAS'), nCols = 7, corrMeu = portalNorm_(s.corr);
    out.corr = [rows[0].slice(0, nCols)].concat(rows.slice(1).filter(r => {
      if (corrMeu && ip >= 0 && portalNorm_(r[ip]) === corrMeu) return true;
      if (il < 0) return false;
      const ls = String(r[il] || '').split('+').map(portalNorm_).filter(Boolean);
      return ls.length > 0 && ls.every(x => meu[x]);
    }).map(r => r.slice(0, nCols)));
  } else out.corr = [];
  return out;
}
/* metas, regras de comissão e feriados: pequenos, lidos na hora (mudança aparece na hora) */
function portalExtra_(s) {
  let metas = portalMetasLinhas_(SpreadsheetApp.getActive());
  const remun = portalLerJson_('PORTAL_REMUN', null), feriados = portalLerJson_('PORTAL_FERIADOS', {});
  if (s.papel === 'equipe') return { metas, remun, feriados, em: portalProps_().getProperty('PORTAL_PRONTO_EM') || '' };
  const meu = {}; (s.linhas || []).forEach(l => { meu[portalNorm_(l)] = 1; });
  metas = metas.filter(m => m.vend !== '__all' && meu[portalNorm_(m.vend)]);
  return { metas, feriados, vendedor: { id: s.u, nome: s.nome, linhas: s.linhas }, remun: remun && remun.publicada ? portalRemunDoVendedor_(remun, s.linhas) : null, em: portalProps_().getProperty('PORTAL_PRONTO_EM') || '' };
}
/* usado nos testes: monta o pacote completo de um perfil */
function portalMontar_(s) {
  const abas = portalAbasDe_(portalLerTudo_(), s);
  return Object.assign({ v: 4, papel: s.papel, abas }, portalExtra_(s));
}
function portalFiltrarVendas_(rows, ehMeu) {
  return (rows || []).map(r => {
    const a = portalNorm_(r[0]);
    if (!a || /^PERIODO/.test(a) || a === 'VENDEDOR' || /^DIGITE/.test(a)) return r;
    if (/^TOTAL/.test(a)) return [r[0]];        // marca o fim do grupo, sem números
    return ehMeu(r[0]) ? r : null;
  }).filter(Boolean);
}
function portalRemunDoVendedor_(rg, linhas) {
  const ind = {}; (linhas || []).forEach(l => { const k = portalNorm_(l); if (rg.individuais && rg.individuais[k]) ind[k] = rg.individuais[k]; });
  return { publicada: true, vendedor: rg.vendedor, individuais: ind, observacao: rg.observacao || '' };
}
function portalGz_(o) { return Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(o), 'application/json', 'd.json')).getBytes()); }
function portalCacheGravar_(chave, txt) {
  const cache = CacheService.getScriptCache(), partes = {}, TAM = 90000; let n = 0;
  for (let i = 0; i < txt.length; i += TAM) partes[chave + ':' + (n++)] = txt.slice(i, i + TAM);
  partes[chave + ':n'] = String(n);
  cache.putAll(partes, PORTAL.CACHE_S);
}
function portalCacheLer_(chave) {
  const cache = CacheService.getScriptCache(), n = Number(cache.get(chave + ':n') || 0);
  if (!n) return null;
  const ks = []; for (let i = 0; i < n; i++) ks.push(chave + ':' + i);
  const got = cache.getAll(ks); return ks.every(k => got[k] != null) ? ks.map(k => got[k]).join('') : null;
}
/* lê a planilha uma vez e deixa pronto o pacote da equipe e o de cada vendedor liberado.
   Roda pelo gatilho de 10 em 10 min, depois de cada importação e no "Atualizar dados" da equipe. */
function portalPreaquecer() {
  const lock = LockService.getDocumentLock(); if (!lock.tryLock(60000)) return;
  try {
    const abas = portalLerTudo_(), reg = portalLerJson_('PORTAL_VENDEDORES', {});
    portalCacheGravar_('ABAS:equipe', portalGz_({ v: 4, abas }));
    Object.keys(reg).forEach(id => { const v = reg[id]; if (v.ativo === false || !v.hash) return;
      portalCacheGravar_('ABAS:' + id, portalGz_({ v: 4, abas: portalAbasDe_(abas, { papel: 'vendedor', u: id, linhas: v.linhas, corr: v.corr }) })); });
    portalProps_().setProperty('PORTAL_PRONTO_EM', new Date().toISOString());
  } finally { lock.releaseLock(); }
}
function portalAbasGz_(s) {
  const chave = 'ABAS:' + s.u;
  let gz = portalCacheLer_(chave);
  if (gz) return gz;
  gz = portalGz_({ v: 4, abas: portalAbasDe_(portalLerTudo_(), s) });
  try { portalCacheGravar_(chave, gz); } catch (e) { }
  return gz;
}
/* chamado pelo robô depois de importar relatórios: remonta os pacotes com os dados novos */
function portalInvalidar() { try { portalPreaquecer(); } catch (e) { console.error(e); } }

/* ================= metas (gravadas na planilha, valem para todos) ================= */
function portalAbaMetas_(ss) {
  let sh = ss.getSheetByName(PORTAL.ABA_METAS);
  if (!sh) { sh = ss.insertSheet(PORTAL.ABA_METAS); sh.getRange(1, 1, 1, PORTAL.CAB_METAS.length).setValues([PORTAL.CAB_METAS]).setFontWeight('bold'); sh.setFrozenRows(1); }
  return sh;
}
function portalMetaSalvar_(p, s) {
  const ano = Number(p.ano), mes = Number(p.mes), grupo = String(p.grupo || '__all').slice(0, 80), vend = String(p.vend || '__all').slice(0, 80);
  if (!(ano > 2000 && ano < 2100 && mes >= 1 && mes <= 12)) portalFalha_('mês inválido');
  const valor = p.valor == null || p.valor === '' ? null : Number(p.valor);
  if (valor != null && !(valor >= 0 && valor < 1e9)) portalFalha_('valor inválido');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sh = portalAbaMetas_(SpreadsheetApp.getActive());
    const n = sh.getLastRow(), rows = n > 1 ? sh.getRange(2, 1, n - 1, 4).getValues() : [];
    const i = rows.findIndex(r => Number(r[0]) === ano && Number(r[1]) === mes && String(r[2]) === grupo && String(r[3]) === vend);
    if (valor == null) { if (i >= 0) sh.deleteRow(i + 2); }
    else if (i >= 0) sh.getRange(i + 2, 5, 1, 3).setValues([[valor, new Date(), s.nome]]);
    else sh.appendRow([ano, mes, grupo, vend, valor, new Date(), s.nome]);
  } finally { lock.releaseLock(); }
  return { ok: true };
}

/* ================= vendedores (acessos individuais) ================= */
function portalRegistro_() {
  const reg = portalLerJson_('PORTAL_VENDEDORES', null);
  if (reg) return reg;
  const novo = {}; Object.keys(VENDEDORES_PADRAO).forEach(k => { novo[k] = Object.assign({ ativo: false, ver: 0 }, VENDEDORES_PADRAO[k]); });
  portalGravarJson_('PORTAL_VENDEDORES', novo); return novo;
}
function portalVendedoresPublico_() {
  const reg = portalRegistro_();
  return Object.keys(reg).sort().map(k => ({ id: k, nome: reg[k].nome, linhas: reg[k].linhas || [], corr: reg[k].corr || '', ativo: reg[k].ativo !== false && !!reg[k].hash, temChave: !!reg[k].hash, chaveEm: reg[k].chaveEm || '', ultimoAcesso: reg[k].ultimoAcesso || '' }));
}
function portalVendedorSalvar_(p) {
  const id = portalNormU_(p.id); if (!id || id === 'equipe' || id.length > 30) portalFalha_('usuário inválido');
  const linhas = (Array.isArray(p.linhas) ? p.linhas : String(p.linhas || '').split(/[+,;]/)).map(portalNorm_).filter(Boolean).slice(0, 6);
  if (!linhas.length) portalFalha_('informe pelo menos uma linha da aba Vendas');
  const reg = portalRegistro_(), v = reg[id] || { ver: 0, ativo: false };
  v.nome = String(p.nome || id).trim().slice(0, 60); v.linhas = linhas; v.corr = String(p.corr || '').trim().slice(0, 60);
  reg[id] = v; portalGravarJson_('PORTAL_VENDEDORES', reg);
  CacheService.getScriptCache().remove('ABAS:' + id + ':n');
  return { ok: true, lista: portalVendedoresPublico_() };
}
function portalVendedorChave_(p) {
  const id = portalNormU_(p.id), reg = portalRegistro_(), v = reg[id]; if (!v) portalFalha_('vendedor não encontrado');
  const ALF = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let chave = '';
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Utilities.getUuid() + Date.now());
  for (let i = 0; i < 12; i++) chave += ALF[(bytes[i] + 256) % ALF.length];
  v.sal = portalAleatorio_(24); v.hash = portalHash_(chave, v.sal); v.ver = (Number(v.ver) || 0) + 1; v.ativo = true; v.chaveEm = new Date().toISOString();
  reg[id] = v; portalGravarJson_('PORTAL_VENDEDORES', reg);
  try { const c = portalCacheLer_('ABAS:equipe'); if (c) { const abas = JSON.parse(Utilities.newBlob(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(c), 'application/x-gzip'))).getDataAsString()).abas; portalCacheGravar_('ABAS:' + id, portalGz_({ v: 4, abas: portalAbasDe_(abas, { papel: 'vendedor', u: id, linhas: v.linhas, corr: v.corr }) })); } } catch (e) { }
  return { ok: true, id, chave: chave.slice(0, 4) + '-' + chave.slice(4, 8) + '-' + chave.slice(8), lista: portalVendedoresPublico_() };
}
function portalVendedorBloquear_(p) {
  const id = portalNormU_(p.id), reg = portalRegistro_(), v = reg[id]; if (!v) portalFalha_('vendedor não encontrado');
  v.ativo = false; v.hash = ''; v.sal = ''; v.ver = (Number(v.ver) || 0) + 1; reg[id] = v; portalGravarJson_('PORTAL_VENDEDORES', reg);
  return { ok: true, lista: portalVendedoresPublico_() };
}
function portalEquipeSenha_(p) {
  const eq = portalLerJson_('PORTAL_EQUIPE', null);
  if (!eq || !portalIguais_(portalHash_(portalNormSenhaEquipe_(p.atual), eq.sal), eq.hash)) portalFalha_('senha atual incorreta');
  const nova = portalNormSenhaEquipe_(p.nova); if (nova.length < 10) portalFalha_('a nova senha precisa de pelo menos 10 caracteres');
  const sal = portalAleatorio_(24); portalGravarJson_('PORTAL_EQUIPE', { sal, hash: portalHash_(nova, sal), ver: (eq.ver || 0) + 1 });
  return { ok: true };
}
function portalRemunSalvar_(p) {
  const r = p.regras || {}; const num = (x, a, b) => { const n = Number(x); return isFinite(n) && n >= a && n <= b ? n : 0; };
  const faixas = (r.vendedor && r.vendedor.faixas || []).slice(0, 10).map(f => ({ de: num(f.de, 0, 1000), mult: num(f.mult, 0, 10) }));
  const ind = {}; Object.keys(r.individuais || {}).slice(0, 40).forEach(k => { const x = r.individuais[k] || {}; ind[portalNorm_(k)] = { pct: num(x.pct, 0, 100), fixo: num(x.fixo, 0, 1e6) }; });
  portalGravarJson_('PORTAL_REMUN', { publicada: !!r.publicada, vendedor: { pct: num(r.vendedor && r.vendedor.pct, 0, 100), fixo: num(r.vendedor && r.vendedor.fixo, 0, 1e6), bonusMeta: num(r.vendedor && r.vendedor.bonusMeta, 0, 1e6), faixas }, individuais: ind, observacao: String(r.observacao || '').slice(0, 400), em: new Date().toISOString() });
  return { ok: true };
}

function portalFeriadosSalvar_(p) {
  const ano = Number(p.ano), mes = Number(p.mes); if (!(ano > 2000 && mes >= 1 && mes <= 12)) portalFalha_('mês inválido');
  const dias = (Array.isArray(p.dias) ? p.dias : []).map(Number).filter(d => d >= 1 && d <= 31).slice(0, 15);
  const f = portalLerJson_('PORTAL_FERIADOS', {}); if (dias.length) f[ano + '_' + mes] = dias; else delete f[ano + '_' + mes];
  portalGravarJson_('PORTAL_FERIADOS', f);
  return { ok: true };
}

/* ================= instalação e testes (rodar no editor) ================= */
function portalInstalar(senhaEquipe) {
  const P = portalProps_();
  if (!P.getProperty('PORTAL_SEGREDO')) P.setProperty('PORTAL_SEGREDO', portalAleatorio_(64));
  if (senhaEquipe) { const sal = portalAleatorio_(24), eq = portalLerJson_('PORTAL_EQUIPE', { ver: 0 }); portalGravarJson_('PORTAL_EQUIPE', { sal, hash: portalHash_(portalNormSenhaEquipe_(senhaEquipe), sal), ver: (eq.ver || 0) + 1 }); }
  portalRegistro_();
  portalAbaMetas_(SpreadsheetApp.getActive());
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'portalPreaquecer').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('portalPreaquecer').timeBased().everyMinutes(10).create();
  portalPreaquecer();
  Logger.log('Portal pronto. Equipe configurada: ' + !!portalLerJson_('PORTAL_EQUIPE', null));
}

if (typeof module !== 'undefined') module.exports = { portalFiltrarVendas_, portalNorm_, portalMontar_, PORTAL, VENDEDORES_PADRAO };
