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

const PAPEIS_EQUIPE = { admin: 1, gestor: 1, membro: 1, leitor: 1 };
const portalEhEquipe_ = s => s.papel !== 'vendedor';      // vê os dados da empresa inteira
const portalEhAdmin_ = s => s.papel === 'admin';
function portalRotear_(p) {
  const acao = String(p.acao || '');
  if (acao === 'saude') return { ok: true, versao: 6, nuvem: !!portalProps_().getProperty('FB_SA'), agora: new Date().toISOString() };
  if (acao === 'login') return portalLogin_(p);
  const s = portalSessao_(p.t); // lança se inválida
  if (acao === 'eu') return { ok: true, papel: s.papel, nome: s.nome, id: s.u, abas: s.abas };
  if (acao === 'dados') { if (p.forcar && portalEhEquipe_(s)) portalPreaquecer(); return { ok: true, papel: s.papel, nome: s.nome, id: s.u, abas: s.abas, gz: portalAbasGz_(s), extra: portalExtra_(s) }; }
  if (acao === 'minhaSenha') return portalMinhaSenha_(p, s);
  if (acao === 'fbToken') return portalFbToken_(s);
  if (!portalEhEquipe_(s)) portalFalha_('sem permissão');
  // ---- gestão (admin/gestor) ----
  if (acao === 'metaSalvar') { if (!(s.papel === 'admin' || s.papel === 'gestor')) portalFalha_('sem permissão'); return portalMetaSalvar_(p, s); }
  if (acao === 'feriadosSalvar') { if (!(s.papel === 'admin' || s.papel === 'gestor')) portalFalha_('sem permissão'); return portalFeriadosSalvar_(p); }
  if (!portalEhAdmin_(s)) portalFalha_('sem permissão');
  // ---- só administrador ----
  if (acao === 'usuarios') return { ok: true, lista: portalUsuariosPublico_() };
  if (acao === 'usuarioSalvar') return portalUsuarioSalvar_(p);
  if (acao === 'usuarioExcluir') return portalUsuarioExcluir_(p);
  if (acao === 'equipeSenha') return portalEquipeSenha_(p);
  if (acao === 'remunSalvar') return portalRemunSalvar_(p);
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
/* número de celular: só dígitos, sem o 55 do Brasil → DDD + número (10 ou 11 dígitos) */
const portalNormNum_ = v => { let d = String(v || '').replace(/\D/g, ''); if (d.length >= 12 && d.indexOf('55') === 0) d = d.slice(2); if (d.length === 11 || d.length === 10) return d; return ''; };
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
    return { papel: 'admin', u: 'equipe', nome: 'Equipe', abas: null };
  }
  const reg = portalUsuarios_(), v = reg[o.u];
  if (!v || v.ativo === false || !v.hash || v.ver !== o.v) portalFalha_('sessão expirada');
  return portalSessaoDe_(o.u, v);
}
function portalSessaoDe_(num, v) {
  const papel = v.papel === 'vendedor' || PAPEIS_EQUIPE[v.papel] ? v.papel : 'leitor';
  return { papel, u: num, nome: v.nome, linhas: v.linhas || [], corr: v.corr || '', abas: papel === 'vendedor' ? { vendas: true, remuneracao: true } : (papel === 'admin' ? null : (v.abas || {})) };
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
  const u = portalNormNum_(p.u) || portalNormU_(p.u) || 'equipe';
  if (portalBloqueado_(u)) portalFalha_('muitas tentativas erradas; aguarde 15 minutos');
  Utilities.sleep(300 + Math.floor(Math.random() * 300)); // dificulta tentativa em massa
  const dur = p.lembrar ? PORTAL.LEMBRAR_D * 864e5 : PORTAL.SESSAO_H * 36e5;
  if (u === 'equipe') {
    const eq = portalLerJson_('PORTAL_EQUIPE', null);
    if (!eq) portalFalha_('portal não instalado');
    if (!portalIguais_(portalHash_(portalNormSenhaEquipe_(p.s), eq.sal), eq.hash)) { portalErro_(u); portalFalha_('usuário ou senha incorretos'); }
    CacheService.getScriptCache().remove('ERR:' + u);
    return { ok: true, papel: 'admin', nome: 'Equipe', id: 'equipe', abas: null, t: portalTokenCriar_({ p: 'equipe', u: 'equipe', v: eq.ver, exp: Date.now() + dur }) };
  }
  const num = portalNormNum_(p.u);
  const reg = portalUsuarios_(), v = num && reg[num];
  if (!v || v.ativo === false || !v.hash || !portalIguais_(portalHash_(String(p.s || ''), v.sal), v.hash)) { portalErro_(u); portalFalha_('número ou senha incorretos'); }
  CacheService.getScriptCache().remove('ERR:' + u);
  v.ultimoAcesso = new Date().toISOString(); reg[num] = v; portalGravarJson_('PORTAL_USUARIOS', reg);
  const ses = portalSessaoDe_(num, v);
  return { ok: true, papel: ses.papel, nome: v.nome, id: num, abas: ses.abas, t: portalTokenCriar_({ p: 'u', u: num, v: v.ver, exp: Date.now() + dur }) };
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
  if (portalEhEquipe_(s)) return abas;
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
  if (portalEhEquipe_(s)) return { metas, remun, feriados, em: portalProps_().getProperty('PORTAL_PRONTO_EM') || '' };
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
    const abas = portalLerTudo_(), reg = portalUsuarios_();
    portalCacheGravar_('ABAS:equipe', portalGz_({ v: 4, abas }));
    Object.keys(reg).forEach(id => { const v = reg[id]; if (v.papel !== 'vendedor' || v.ativo === false || !v.hash) return;
      portalCacheGravar_('ABAS:' + id, portalGz_({ v: 4, abas: portalAbasDe_(abas, { papel: 'vendedor', u: id, linhas: v.linhas, corr: v.corr }) })); });
    portalProps_().setProperty('PORTAL_PRONTO_EM', new Date().toISOString());
  } finally { lock.releaseLock(); }
  try { if (!portalProps_().getProperty('FB_SA')) portalFirebaseChave(); } catch (e) { console.error(e); }
}
function portalAbasGz_(s) {
  const chave = portalEhEquipe_(s) ? 'ABAS:equipe' : 'ABAS:' + s.u;
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

/* ================= usuários (acesso pelo número do celular corporativo) ================= */
function portalUsuarios_() { return portalLerJson_('PORTAL_USUARIOS', {}); }
function portalUsuariosPublico_() {
  const reg = portalUsuarios_();
  return Object.keys(reg).sort((a, b) => String(reg[a].nome).localeCompare(String(reg[b].nome))).map(k => { const v = reg[k];
    return { numero: k, nome: v.nome, papel: v.papel, abas: v.abas || {}, linhas: v.linhas || [], corr: v.corr || '', ativo: v.ativo !== false && !!v.hash, temSenha: !!v.hash, senhaEm: v.senhaEm || '', ultimoAcesso: v.ultimoAcesso || '' }; });
}
function portalUsuarioSalvar_(p) {
  const num = portalNormNum_(p.numero); if (!num) portalFalha_('número inválido: use DDD + número, ex.: 85 99999-0000');
  const antigo = portalNormNum_(p.numeroAntigo);
  const papel = p.papel === 'vendedor' || PAPEIS_EQUIPE[p.papel] ? p.papel : '';
  if (!papel) portalFalha_('escolha o papel');
  const nome = String(p.nome || '').trim().slice(0, 60); if (!nome) portalFalha_('informe o nome');
  const linhas = (Array.isArray(p.linhas) ? p.linhas : String(p.linhas || '').split(/[+,;]/)).map(portalNorm_).filter(Boolean).slice(0, 6);
  if (papel === 'vendedor' && !linhas.length) portalFalha_('informe a linha do vendedor na aba Vendas (ex.: ALLYSON)');
  const senha = p.senha == null ? '' : String(p.senha);
  if (senha && senha.length < 6) portalFalha_('a senha precisa de pelo menos 6 caracteres');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const reg = portalUsuarios_();
    if (antigo && antigo !== num) { if (reg[num]) portalFalha_('esse número já tem cadastro'); reg[num] = reg[antigo]; delete reg[antigo]; if (reg[num]) reg[num].ver = (Number(reg[num].ver) || 0) + 1; }
    const v = reg[num] || { ver: 0, criadoEm: new Date().toISOString() };
    if (!v.hash && !senha) portalFalha_('crie a senha para esse número');
    const abasOk = {}; ['vendas', 'encaminhamentos', 'planejamento', 'remuneracao'].forEach(a => { if (p.abas && p.abas[a]) abasOk[a] = true; });
    const mudouAcesso = v.papel !== papel || JSON.stringify(v.linhas || []) !== JSON.stringify(papel === 'vendedor' ? linhas : []);
    Object.assign(v, { nome, papel, abas: papel === 'vendedor' || papel === 'admin' ? {} : abasOk, linhas: papel === 'vendedor' ? linhas : [], corr: papel === 'vendedor' ? String(p.corr || '').trim().slice(0, 60) : '', ativo: p.ativo !== false });
    if (senha) { v.sal = portalAleatorio_(24); v.hash = portalHash_(senha, v.sal); v.senhaEm = new Date().toISOString(); }
    if (senha || mudouAcesso || v.ativo === false) v.ver = (Number(v.ver) || 0) + 1; // derruba sessões antigas
    reg[num] = v; portalGravarJson_('PORTAL_USUARIOS', reg);
    CacheService.getScriptCache().remove('ABAS:' + num + ':n');
    if (papel === 'vendedor' && v.ativo) portalPacoteVendedor_(num, v);
  } finally { lock.releaseLock(); }
  return { ok: true, lista: portalUsuariosPublico_() };
}
function portalPacoteVendedor_(num, v) {
  try { const c = portalCacheLer_('ABAS:equipe'); if (!c) return;
    const abas = JSON.parse(Utilities.newBlob(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(c), 'application/x-gzip'))).getDataAsString()).abas;
    portalCacheGravar_('ABAS:' + num, portalGz_({ v: 4, abas: portalAbasDe_(abas, { papel: 'vendedor', u: num, linhas: v.linhas, corr: v.corr }) }));
  } catch (e) { }
}
function portalUsuarioExcluir_(p) {
  const num = portalNormNum_(p.numero), reg = portalUsuarios_(); if (!reg[num]) portalFalha_('número não encontrado');
  delete reg[num]; portalGravarJson_('PORTAL_USUARIOS', reg); CacheService.getScriptCache().remove('ABAS:' + num + ':n');
  return { ok: true, lista: portalUsuariosPublico_() };
}
function portalMinhaSenha_(p, s) {
  const reg = portalUsuarios_(), v = reg[s.u]; if (!v) portalFalha_('use Configurações → Senha da equipe');
  if (!portalIguais_(portalHash_(String(p.atual || ''), v.sal), v.hash)) portalFalha_('senha atual incorreta');
  const nova = String(p.nova || ''); if (nova.length < 6) portalFalha_('a nova senha precisa de pelo menos 6 caracteres');
  v.sal = portalAleatorio_(24); v.hash = portalHash_(nova, v.sal); v.ver = (Number(v.ver) || 0) + 1; v.senhaEm = new Date().toISOString();
  reg[s.u] = v; portalGravarJson_('PORTAL_USUARIOS', reg);
  return { ok: true, t: portalTokenCriar_({ p: 'u', u: s.u, v: v.ver, exp: Date.now() + PORTAL.LEMBRAR_D * 864e5 }) };
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
  portalAbaMetas_(SpreadsheetApp.getActive());
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'portalPreaquecer').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('portalPreaquecer').timeBased().everyMinutes(10).create();
  portalPreaquecer();
  Logger.log('Portal pronto. Equipe configurada: ' + !!portalLerJson_('PORTAL_EQUIPE', null));
}

if (typeof module !== 'undefined') module.exports = { portalFiltrarVendas_, portalNorm_, portalMontar_, PORTAL, VENDEDORES_PADRAO };

/* ================= nuvem (Firebase) =================
   Encaminhamentos, atas, planejamento e pessoas ficam no Firestore (projeto plataforma-naturalle).
   O login continua um só (número + senha, aqui no portal): com a sessão válida, o portal emite um
   "token personalizado" do Firebase com o papel e as abas da pessoa. As regras do Firestore
   (plataforma/firestore.rules) conferem esses dados e o prazo "ate" (3 h; a plataforma renova sozinha).
   Vendedor não recebe token: ele não vê nada do Firestore.
   A chave da conta de serviço fica só nas Propriedades do script (FB_SA), nunca no GitHub.
   Para instalar: baixe a chave (Firebase → Configurações → Contas de serviço → Gerar nova chave privada)
   e solte o .json no Meu Drive. O gatilho de 10 min (ou portalFirebaseChave() no editor) guarda a chave
   e manda o arquivo para a lixeira. */
const FB_PROJETO = 'plataforma-naturalle';
function portalFirebaseChave() {
  const it = DriveApp.searchFiles("title contains 'firebase-adminsdk' and trashed = false");
  while (it.hasNext()) {
    const f = it.next(); if (!/\.json$/i.test(f.getName())) continue;
    let j; try { j = JSON.parse(f.getBlob().getDataAsString('UTF-8')); } catch (e) { continue; }
    if (j.type !== 'service_account' || j.project_id !== FB_PROJETO || !j.private_key || !j.client_email) continue;
    portalGravarJson_('FB_SA', { email: j.client_email, key: j.private_key });
    f.setTrashed(true);
    console.log('Chave do Firebase guardada: ' + j.client_email);
    return true;
  }
  console.log('Nenhum arquivo de chave do Firebase encontrado no Drive.');
  return false;
}
function portalFbToken_(s) {
  if (!portalEhEquipe_(s)) portalFalha_('sem permissão');
  const sa = portalLerJson_('FB_SA', null);
  if (!sa) portalFalha_('nuvem não configurada');
  const agora = Math.floor(Date.now() / 1000), ate = Date.now() + 3 * 36e5;
  const b64 = o => Utilities.base64EncodeWebSafe(typeof o === 'string' ? o : JSON.stringify(o), Utilities.Charset.UTF_8).replace(/=+$/, '');
  const abas = s.abas || { vendas: true, encaminhamentos: true, planejamento: true, remuneracao: true };
  const corpo = {
    iss: sa.email, sub: sa.email, iat: agora, exp: agora + 3600,
    aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
    uid: s.u === 'equipe' ? 'equipe' : 'n' + s.u,
    claims: { papel: s.papel, nome: String(s.nome || '').slice(0, 80), abas: { vendas: !!abas.vendas, encaminhamentos: !!abas.encaminhamentos, planejamento: !!abas.planejamento, remuneracao: !!abas.remuneracao }, ate: ate },
  };
  const entrada = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64(corpo);
  const ass = Utilities.base64EncodeWebSafe(Utilities.computeRsaSha256Signature(entrada, sa.key)).replace(/=+$/, '');
  return { ok: true, token: entrada + '.' + ass, ate: ate, uid: corpo.uid };
}
