/* =====================================================================
   ROBÔ DE E-MAILS · Plataforma Comercial Naturalle (Google Apps Script)

   O que faz
   • A cada 10 minutos: envia a fila de e-mails da plataforma (novo
     encaminhamento, lembrete manual, ata da reunião).
   • Todo dia às 7h: lembra cada responsável dos encaminhamentos que vencem
     nos próximos dias e cobra os atrasados. No dia escolhido, manda o
     resumo semanal para a gestão.

   Como instalar (uma vez, 5 minutos) · passo a passo também no LEIA-ME.md
   1. Entre em script.google.com com a MESMA conta Google dona do projeto Firebase.
   2. Novo projeto → cole este arquivo inteiro em Código.gs.
   3. Configurações do projeto → marque "Mostrar arquivo appsscript.json" → cole o
      conteúdo de appsscript.json desta pasta.
   4. Troque PROJETO abaixo pelo projectId do Firebase.
   5. Rode a função instalar() uma vez e autorize. Pronto.
   ===================================================================== */
const PROJETO = 'COLE_AQUI_O_PROJECT_ID';
const URL_PLATAFORMA = 'https://pedroarthur-del.github.io/Painel-de-vendas-Naturalle/plataforma/';
const REMETENTE = 'Plataforma Naturalle';

/* ---------- instalação dos horários ---------- */
function instalar() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('enviarFila').timeBased().everyMinutes(10).create();
  ScriptApp.newTrigger('lembretesDiarios').timeBased().atHour(7).everyDays(1).inTimezone('America/Fortaleza').create();
  enviarFila();
  Logger.log('Robô instalado. Fila a cada 10 min e lembretes todo dia às 7h.');
}

/* ---------- fila ---------- */
function enviarFila() {
  const pend = listar_('mail').filter(m => m.status === 'pendente').slice(0, 60);
  pend.forEach(m => {
    try {
      if (!/^[^@\s]+@[^@\s]+$/.test(m.para || '')) throw new Error('e-mail inválido');
      MailApp.sendEmail({ to: m.para, subject: m.assunto || 'Plataforma Naturalle', htmlBody: m.html || '', name: REMETENTE });
      patch_('mail', m.id, { status: 'enviado', enviadoEm: new Date().toISOString() });
    } catch (e) {
      patch_('mail', m.id, { status: 'erro', erro: String(e).slice(0, 300) });
    }
  });
}

/* ---------- lembretes do dia e resumo semanal ---------- */
function lembretesDiarios() {
  const cfg = obter_('config', 'automacoes') || {};
  if (!cfg.ativo) return;
  const hoje = hojeISO_(), dias = Number(cfg.diasAntes || 2);
  const pessoas = listar_('pessoas'), emailDe = nome => { const p = pessoas.find(x => norm_(x.nome) === norm_(nome)); return p && p.ativo !== false ? String(p.email || '').toLowerCase() : ''; };
  const abertas = listar_('tarefas').filter(t => t.status !== 'concluido');
  const porPessoa = {};
  abertas.forEach(t => {
    if (!t.prazo) return;
    const d = diff_(hoje, t.prazo), em = String(t.respEmail || emailDe(t.resp) || '').toLowerCase();
    if (!em) return;
    if ((d >= 0 && d <= dias) || (d < 0 && cfg.atrasadas)) (porPessoa[em] = porPessoa[em] || []).push({ ...t, d });
  });
  let enviados = 0;
  Object.keys(porPessoa).forEach(em => {
    const ts = porPessoa[em].sort((a, b) => a.d - b.d), nome = ts[0].resp || '';
    const linhas = ts.map(t => `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${esc_(t.titulo)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;white-space:nowrap;color:${t.d < 0 ? '#B23A3A' : '#2A1F17'}">${t.d < 0 ? (-t.d) + ' dia(s) de atraso' : t.d === 0 ? 'vence hoje' : 'vence em ' + t.d + ' dia(s)'}</td></tr>`).join('');
    MailApp.sendEmail({ to: em, name: REMETENTE, subject: `Seus encaminhamentos: ${ts.filter(t => t.d < 0).length} atrasado(s), ${ts.filter(t => t.d >= 0).length} vencendo`,
      htmlBody: casca_(`Olá, ${esc_(String(nome).split(' ')[0])}!`, `<p>Estes encaminhamentos estão no seu nome:</p><table style="border-collapse:collapse;width:100%;font-size:14px">${linhas}</table>`) });
    enviados++;
  });
  const dow = Number(Utilities.formatDate(new Date(), 'America/Fortaleza', 'u')) % 7; // 1=segunda … 7=domingo → 0
  let resumo = '';
  if (cfg.resumoSemanal && Number(cfg.diaResumo) === dow && (cfg.destinatarios || []).length) {
    const atras = abertas.filter(t => t.prazo && diff_(hoje, t.prazo) < 0), semana = abertas.filter(t => t.prazo && diff_(hoje, t.prazo) >= 0 && diff_(hoje, t.prazo) <= 7);
    const conc = listar_('tarefas').filter(t => t.status === 'concluido' && t.concluidoEm && diff_(t.concluidoEm.slice(0, 10), hoje) <= 7);
    const lista = arr => arr.map(t => `<li>${esc_(t.titulo)} · <b>${esc_(t.resp || 'sem responsável')}</b>${t.prazo ? ' · ' + t.prazo.split('-').reverse().join('/') : ''}</li>`).join('') || '<li>nenhum</li>';
    MailApp.sendEmail({ to: cfg.destinatarios.join(','), name: REMETENTE, subject: `Resumo da semana: ${atras.length} atrasado(s), ${semana.length} vencendo, ${conc.length} concluído(s)`,
      htmlBody: casca_('Resumo semanal dos encaminhamentos', `<p><b>${abertas.length}</b> em aberto · <b>${conc.length}</b> concluídos nos últimos 7 dias.</p><h3 style="font-size:15px">Atrasados</h3><ul>${lista(atras)}</ul><h3 style="font-size:15px">Vencem nos próximos 7 dias</h3><ul>${lista(semana)}</ul>`) });
    resumo = ' + resumo semanal';
  }
  patch_('config', 'automacoes', { ultimaExecucao: new Date().toISOString(), ultimoResultado: `${enviados} lembrete(s)${resumo}` });
}

/* ---------- utilidades ---------- */
function casca_(titulo, corpo) {
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#2A1F17"><div style="background:#2B1A10;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0;font-weight:bold">Naturalle · Plataforma comercial</div><div style="border:1px solid #E6DCCD;border-top:0;padding:20px;border-radius:0 0 12px 12px"><h2 style="margin:0 0 12px;font-size:18px">${titulo}</h2>${corpo}<p style="margin-top:22px"><a href="${URL_PLATAFORMA}#encaminhamentos" style="background:#A15F1D;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold">Abrir a plataforma</a></p></div></div>`;
}
const esc_ = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const norm_ = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase().replace(/\s+/g, ' ');
const hojeISO_ = () => Utilities.formatDate(new Date(), 'America/Fortaleza', 'yyyy-MM-dd');
const diff_ = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);

/* ---------- Firestore (REST), com a conta dona do projeto ---------- */
function base_() { return `https://firestore.googleapis.com/v1/projects/${PROJETO}/databases/(default)/documents`; }
function api_(metodo, caminho, corpo) {
  const r = UrlFetchApp.fetch(base_() + caminho, { method: metodo, contentType: 'application/json', payload: corpo ? JSON.stringify(corpo) : undefined, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  const c = r.getResponseCode(); if (c === 404) return null; if (c >= 300) throw new Error('Firestore ' + c + ': ' + r.getContentText().slice(0, 300));
  return JSON.parse(r.getContentText() || '{}');
}
function listar_(col) {
  const out = []; let tk = '';
  do { const j = api_('get', `/${col}?pageSize=300${tk ? '&pageToken=' + encodeURIComponent(tk) : ''}`) || {}; (j.documents || []).forEach(d => out.push({ id: d.name.split('/').pop(), ...dec_(d.fields || {}) })); tk = j.nextPageToken || ''; } while (tk);
  return out;
}
function obter_(col, id) { const d = api_('get', `/${col}/${id}`); return d ? { id, ...dec_(d.fields || {}) } : null; }
function patch_(col, id, campos) {
  const mask = Object.keys(campos).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&'), fields = {};
  Object.keys(campos).forEach(k => fields[k] = enc_(campos[k]));
  api_('patch', `/${col}/${id}?${mask}`, { fields });
}
function dec_(f) { const o = {}; Object.keys(f).forEach(k => o[k] = val_(f[k])); return o; }
function val_(v) {
  if ('stringValue' in v) return v.stringValue; if ('integerValue' in v) return Number(v.integerValue); if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue; if ('nullValue' in v) return null; if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(val_); if ('mapValue' in v) return dec_(v.mapValue.fields || {}); return null;
}
function enc_(v) {
  if (v === null || v === undefined) return { nullValue: null }; if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc_) } };
  if (typeof v === 'object') { const f = {}; Object.keys(v).forEach(k => f[k] = enc_(v[k])); return { mapValue: { fields: f } }; }
  return { stringValue: String(v) };
}
