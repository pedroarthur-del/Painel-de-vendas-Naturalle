/* =====================================================================
   PLATAFORMA COMERCIAL NATURALLE · v1.0
   Gomes de Matos Consultoria · Consultor Pedro Marques

   Camadas
   1. Núcleo ............ utilidades, formatação, ícones
   2. Dados ............. LocalStore (navegador) e FsStore (Firestore), mesma interface
   3. Acesso ............ papéis, abas por pessoa, bloqueio progressivo, sessão
   4. Moldura ........... menu lateral recolhível, topo, roteador por #hash
   5. Módulos ........... Início · Vendas · Encaminhamentos · Planejamento · Remuneração · Configurações
   6. E-mails ........... fila "mail" no Firestore (o robô do Google Apps Script envia)

   Modos
   • Nuvem (config.js → firebase preenchido): e-mail e senha de cada pessoa, dados
     compartilhados em tempo real, regras de acesso no servidor (firestore.rules).
   • Equipe (firebase: null): senha da equipe, dados salvos só neste navegador.
   ===================================================================== */
(function () {
  "use strict";
  const CFG = window.PLATAFORMA || {};
  const KEY = "naturalle-plataforma";
  const CHAVE_PAINEL = "naturalle_painel_chave"; // mesma chave que o painel de vendas usa para abrir sozinho

  /* =================================================================
     1. NÚCLEO
     ================================================================= */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const norm = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase().replace(/\s+/g, " ");
  const normEmail = e => String(e || "").trim().toLowerCase();
  const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
  const str = (v, n = 200) => String(v ?? "").replace(/[\u0000-\u0008\u000B-\u001F]/g, "").trim().slice(0, n);
  const sum = (a, f) => a.reduce((s, x) => s + (+f(x) || 0), 0);
  const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const BRL2 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nBR = (v, d = 0) => (+v || 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const brlMil = v => Math.abs(v) >= 1e6 ? "R$ " + nBR(v / 1e6, 2) + " mi" : "R$ " + nBR(v / 1e3, 1) + " mil";
  const parseValor = t => { const s = String(t || "").replace(/[^\d,.-]/g, ""); if (!s) return null; const v = /,\d{1,2}$/.test(s) ? +s.replace(/\./g, "").replace(",", ".") : +s.replace(/[.,]/g, ""); return isFinite(v) ? v : null; };
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const MESES_L = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const hojeISO = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
  const dataBR = iso => iso ? iso.slice(0, 10).split("-").reverse().join("/") : "";
  const diasAte = iso => iso ? Math.round((new Date(iso.slice(0, 10) + "T12:00:00") - new Date(hojeISO() + "T12:00:00")) / 864e5) : null;
  const relTempo = iso => { if (!iso) return ""; const m = Math.round((Date.now() - new Date(iso)) / 6e4); return m < 1 ? "agora" : m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} d`; };
  const iniciais = n => String(n || "?").trim().split(/\s+/).slice(0, 2).map(p => p[0]).join("").toUpperCase();
  const capital = s => String(s || "").toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { } };
  const lsDel = k => { try { localStorage.removeItem(k); } catch (_) { } };
  const ssGet = (k, d) => { try { const v = sessionStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } };
  const ssSet = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (_) { } };
  const ssDel = k => { try { sessionStorage.removeItem(k); } catch (_) { } };
  async function sha256(t) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join(""); }
  const isBiz = (y, m, d) => { const w = new Date(y, m - 1, d).getDay(); return w !== 0 && w !== 6; };
  const FERIADOS = { 1: [1], 4: [21], 5: [1], 9: [7], 10: [12], 11: [2, 15, 20], 12: [25] };
  const diasUteis = (y, m, de = 1, ate = 31) => { const n = new Date(y, m, 0).getDate(); let c = 0; for (let d = de; d <= Math.min(n, ate); d++) if (isBiz(y, m, d) && !(FERIADOS[m] || []).includes(d)) c++; return c; };

  const IC = {
    inicio: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/>',
    vendas: '<path d="M4 19.5h16"/><rect x="5.5" y="11" width="3" height="6" rx="1"/><rect x="10.5" y="7" width="3" height="10" rx="1"/><rect x="15.5" y="4" width="3" height="13" rx="1"/>',
    enc: '<rect x="3.5" y="4.5" width="5" height="15" rx="1.5"/><rect x="9.5" y="4.5" width="5" height="10" rx="1.5"/><rect x="15.5" y="4.5" width="5" height="12.5" rx="1.5"/>',
    plano: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
    rem: '<rect x="3" y="6.5" width="18" height="11" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 9.5v5M17.5 9.5v5"/>',
    cfg: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M4.2 7.5l2 1.2M17.8 15.3l2 1.2M4.2 16.5l2-1.2M17.8 8.7l2-1.2"/>',
    sair: '<path d="M14 4.5h4.5v15H14"/><path d="M10.5 8 6.5 12l4 4M6.8 12H15"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>', recolher: '<path d="M14.5 6.5 9 12l5.5 5.5"/>', expandir: '<path d="M9.5 6.5 15 12l-5.5 5.5"/>',
    mais: '<path d="M12 5v14M5 12h14"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>', lixo: '<path d="M5 7h14M9.5 7V4.5h5V7M7 7l1 12.5h8L17 7"/>',
    mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4 7 8 6 8-6"/>', cad: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    cal: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>', ata: '<path d="M6.5 3.5h8l3 3v14h-11z"/><path d="M9 11h6M9 14.5h6M9 8h3"/>',
    raio: '<path d="M13 3 5.5 13.5H12L11 21l7.5-10.5H12z"/>', escudo: '<path d="M12 3.5 19 6v6c0 4.5-3 7.5-7 8.5-4-1-7-4-7-8.5V6z"/>', pessoas: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5c.6-3.4 2.8-5.2 5.5-5.2s4.9 1.8 5.5 5.2"/><path d="M15.5 5.6a3 3 0 0 1 0 5.8M17 14.5c2 .6 3.2 2.2 3.6 5"/>',
    nuvem: '<path d="M7 18.5a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.4 1.6 3.8 3.8 0 0 1-.3 7.4z"/>', baixar: '<path d="M12 4v11M7.5 11 12 15.5 16.5 11M5 19.5h14"/>', recarregar: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4v4.5H15"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>', usuario: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c.8-4 3.8-6 7.5-6s6.7 2 7.5 6"/>', editar: '<path d="M4.5 19.5h4l10-10-4-4-10 10z"/><path d="m13 7 4 4"/>',
  };
  const ico = (n, cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${IC[n] || ""}</svg>`;

  /* =================================================================
     2. DADOS · mesma interface para navegador e nuvem
     ================================================================= */
  const COLS = ["pessoas", "tarefas", "reunioes", "frentes", "iniciativas", "metas", "config"];
  class LocalStore {
    constructor(k) { this.k = k; this.kind = "local"; this.subs = {}; this.db = lsGet(k, null); addEventListener("storage", e => { if (e.key === k) { this.db = lsGet(k, {}); Object.keys(this.subs).forEach(c => this.emit(c)); } }); }
    vazio() { return !this.db; }
    semear(seed) { this.db = {}; for (const [c, rows] of Object.entries(seed)) { this.db[c] = {}; rows.forEach(r => { const { id, ...d } = r; this.db[c][id] = d; }); } this.salvar(); }
    salvar() { lsSet(this.k, this.db); }
    lista(c) { return Object.entries((this.db || {})[c] || {}).map(([id, d]) => ({ id, ...d })); }
    emit(c) { (this.subs[c] || []).forEach(f => f(this.lista(c))); }
    subscribe(c, cb) { (this.subs[c] = this.subs[c] || []).push(cb); setTimeout(() => cb(this.lista(c)), 0); return () => { this.subs[c] = (this.subs[c] || []).filter(f => f !== cb); }; }
    async set(c, id, d, merge = true) { this.db = this.db || {}; this.db[c] = this.db[c] || {}; this.db[c][id] = merge ? { ...(this.db[c][id] || {}), ...d } : d; this.salvar(); this.emit(c); }
    async del(c, id) { if (this.db?.[c]) { delete this.db[c][id]; this.salvar(); this.emit(c); } }
    async get(c, id) { const d = this.db?.[c]?.[id]; return d ? { id, ...d } : null; }
  }
  class FsStore {
    constructor(db) { this.db = db; this.kind = "cloud"; }
    subscribe(c, cb, err) { return this.db.collection(c).onSnapshot(s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))), err); }
    async set(c, id, d, merge = true) { const limpo = JSON.parse(JSON.stringify(d)); await this.db.doc(`${c}/${id}`).set(limpo, { merge }); }
    async del(c, id) { await this.db.doc(`${c}/${id}`).delete(); }
    async get(c, id) { const d = await this.db.doc(`${c}/${id}`).get(); return d.exists ? { id: d.id, ...d.data() } : null; }
  }

  /* Ponto de partida: o que já foi combinado no projeto (sem números inventados) */
  const SEED = () => {
    const agora = new Date().toISOString();
    const p = (id, nome, email, cargo, papel, abas) => ({ id, nome, email, cargo, papel, abas, ativo: true, criadoEm: agora });
    const todas = { vendas: true, encaminhamentos: true, planejamento: true, remuneracao: true };
    return {
      pessoas: [
        p("pedro", "Pedro Marques", "pedroarthur@gomesdematos.com.br", "Consultor · Gomes de Matos", "admin", todas),
        p("dimas", "Dimas Furtado", "dimasfurtado@gomesdematos.com.br", "Consultor líder · Gomes de Matos", "gestor", todas),
        p("danillo", "Danillo Benevinuto", "danillobenevinuto@gomesdematos.com.br", "Gerente do projeto · Gomes de Matos", "gestor", todas),
        p("valmir", "Valmir", "", "Diretoria Naturalle", "gestor", todas),
        p("rodrigo", "Rodrigo", "", "Supervisor comercial", "membro", { vendas: true, encaminhamentos: true, planejamento: true, remuneracao: false }),
      ],
      tarefas: [
        { id: "t1", titulo: "Estruturar a campanha de rifa da equipe de vendas", status: "afazer", prioridade: "media", resp: "Pedro Marques", prazo: "", origem: "r1", area: "Comercial", descricao: "Encaminhamento da Reunião Mensal de Resultados de outubro/2026.", checklist: [], comentarios: [], ordem: 1, criadoEm: agora },
        { id: "t2", titulo: "Revisar a remuneração variável do supervisor", status: "andamento", prioridade: "alta", resp: "Pedro Marques", prazo: "", origem: "", area: "Remuneração", descricao: "Regra atual informada: 5% sobre sorvete + 0,2% sobre picolés. Objetivo: reduzir o % do sorvete e aumentar o dos picolés sem desengajar. Distribuidores (venda direta) e food/iFood saem da base da comissão de equipe. Falta validar a origem dos valores pagos.", checklist: [{ id: "c1", t: "Validar com a Naturalle os valores pagos nos últimos meses", ok: false }, { id: "c2", t: "Simular a nova regra sem perda de renda", ok: false }, { id: "c3", t: "Levar à diretoria", ok: false }], comentarios: [], ordem: 1, criadoEm: agora },
        { id: "t3", titulo: "Acompanhar a Campanha de Prospecção (out–nov/2026)", status: "andamento", prioridade: "media", resp: "Rodrigo", prazo: "2026-11-30", origem: "", area: "Comercial", descricao: "Premiação: 50% na abertura do cliente e 50% após a recorrência de compra. Acompanhamento na aba \"Campanha Novos clientes\" da planilha.", checklist: [], comentarios: [], ordem: 2, criadoEm: agora },
        { id: "t4", titulo: "Treinamento de prospecção, abertura e reativação de clientes", status: "concluido", prioridade: "media", resp: "Pedro Marques", prazo: "2026-11-03", origem: "", area: "Treinamento", descricao: "1 hora, linguagem simples e prática para os vendedores.", checklist: [], comentarios: [], ordem: 1, concluidoEm: "2026-11-03T18:00:00.000Z", criadoEm: agora },
      ],
      reunioes: [
        { id: "r1", titulo: "Reunião Mensal de Resultados · outubro/2026", tipo: "RMR", data: "", participantes: ["Pedro Marques", "Dimas Furtado", "Valmir", "Rodrigo"], pauta: "Resultados de outubro, ranking, carteira e plano de ação.", decisoes: "Estruturar uma campanha de rifa para a equipe de vendas.", criadoEm: agora },
      ],
      frentes: [
        { id: "f1", nome: "Estrutura comercial em 3 horizontes", descricao: "H1 R$ 400 mil/mês: assistente comercial + hunter · H2 R$ 700 mil: dois encarregados (food service e varejo) · H3 R$ 1 mi: coordenador, dois supervisores e analista comercial. Gatilho: média dos 3 últimos meses acima do horizonte.", ordem: 1, criadoEm: agora },
        { id: "f2", nome: "Remuneração variável", descricao: "Regras de comissão de vendedores e supervisor alinhadas ao que a empresa precisa vender.", ordem: 2, criadoEm: agora },
        { id: "f3", nome: "Novos clientes e positivação", descricao: "Abrir clientes no perfil ideal (supermercados, farmácias, restaurantes) e fazer voltarem a comprar.", ordem: 3, criadoEm: agora },
        { id: "f4", nome: "Modelo de gestão", descricao: "Ritos semanais e mensais com indicadores e encaminhamentos.", ordem: 4, criadoEm: agora },
      ],
      iniciativas: [
        { id: "i1", frente: "f1", titulo: "Detalhar as rotinas de supervisor e vendedores", resp: "Pedro Marques", prazo: "", status: "andamento", progresso: 30, criadoEm: agora },
        { id: "i2", frente: "f1", titulo: "H1 · Assistente comercial + hunter", resp: "Valmir", prazo: "", status: "nao_iniciada", progresso: 0, criadoEm: agora },
        { id: "i3", frente: "f2", titulo: "Revisar o modelo de remuneração variável", resp: "Pedro Marques", prazo: "", status: "andamento", progresso: 40, criadoEm: agora },
        { id: "i4", frente: "f3", titulo: "Campanha de Prospecção out–nov/2026", resp: "Rodrigo", prazo: "2026-11-30", status: "andamento", progresso: 50, criadoEm: agora },
        { id: "i5", frente: "f3", titulo: "Treinamento de prospecção e reativação", resp: "Pedro Marques", prazo: "2026-11-03", status: "concluida", progresso: 100, criadoEm: agora },
        { id: "i6", frente: "f4", titulo: "Rito semanal de vendas", resp: "Rodrigo", prazo: "", status: "concluida", progresso: 100, criadoEm: agora },
        { id: "i7", frente: "f4", titulo: "RMR com apresentação gerada pelo painel", resp: "Pedro Marques", prazo: "", status: "concluida", progresso: 100, criadoEm: agora },
      ],
      metas: [{ id: "2026", m10: 410000, criadoEm: agora }],
      config: [{ id: "automacoes", ativo: false, diasAntes: 2, atrasadas: true, resumoSemanal: true, diaResumo: 1, destinatarios: [] }, { id: "seguranca", timeoutMin: 60 }],
    };
  };

  /* =================================================================
     3. ACESSO · papéis, abas e segurança
     ================================================================= */
  const ABAS = [
    { id: "inicio", nome: "Início", ic: "inicio", livre: true },
    { id: "vendas", nome: "Vendas", ic: "vendas" },
    { id: "encaminhamentos", nome: "Encaminhamentos", ic: "enc" },
    { id: "planejamento", nome: "Planejamento comercial", ic: "plano" },
    { id: "remuneracao", nome: "Remuneração", ic: "rem" },
  ];
  const ABA_IDS = ABAS.filter(a => !a.livre).map(a => a.id);
  const PAPEIS = {
    admin: { l: "Administrador", d: "Tudo, inclusive pessoas, acessos e segurança." },
    gestor: { l: "Gestor", d: "Cria e edita tudo nas abas liberadas." },
    membro: { l: "Membro", d: "Vê as abas liberadas, cria encaminhamentos e edita os que estão no nome dele." },
    leitor: { l: "Leitor", d: "Só visualiza as abas liberadas." },
    vendedor: { l: "Vendedor", d: "Vê só os próprios números: Vendas e Remuneração." },
  };
  const S = { modo: "local", store: null, fb: null, me: null, data: {}, unsub: [], view: "inicio", sub: {}, f: { busca: "", resp: "", prio: "", origem: "" }, vendas: null, vendasErro: "", chaveVendas: null, links: null, charts: [], iniciado: false, nuvem: false, fbRenova: null };
  COLS.forEach(c => S.data[c] = []);
  const cfgDoc = id => S.data.config.find(d => d.id === id) || {};
  const ehAdmin = () => S.me?.papel === "admin";
  const ehVendedor = () => S.me?.papel === "vendedor";
  const veAba = id => !!S.me && (ehVendedor() ? (id === "vendas" || id === "remuneracao") : (ABAS.find(a => a.id === id)?.livre || ehAdmin() || !!(S.me.abas || {})[id]));
  const ehGestao = () => ehAdmin() || S.me?.papel === "gestor";
  const podeEditar = aba => !!S.me && veAba(aba) && (ehAdmin() || S.me.papel === "gestor");
  const meuNome = () => norm(S.me?.nome);
  const meuEmail = () => normEmail(S.me?.email);
  const podeEditarTarefa = t => podeEditar("encaminhamentos") || (S.me?.papel === "membro" && veAba("encaminhamentos") && (!t || norm(t.resp) === meuNome() || (!!meuEmail() && (normEmail(t.respEmail) === meuEmail() || t.criadoPorEmail === meuEmail()))));
  const podeCriarTarefa = () => podeEditar("encaminhamentos") || (S.me?.papel === "membro" && veAba("encaminhamentos"));

  /* Bloqueio progressivo: 3 erros → 1 min · 6 → 5 min · 9 → 15 min */
  const Trava = {
    k: e => KEY + "-tent-" + (e || "equipe"),
    ler(e) { return lsGet(this.k(e), { n: 0, em: 0 }); },
    espera(e) { const t = this.ler(e), w = t.n >= 9 ? 900 : t.n >= 6 ? 300 : t.n >= 3 ? 60 : 0; return Math.max(0, Math.ceil(w - (Date.now() - t.em) / 1000)); },
    erro(e) { const t = this.ler(e); lsSet(this.k(e), { n: t.n + 1, em: Date.now() }); },
    zerar(e) { lsDel(this.k(e)); },
  };
  /* Sessão encerra sozinha após inatividade */
  const Ocioso = {
    t: null, ultimo: Date.now(),
    iniciar() { ["pointerdown", "keydown", "scroll"].forEach(ev => addEventListener(ev, () => this.ultimo = Date.now(), { passive: true })); clearInterval(this.t); this.t = setInterval(() => { const min = +(cfgDoc("seguranca").timeoutMin ?? 60); if (min > 0 && Date.now() - this.ultimo > min * 6e4) sair("Sua sessão foi encerrada por inatividade. Entre de novo."); }, 30e3); },
    parar() { clearInterval(this.t); },
  };

  /* =================================================================
     ENTRADA
     ================================================================= */
  function telaEntrada(msg = "") {
    $("#app").hidden = true; $("#login").hidden = false;
    const nuvem = S.modo === "cloud";
    if (!nuvem) return telaEntradaPortal(msg);
    $("#login").innerHTML = `
      <section class="lg-art" aria-hidden="true">
        <div class="marca"><img src="assets/simbolo.svg" alt="">Naturalle</div>
        <div><h1>Plataforma comercial</h1><p>Vendas, encaminhamentos das reuniões, planejamento e remuneração da equipe num só lugar.</p>
          <div class="lg-mods"><span>Vendas</span><span>Encaminhamentos</span><span>Planejamento comercial</span><span>Remuneração</span></div></div>
        <img class="simbolo" src="assets/simbolo.svg" alt="">
      </section>
      <section class="lg-form"><div class="lg-card">
        <h2>Entrar</h2>
        <p class="sub">${nuvem ? "Use o seu e-mail e a sua senha." : "Use a senha da equipe Naturalle."}</p>
        <form id="lgForm" autocomplete="on" novalidate>
          ${nuvem ? `<label class="f">E-mail<input class="inp" id="lgEmail" type="email" autocomplete="username" required></label>` : ""}
          <label class="f">Senha<input class="inp" id="lgSenha" type="password" autocomplete="current-password" required></label>
          <button class="btn" id="lgBtn" type="submit">Entrar</button>
          <p class="lg-erro" id="lgErro" role="alert">${esc(msg)}</p>
          ${nuvem ? `<button type="button" class="linkbtn" id="lgEsqueci">Esqueci minha senha</button>` : ""}
        </form>
        ${nuvem ? "" : `<div class="lg-modo">Modo equipe: os quadros ficam salvos neste navegador. Com a nuvem ligada, cada pessoa entra com o próprio e-mail.</div>`}
        <div class="lg-rodape"><img src="assets/gomes-de-matos.png" alt="Gomes de Matos Consultoria"><span>${esc(CFG.desenvolvidoPor || "")}</span></div>
      </div></section>`;
    setTimeout(() => ($("#lgEmail") || $("#lgSenha")).focus(), 30);
    $("#lgForm").onsubmit = entrar;
    const esq = $("#lgEsqueci");
    if (esq) esq.onclick = async () => {
      const e = normEmail($("#lgEmail").value); if (!emailOk(e)) { $("#lgErro").textContent = "Digite o seu e-mail acima e clique de novo."; return; }
      try { await S.fb.auth().sendPasswordResetEmail(e, { url: CFG.urlPublica || location.href }); $("#lgErro").textContent = "Enviamos um link para criar uma nova senha. Confira o e-mail."; }
      catch (er) { $("#lgErro").textContent = erroAuth(er); }
    };
  }
  function telaEntradaPortal(msg) {
    $("#login").innerHTML = `
      <section class="lg-art lg-picole" aria-hidden="true">
        <div class="marca"><img src="assets/simbolo.svg" alt="">Naturalle</div>
        <div class="lg-pic"><svg class="picole-big" viewBox="0 0 240 400" focusable="false">         <defs>           <linearGradient id="pgCorpo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F2B36B"/><stop offset=".55" stop-color="#D98A3D"/><stop offset="1" stop-color="#A15F1D"/></linearGradient>           <linearGradient id="pgPalito" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#E4C08E"/><stop offset=".5" stop-color="#F3DDB8"/><stop offset="1" stop-color="#D8AE72"/></linearGradient>           <mask id="pgMordida"><rect width="240" height="400" fill="#fff"/><circle cx="196" cy="58" r="22" fill="#000"/><circle cx="214" cy="86" r="20" fill="#000"/><circle cx="176" cy="40" r="16" fill="#000"/></mask>         </defs>         <g class="pg-palito"><rect x="100" y="268" width="40" height="120" rx="20" fill="url(#pgPalito)"/><path d="M112 300v60M128 296v70" stroke="#C99A5B" stroke-width="2" stroke-linecap="round" opacity=".55"/></g>         <g class="pg-corpo" mask="url(#pgMordida)">           <path d="M28 120C28 62 70 22 120 22s92 40 92 98v142c0 14-11 24-24 24H52c-13 0-24-10-24-24Z" fill="url(#pgCorpo)"/>           <path d="M56 70c10-18 26-30 44-34" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity=".28" fill="none"/>           <path d="M48 100v130" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity=".18"/>           <g transform="translate(74 92) scale(.4) translate(-110 -77)" fill="#FFF8EE"><path d="M152.2 365.6C152.6 365.3 153.1 364.6 153.4 364.0L154.0 362.9L154.1 273.6C154.1 190.5 154.2 184.1 154.6 180.9C155.8 171.1 156.9 166.7 160.0 159.1C161.4 155.5 164.6 150.0 167.5 146.1C169.8 143.0 175.1 137.6 178.2 135.0C182.1 131.9 187.5 128.4 190.5 127.1C191.2 126.7 192.4 126.2 193.1 125.9C197.1 124.0 200.1 123.0 205.1 121.9C209.7 120.9 211.8 120.6 216.4 120.2C220.0 119.9 231.2 120.1 232.9 120.5C233.4 120.6 235.2 120.9 236.8 121.0C240.2 121.3 242.1 121.8 242.6 122.6C243.1 123.3 243.1 124.8 242.5 127.1C242.0 128.9 241.9 129.8 241.9 135.2C241.9 141.7 241.9 141.9 243.4 147.6C245.5 155.6 249.5 163.4 254.8 170.0C257.6 173.5 262.9 178.6 266.7 181.4C270.0 183.9 275.5 187.2 278.9 188.7C281.1 189.7 287.9 192.0 288.5 192.0C288.8 192.0 289.7 192.3 290.6 192.8C291.8 193.3 292.4 193.8 292.9 194.6L293.6 195.6L293.8 279.0C293.8 341.8 293.9 362.5 294.2 362.9C294.6 363.6 295.8 364.7 296.5 364.9C296.9 365.1 304.6 365.2 314.2 365.1C331.0 365.1 331.2 365.1 331.9 364.6C332.3 364.3 332.8 363.7 333.1 363.2C333.5 362.4 333.5 357.9 333.4 275.6C333.4 193.3 333.4 188.8 332.9 188.2C332.2 187.0 331.3 186.7 327.6 186.5C321.5 186.1 318.2 185.5 314.4 184.4C306.5 182.2 301.0 179.5 295.0 175.3C289.7 171.5 282.3 164.6 278.5 159.9C271.5 151.2 266.8 142.0 264.2 131.8C262.8 126.3 262.6 125.6 262.0 120.5C261.0 112.9 261.3 99.5 262.6 93.5C263.1 91.1 263.1 88.3 262.6 87.5C262.0 86.7 261.5 86.3 260.8 86.0C259.7 85.5 254.3 84.0 253.8 84.0C253.6 84.0 252.7 83.8 251.9 83.6C249.2 82.9 244.4 82.2 238.8 81.6C231.1 80.8 215.7 81.0 207.1 82.0C195.2 83.4 181.7 87.2 172.1 92.1C160.9 97.7 149.5 106.5 140.7 116.4C135.0 122.8 130.5 129.6 126.4 137.8C125.5 139.6 124.6 141.3 124.5 141.5C124.0 142.6 121.3 149.4 120.5 152.1C119.6 154.6 118.1 160.2 117.3 163.6C116.3 167.8 115.1 176.4 114.8 182.3C114.0 194.7 114.0 198.7 114.1 280.2C114.2 370.1 114.1 364.1 115.5 365.4C115.9 365.7 116.3 366.0 116.6 366.1C116.9 366.1 124.9 366.2 134.3 366.2C151.3 366.1 151.5 366.1 152.2 365.6Z"/></g>         </g>         <path class="pg-gota" d="M70 284c0 10 6 18 12 18s12-8 12-18" fill="#C97A2C"/>         <path class="pg-gota g2" d="M150 284c0 7 4 12 8 12s8-5 8-12" fill="#C97A2C"/>       </svg></div>
        <div class="lg-pic-txt"><b>Plataforma comercial</b><span>Vendas · encaminhamentos · planejamento · remuneração</span></div>
      </section>
      <section class="lg-form"><div class="lg-card">
        <h2>Entrar</h2>
        <p class="sub">Use o número do seu celular corporativo e a sua senha.</p>
        <form id="lgForm" autocomplete="on" novalidate>
          <label class="f">Número do celular<input class="inp" id="lgNum" type="text" inputmode="tel" autocomplete="username" placeholder="(85) 99999-0000" maxlength="40" required></label>
          <label class="f">Senha<input class="inp" id="lgSenha" type="password" autocomplete="current-password" maxlength="80" required></label>
          <label class="ck lg-lembrar"><input type="checkbox" id="lgLembrar" checked><span>Manter conectado neste aparelho</span></label>
          <button class="btn" id="lgBtn" type="submit">Entrar</button>
          <p class="lg-erro" id="lgErro" role="alert">${esc(msg || "")}</p>
        </form>
        <div class="lg-modo">Cada vendedor vê só os próprios números. Encaminhamentos e atas ficam para a gestão.</div>
        <div class="lg-rodape"><img src="assets/gomes-de-matos.png" alt="Gomes de Matos Consultoria"><span>${esc(CFG.desenvolvidoPor || "")}</span></div>
      </div></section>`;
    setTimeout(() => $("#lgNum").focus(), 30);
    $("#lgForm").onsubmit = entrar;
  }
  async function entrar(ev) {
    ev.preventDefault();
    const btn = $("#lgBtn"), erro = $("#lgErro"), card = $(".lg-card"), email = S.modo === "cloud" ? normEmail($("#lgEmail").value) : "", senha = $("#lgSenha").value;
    const w = Trava.espera(email); if (w > 0) { erro.textContent = `Muitas tentativas erradas. Tente de novo em ${w >= 60 ? Math.ceil(w / 60) + " min" : w + " s"}.`; return; }
    if (S.modo === "cloud" && !emailOk(email)) { erro.textContent = "Digite um e-mail válido."; return; }
    btn.disabled = true; btn.textContent = "Conferindo…"; erro.textContent = "";
    try {
      if (S.modo === "cloud") { await S.fb.auth().signInWithEmailAndPassword(email, senha); Trava.zerar(email); }
      else {
        // login no portal seguro: número do celular (ou "equipe") + senha; o servidor diz o papel e o que a pessoa vê
        const lembrar = $("#lgLembrar")?.checked;
        const j = await VendasDados.api(CFG.apiUrl, { acao: "login", u: $("#lgNum").value, s: senha, lembrar: !!lembrar });
        Trava.zerar("");
        abrirSessao(j, lembrar);
        iniciarApp();
      }
    } catch (e) {
      Trava.erro(email); const w2 = Trava.espera(email);
      erro.textContent = (S.modo === "cloud" ? erroAuth(e) : (e.api && /aguarde/.test(e.message) ? "Muitas tentativas erradas. Aguarde 15 minutos." : e.api ? "Número ou senha incorretos." : "Sem conexão com o servidor. Tente de novo.")) + (w2 ? ` Aguarde ${w2 >= 60 ? Math.ceil(w2 / 60) + " min" : w2 + " s"} para tentar de novo.` : "");
      card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
    } finally { if (btn.isConnected) { btn.disabled = false; btn.textContent = "Entrar"; } }
  }
  const MSG_AUTH = { "auth/invalid-email": "E-mail inválido.", "auth/user-disabled": "Esta conta foi desativada.", "auth/too-many-requests": "Muitas tentativas seguidas. Aguarde alguns minutos.", "auth/network-request-failed": "Sem conexão com a internet.", "auth/weak-password": "Senha fraca: use pelo menos 8 caracteres, com letras e números.", "auth/requires-recent-login": "Por segurança, saia e entre de novo antes de trocar a senha." };
  const erroAuth = e => MSG_AUTH[e?.code] || (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(e?.code || "") ? "E-mail ou senha incorretos." : e?.message || "Não foi possível concluir.");

  async function depoisDoLoginNuvem(u) {
    const email = normEmail(u.email), db = S.fb.firestore(), inicial = (CFG.adminsIniciais || []).map(normEmail).includes(email);
    let acc = null; try { const d = await db.doc(`acessos/${email}`).get(); acc = d.exists ? d.data() : null; } catch (e) { console.warn("acessos", e.code); }
    if (!inicial && (!acc || acc.ativo === false)) { await S.fb.auth().signOut(); return telaEntrada(acc ? "Seu acesso está desativado. Fale com um administrador." : "Este e-mail ainda não tem acesso. Peça a um administrador."); }
    S.me = { email, nome: acc?.nome || capital(email.split("@")[0].replace(/[._]/g, " ")), papel: inicial ? "admin" : (PAPEIS[acc.papel] ? acc.papel : "leitor"), abas: inicial ? Object.fromEntries(ABA_IDS.map(a => [a, true])) : (acc.abas || {}) };
    db.doc(`acessos/${email}`).set({ ultimoAcesso: new Date().toISOString(), ...(inicial && !acc ? { papel: "admin", ativo: true, nome: S.me.nome, abas: S.me.abas } : {}) }, { merge: true }).catch(() => { });
    S.store = new FsStore(db);
    if (ehAdmin()) await semearNuvem().catch(e => console.warn("seed", e));
    if (veAba("vendas")) { try { const sg = await db.doc("segredos/vendas").get(); if (sg.exists && sg.data().chave) { S.chaveVendas = sg.data().chave; S.links = await VendasDados.abrirCofre(await VendasDados.chaveDeBase64(S.chaveVendas), CFG.cofreVendas); } } catch (e) { console.warn("segredo", e.code || e); } }
    iniciarApp();
  }
  async function semearNuvem() {
    const db = S.fb.firestore(); const t = await db.collection("frentes").limit(1).get(); if (!t.empty) return;
    // se este navegador já usava o modo equipe, leva esses dados para a nuvem; senão, o ponto de partida do projeto
    const local = lsGet(KEY + "-dados-v1", null), origem = local ? Object.fromEntries(Object.entries(local).map(([c, o]) => [c, Object.entries(o || {}).map(([id, d]) => ({ id, ...d }))])) : SEED();
    let b = db.batch(), n = 0;
    for (const [c, rows] of Object.entries(origem)) { if (!COLS.includes(c)) continue; for (const { id, ...d } of rows) { if (c === "config" && id === "abasSenha") continue; b.set(db.doc(`${c}/${id}`), JSON.parse(JSON.stringify(d))); if (++n % 400 === 0) { await b.commit(); b = db.batch(); } } }
    b.set(db.doc("config/migracao"), { por: S.me.nome, em: new Date().toISOString(), deNavegador: !!local }); await b.commit(); if (local) { lsSet(KEY + "-dados-v1-antigo", local); lsDel(KEY + "-dados-v1"); } toast(local ? "Dados deste navegador copiados para a nuvem" : "Plataforma preparada com o que já foi combinado no projeto");
  }

  function meDaSessao(j) {
    const todas = Object.fromEntries(ABA_IDS.map(a => [a, true]));
    return { nome: j.id === "equipe" ? (lsGet(KEY + "-nome", "") || "Equipe Naturalle") : j.nome, email: "", id: j.id, papel: PAPEIS[j.papel] ? j.papel : "leitor", abas: j.papel === "admin" || !j.abas ? todas : j.abas };
  }
  function abrirSessao(j, lembrar) {
    S.token = j.t; S.links = true; S.me = meDaSessao(j);
    const ses = { t: j.t, papel: j.papel, nome: j.nome, id: j.id, abas: j.abas || null };
    ssSet(KEY + "-sessao", ses); if (lembrar) lsSet(KEY + "-sessao", ses); else lsDel(KEY + "-sessao");
    sessaoPainel();
  }
  function sessaoPainel() {
    // o painel de vendas (iframe, mesmo endereço) lê a sessão daqui e abre sem pedir a senha de novo
    if (S.token) try { sessionStorage.setItem("naturalle_sessao", JSON.stringify({ t: S.token, papel: S.me?.papel === "vendedor" ? "vendedor" : "equipe", papelReal: S.me?.papel, nome: S.me?.nome || "Equipe", id: S.me?.id || "equipe" })); } catch (_) { }
    try { localStorage.removeItem(CHAVE_PAINEL); } catch (_) { }
  }
  /* nuvem: com a sessão do portal, pega um passe do Firebase (renovado a cada 50 min).
     Vendedor não usa o banco: fica com um quadro vazio neste aparelho. */
  async function ligarNuvem() {
    if (!S.fb || ehVendedor() || S.modo !== "local") return false;
    const j = await VendasDados.api(CFG.apiUrl, { acao: "fbToken", t: S.token });
    await S.fb.auth().signInWithCustomToken(j.token);
    clearInterval(S.fbRenova);
    S.fbRenova = setInterval(async () => { if (!S.iniciado || !S.nuvem) return; try { const k = await VendasDados.api(CFG.apiUrl, { acao: "fbToken", t: S.token }); await S.fb.auth().signInWithCustomToken(k.token); } catch (e) { console.warn("renovar nuvem", e); if (e.sessao) sair("Sua sessão terminou. Entre de novo."); } }, 50 * 60e3);
    S.store = new FsStore(S.fb.firestore()); S.nuvem = true;
    if (ehAdmin()) await semearNuvem().catch(e => console.warn("seed", e));
    return true;
  }
  async function prepararStore() {
    S.nuvem = false;
    try { if (await ligarNuvem()) return; } catch (e) { console.warn("nuvem", e); if (e.sessao) throw e; }
    S.store = new LocalStore(KEY + "-dados-v1"); if (S.store.vazio()) S.store.semear(ehVendedor() ? {} : SEED());
  }
  async function iniciarApp() {
    $("#login").hidden = true; $("#login").innerHTML = ""; $("#app").hidden = false;
    sessaoPainel(); // abre o painel de vendas sem pedir a senha de novo
    if (S.fb && !ehVendedor()) $("#app").innerHTML = `<div class="carregando" style="display:grid;place-items:center;height:100vh;color:var(--muted)">Abrindo a plataforma…</div>`;
    try { await prepararStore(); } catch (e) { return sair("Sua sessão terminou. Entre de novo."); }
    montarMoldura(); conectar(); Ocioso.iniciar(); S.iniciado = true;
    const [v, sub] = location.hash.slice(1).split("/"); ir(ABAS.some(a => a.id === v) || v === "config" ? v : (ehVendedor() ? "vendas" : lsGet(KEY + "-view", "inicio")), sub);
    carregarVendas();
  }
  function conectar() {
    S.unsub.forEach(f => { try { f(); } catch (_) { } }); S.unsub = [];
    const precisa = { tarefas: "encaminhamentos", reunioes: "encaminhamentos", frentes: "planejamento", iniciativas: "planejamento" };
    for (const c of COLS) if (!precisa[c] || veAba(precisa[c])) S.unsub.push(S.store.subscribe(c, rows => { S.data[c] = rows; agendarRender(); }, err => { console.error(c, err); if (/permission/i.test(err?.code || "")) { S.data[c] = []; agendarRender(); } else sinc(false, "Sem conexão com o banco"); }));
    sinc(true, S.store.kind === "local" ? "Salvo neste navegador" : "Sincronizado");
  }
  async function sair(msg) {
    Ocioso.parar(); fecharGaveta(); destruirGraficos();
    S.unsub.forEach(f => { try { f(); } catch (_) { } }); S.unsub = []; S.iniciado = false; S.me = null; S.chaveVendas = null; S.links = null; S.token = null; S.vendas = null;
    ssDel(KEY + "-sessao"); lsDel(KEY + "-sessao"); ssDel(KEY + "-abas-ok"); lsDel(CHAVE_PAINEL); ssDel("naturalle_sessao"); try { localStorage.removeItem("naturalle_sessao"); } catch (_) { }
    $$(".vendas-frame").forEach(fr => fr.remove());
    clearInterval(S.fbRenova); if (S.fb) { try { await S.fb.auth().signOut(); } catch (_) { } } S.nuvem = false;
    $("#app").innerHTML = ""; telaEntrada(msg || "");
  }

  /* =================================================================
     4. MOLDURA
     ================================================================= */
  function montarMoldura() {
    const mini = lsGet(KEY + "-mini", false);
    $("#app").className = "app" + (mini ? " mini" : "");
    $("#app").innerHTML = `
      <aside class="side" aria-label="Menu principal">
        <div class="side-top"><img src="assets/simbolo.svg" alt=""><div class="side-nome">Naturalle<small>Plataforma comercial</small></div></div>
        <nav id="nav"></nav>
        <div class="side-pe">
          <button class="nav-i" data-act="ir" data-to="config" data-tip="Configurações">${ico("cfg")}<span>${ehAdmin() ? "Configurações" : "Minha conta"}</span></button>
          <button class="nav-i recolher" data-act="mini" data-tip="Expandir menu" aria-label="Recolher ou expandir o menu">${ico(mini ? "expandir" : "recolher")}<span>Recolher menu</span></button>
          <div class="eu"><span class="avatar">${esc(iniciais(S.me.nome))}</span><div><b>${esc(S.me.nome)}</b><small>${esc(PAPEIS[S.me.papel]?.l || "")}${S.nuvem || ehVendedor() ? "" : " · modo equipe"}</small></div></div>
          <button class="nav-i" data-act="sair" data-tip="Sair">${ico("sair")}<span>Sair</span></button>
        </div>
      </aside>
      <div class="main">
        <header class="topo"><button class="iconbtn menu" data-act="abrirMenu" aria-label="Abrir menu">${ico("menu")}</button><h1 id="titulo"></h1>
          <div class="acoes"><span class="sync" id="sync"><i></i><span></span></span></div></header>
        <main class="conteudo" id="conteudo" tabindex="-1"></main>
        <div id="vendasHost" hidden></div>
        <footer class="rodape" id="rodape"><img src="assets/gomes-de-matos.png" alt="Gomes de Matos Consultoria"><span>Criado pela metodologia Gomes de Matos pelo Consultor Pedro Marques · Time Comercial &amp; Marketing</span></footer>
      </div>`;
    desenharNav();
  }
  function desenharNav() {
    const atrasados = S.data.tarefas.filter(t => t.status !== "concluido" && t.prazo && diasAte(t.prazo) < 0).length;
    $("#nav").innerHTML = ABAS.map(a => {
      const ok = veAba(a.id), trava = S.modo === "local" && !S.nuvem && (cfgDoc("abasSenha")[a.id]) && !abaLiberada(a.id);
      if (!ok) return "";
      const bt = `<button class="nav-i" data-act="ir" data-to="${a.id}" data-tip="${esc(a.nome)}" ${S.view === a.id && !(a.id === "vendas" && S.view === "vendas") ? 'aria-current="page"' : ""} ${a.id === "vendas" ? `aria-expanded="${S.view === "vendas"}"` : ""}>${ico(a.ic)}<span>${esc(a.nome)}</span>${a.id === "encaminhamentos" && atrasados ? `<b class="badge" title="Encaminhamentos atrasados">${atrasados}</b>` : ""}${trava ? ico("cad", "cad") : ""}</button>`;
      if (a.id !== "vendas" || S.view !== "vendas") return bt;
      const atual = subVendas();
      return bt + `<div class="nav-sub" role="group" aria-label="Vendas">${SUB_VENDAS.filter(x => !x.gestao || !ehVendedor()).map(x => `<button class="nav-s" data-act="ir" data-to="vendas" data-sub="${x.id}" ${atual === x.id ? 'aria-current="page"' : ""}>${esc(x.nome)}</button>`).join("")}</div>`;
    }).join("");
    $$('.side-pe .nav-i[data-to="config"]').forEach(b => b.toggleAttribute("aria-current", S.view === "config"));
  }
  const SUB_VENDAS = [
    { id: "geral", nome: "Visão geral", aba: "Geral" },
    { id: "rankings", nome: "Rankings", aba: "Rankings", gestao: true },
    { id: "carteira", nome: "Carteira de clientes", aba: "Carteira" },
    { id: "produtos", nome: "Produtos", aba: "Produtos" },
    { id: "arvore", nome: "Representatividade", aba: "Arvore", gestao: true },
    { id: "campanhas", nome: "Campanhas", aba: "Campanha" },
    { id: "semana", nome: "Resultado da semana", aba: "Geral", acao: "semana", gestao: true },
  ];
  const subVendas = () => { const s = S.sub.vendas; return SUB_VENDAS.some(x => x.id === s && (!x.gestao || !ehVendedor())) ? s : "geral"; };
  function sinc(ok, txt) { const s = $("#sync"); if (!s) return; s.classList.toggle("off", !ok); s.lastElementChild.textContent = txt; }
  let rTimer = null; function agendarRender() { clearTimeout(rTimer); rTimer = setTimeout(render, 30); }

  function ir(view, sub) {
    if (view !== "config" && !veAba(view)) view = ehVendedor() ? "vendas" : "inicio";
    S.view = view; if (sub) S.sub[view] = sub; lsSet(KEY + "-view", view);
    const h = "#" + view + (S.sub[view] ? "/" + S.sub[view] : ""); if (location.hash !== h) history.replaceState(null, "", h);
    $("#app").classList.remove("aberta"); render(); $("#conteudo").focus({ preventScroll: true }); scrollTo(0, 0);
  }
  function render() {
    if (!S.iniciado) return;
    desenharNav(); destruirGraficos();
    const v = S.view, c = $("#conteudo"), host = $("#vendasHost"), vendas = (v === "vendas" || v === "remuneracao") && abaLiberada(v);
    host.hidden = !vendas; c.hidden = vendas; $("#rodape").hidden = vendas;
    $("#titulo").textContent = v === "config" ? (ehAdmin() ? "Configurações" : "Minha conta") : ABAS.find(a => a.id === v)?.nome || "";
    document.title = $("#titulo").textContent + " · Naturalle";
    if (vendas) return viewVendas(host, v === "remuneracao" ? "Remuneracao" : (SUB_VENDAS.find(x => x.id === subVendas()) || {}).aba, v === "vendas" && subVendas() === "semana");
    if (!abaLiberada(v)) return viewTrava(c, v);
    const aviso = S.modo === "local" && !S.nuvem && !ehVendedor() && v !== "vendas" && v !== "remuneracao" ? `<div class="aviso-modo">${ico("nuvem")}<span>Modo equipe: o que você cadastrar aqui fica salvo só neste navegador.${ehAdmin() ? " A nuvem não respondeu agora; recarregue a página." : ""}</span>${ehAdmin() ? `<button class="btn sm ghost" data-act="ir" data-to="config" data-sub="nuvem">Ver nuvem</button>` : ""}</div>` : "";
    const fn = { inicio: viewInicio, encaminhamentos: viewEncaminhamentos, planejamento: viewPlanejamento, remuneracao: viewRemuneracao, config: viewConfig }[v];
    c.innerHTML = aviso + '<div id="vw"></div>'; fn($("#vw"));
  }

  /* senha extra por aba (modo equipe) */
  const abaLiberada = id => S.modo !== "local" || S.nuvem || !cfgDoc("abasSenha")[id] || (ssGet(KEY + "-abas-ok", {})[id] === true);
  function viewTrava(c, id) {
    c.innerHTML = `<div class="trava card">${ico("cad")}<h2 class="mt-s">${esc(ABAS.find(a => a.id === id)?.nome)}</h2><p class="sub">Esta aba tem uma senha própria.</p>
      <form id="trForm"><label class="vh" for="trSenha">Senha da aba</label><input class="inp" id="trSenha" type="password" placeholder="Senha da aba" autocomplete="off"><button class="btn" type="submit">Abrir aba</button><p class="lg-erro" id="trErro" role="alert"></p></form></div>`;
    $("#trSenha").focus();
    $("#trForm").onsubmit = async e => {
      e.preventDefault(); const w = Trava.espera("aba-" + id); if (w) { $("#trErro").textContent = `Aguarde ${w} s.`; return; }
      if ((await sha256(VendasDados.normSenha($("#trSenha").value))) === cfgDoc("abasSenha")[id]) { Trava.zerar("aba-" + id); const ok = ssGet(KEY + "-abas-ok", {}); ok[id] = true; ssSet(KEY + "-abas-ok", ok); render(); }
      else { Trava.erro("aba-" + id); $("#trErro").textContent = "Senha incorreta."; }
    };
  }

  /* =================================================================
     5a. VENDAS · painel atual embutido + dados para os outros módulos
     ================================================================= */
  function viewVendas(host, aba, semana) {
    let fr = $("#vendasFrame");
    const mandar = () => { try { const w = fr.contentWindow; if (w && w.painelIr) { w.painelIr(aba || "Geral"); if (semana && w.painelSemana) w.painelSemana(); return true; } } catch (_) { } return false; };
    if (!fr) {
      sessaoPainel();
      host.innerHTML = `<iframe id="vendasFrame" class="vendas-frame" title="Painel de vendas" src="${esc(painelUrl(aba))}" referrerpolicy="same-origin"></iframe>`;
      fr = $("#vendasFrame");
      fr.addEventListener("load", () => { let n = 0; const t = setInterval(() => { if (mandar() || ++n > 40) clearInterval(t); }, 150); });
    } else if (!mandar()) { let n = 0; const t = setInterval(() => { if (mandar() || ++n > 40) clearInterval(t); }, 150); }
  }
  const painelUrl = aba => (CFG.painelVendas || "../index.html") + "?embed=1#" + (aba || "Geral");
  async function carregarVendas(forcar) {
    if (!S.token || !veAba("vendas") && !veAba("remuneracao") && !veAba("planejamento")) { if (!S.links) S.vendasErro = S.modo === "cloud" ? (ehAdmin() ? "Conecte os dados de vendas em Configurações → Nuvem." : "") : ""; return; }
    try { S.vendas = await VendasDados.carregarApi(CFG.apiUrl, S.token, forcar); S.vendasErro = ""; }
    catch (e) { if (e.sessao && S.modo !== "cloud") return sair("Sua sessão terminou. Entre de novo."); S.vendasErro = "Não consegui ler a planilha de vendas: " + (e.message || e); }
    if (["inicio", "planejamento", "remuneracao"].includes(S.view)) agendarRender();
  }
  const recsMes = (a, m) => (S.vendas?.recs || []).filter(r => r.ano === a && r.mes === m);
  const mesesComDados = () => [...new Set((S.vendas?.recs || []).filter(r => r.venda > 0).map(r => r.ano * 12 + r.mes - 1))].sort((a, b) => b - a).map(i => ({ ano: Math.floor(i / 12), mes: i % 12 + 1 }));
  const metaEmpresa = (a, m) => { const d = S.data.metas.find(x => x.id === String(a)); const v = d?.["m" + m]; return v ? +v : (sum(recsMes(a, m), r => r.meta) || null); };

  /* =================================================================
     5b. INÍCIO
     ================================================================= */
  function viewInicio(el) {
    const h = new Date(), a = h.getFullYear(), m = h.getMonth() + 1, hora = h.getHours();
    const ola = (hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite") + ", " + esc(String(S.me.nome).split(" ")[0]);
    let hero;
    if (veAba("vendas") && S.vendas) {
      const rs = recsMes(a, m), real = sum(rs, r => r.venda), meta = metaEmpresa(a, m), pct = meta ? real / meta * 100 : null;
      const escala = Math.max(meta || 0, real, 1), du = diasUteis(a, m), duFeitos = diasUteis(a, m, 1, h.getDate() - 1), duResta = Math.max(0, du - duFeitos);
      const falta = meta ? Math.max(0, meta - real) : null;
      const frase = meta ? (falta > 0 ? `Faltam ${BRL.format(falta)} para a meta de ${MESES_L[m - 1]}, em ${duResta} ${duResta === 1 ? "dia útil" : "dias úteis"}${duResta ? `: ${BRL.format(falta / duResta)} por dia.` : "."}` : `Meta de ${MESES_L[m - 1]} batida: ${BRL.format(real - meta)} acima.`) : `Defina a meta de ${MESES_L[m - 1]} no Planejamento comercial para acompanhar aqui.`;
      hero = `<section class="hero"><p class="ola">${ola}</p><h2>${BRL.format(real)} vendidos em ${MESES_L[m - 1]}</h2><p class="resumo">${esc(frase)}</p>
        <div class="picole" role="img" aria-label="${pct != null ? nBR(pct, 0) + "% da meta" : "Sem meta"}"><div class="corpo"><div class="fruta" data-w="${(real / escala * 100).toFixed(1)}%"></div>${meta ? `<div class="marca-meta" style="left:calc(${(meta / escala * 100).toFixed(1)}% - 1px)"></div>` : ""}<span class="lbl">${pct != null ? nBR(pct, 0) + "% da meta" : brlMil(real)}</span></div><div class="palito"></div></div>
        <div class="hero-leg"><span>Meta <b>${meta ? BRL.format(meta) : "não definida"}</b></span><span>Dias úteis <b>${duFeitos} de ${du}</b></span>${S.vendas ? `<span>Atualizado <b>${relTempo(new Date(S.vendas.em).toISOString())}</b></span>` : ""}</div></section>`;
    } else {
      hero = `<section class="hero"><p class="ola">${ola}</p><h2>O que precisa de atenção hoje</h2><p class="resumo">${S.vendasErro && veAba("vendas") ? esc(S.vendasErro) : "Encaminhamentos, reuniões e iniciativas da equipe comercial."}</p></section>`;
    }
    const ab = S.data.tarefas.filter(t => t.status !== "concluido");
    const atras = ab.filter(t => t.prazo && diasAte(t.prazo) < 0), semana = ab.filter(t => t.prazo && diasAte(t.prazo) >= 0 && diasAte(t.prazo) <= 7);
    const minhas = ab.filter(t => norm(t.resp) === meuNome()).sort((x, y) => (x.prazo || "9") < (y.prazo || "9") ? -1 : 1).slice(0, 6);
    const inic = S.data.iniciativas, inicAtras = inic.filter(i => i.status !== "concluida" && i.prazo && diasAte(i.prazo) < 0);
    const prox = S.data.reunioes.filter(r => r.data && diasAte(r.data) >= 0).sort((x, y) => x.data < y.data ? -1 : 1)[0];
    const kpi = (t, v, s, cls = "", to = "") => `<div class="card kpi${to ? " clic" : ""}" ${to ? `data-act="ir" data-to="${to}" role="button" tabindex="0"` : ""}><div class="t">${t}</div><div class="v ${cls}">${v}</div><div class="s">${s}</div></div>`;
    el.innerHTML = hero + `
      <div class="linha l4 mt">
        ${veAba("encaminhamentos") ? kpi("Encaminhamentos atrasados", atras.length, atras.length ? "precisam de nova data ou conclusão" : "nenhum atrasado", atras.length ? "bad" : "ok", "encaminhamentos") : ""}
        ${veAba("encaminhamentos") ? kpi("Vencem em 7 dias", semana.length, "encaminhamentos em aberto", semana.length ? "warn" : "", "encaminhamentos") : ""}
        ${veAba("planejamento") ? kpi("Iniciativas do plano", `${inic.filter(i => i.status === "concluida").length}/${inic.length}`, inicAtras.length ? `${inicAtras.length} com prazo vencido` : "concluídas", inicAtras.length ? "bad" : "", "planejamento") : ""}
        ${veAba("encaminhamentos") ? kpi("Próxima reunião", prox ? dataBR(prox.data) : "—", prox ? esc(prox.titulo) : "nenhuma marcada", "", "encaminhamentos") : ""}
      </div>
      <div class="linha l2 mt">
        ${veAba("encaminhamentos") ? `<section class="card"><div class="card-h"><div><h2>Seus próximos prazos</h2><p class="sub">Encaminhamentos em aberto no seu nome.</p></div>${podeCriarTarefa() ? `<div class="dir"><button class="btn sm" data-act="novaTarefa">${ico("mais")}Novo encaminhamento</button></div>` : ""}</div>
          ${minhas.length ? `<div class="lista">${minhas.map(liTarefa).join("")}</div>` : `<div class="vazio"><b>Nada no seu nome agora.</b>Quando alguém te passar um encaminhamento, ele aparece aqui.</div>`}</section>` : ""}
        ${veAba("encaminhamentos") ? `<section class="card"><div class="card-h"><div><h2>Atrasados da equipe</h2><p class="sub">Do maior atraso para o menor.</p></div></div>
          ${atras.length ? `<div class="lista">${atras.sort((x, y) => x.prazo < y.prazo ? -1 : 1).slice(0, 6).map(liTarefa).join("")}</div>` : `<div class="vazio"><b>Nenhum encaminhamento atrasado.</b>A equipe está em dia.</div>`}</section>` : ""}
      </div>`;
    requestAnimationFrame(() => $$(".fruta[data-w]").forEach(f => f.style.width = f.dataset.w));
  }
  function liTarefa(t) {
    const d = diasAte(t.prazo), chip = t.status === "concluido" ? '<span class="chip ok">concluído</span>' : d == null ? "" : d < 0 ? `<span class="chip bad">${-d} ${-d === 1 ? "dia" : "dias"} de atraso</span>` : d === 0 ? '<span class="chip warn">vence hoje</span>' : `<span class="chip ${d <= 3 ? "warn" : ""}">${dataBR(t.prazo)}</span>`;
    return `<div class="li click" data-act="abrirTarefa" data-id="${esc(t.id)}" role="button" tabindex="0"><span class="avatar" title="${esc(t.resp)}">${esc(iniciais(t.resp))}</span><div class="tt">${esc(t.titulo)}<small>${esc(t.resp || "sem responsável")}${t.area ? " · " + esc(t.area) : ""}</small></div><div class="dir">${chip}</div></div>`;
  }

  /* =================================================================
     5c. ENCAMINHAMENTOS · quadro, reuniões (atas) e automações
     ================================================================= */
  const ESTADOS = [{ id: "afazer", l: "A fazer", c: "#B49E87" }, { id: "andamento", l: "Em andamento", c: "#C98A12" }, { id: "aguardando", l: "Aguardando alguém", c: "#8C6469" }, { id: "concluido", l: "Concluído", c: "#4F7A4A" }];
  const PRIOS = { alta: "Alta", media: "Média", baixa: "Baixa" };
  const AREAS = ["Comercial", "Marketing", "Trade marketing", "Remuneração", "Treinamento", "Financeiro", "Diretoria"];
  const nomesPessoas = () => [...new Set([...S.data.pessoas.filter(p => p.ativo !== false).map(p => p.nome), ...S.data.tarefas.map(t => t.resp)].filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const pessoaPorNome = n => S.data.pessoas.find(p => norm(p.nome) === norm(n));

  function viewEncaminhamentos(el) {
    const sub = S.sub.encaminhamentos || "quadro";
    el.innerHTML = `<div class="subabas" role="tablist">${[["quadro", "Quadro"], ["reunioes", "Reuniões e atas"], ["automacoes", "Lembretes por e-mail"]].map(([id, l]) => `<button role="tab" aria-selected="${sub === id}" data-act="sub" data-v="encaminhamentos" data-s="${id}">${l}</button>`).join("")}</div><div id="encB"></div>`;
    ({ quadro: viewQuadro, reunioes: viewReunioes, automacoes: viewAutomacoes })[sub]($("#encB"));
  }
  function filtrarTarefas() {
    const f = S.f, b = norm(f.busca);
    return S.data.tarefas.filter(t => (!b || norm(t.titulo + " " + t.descricao + " " + t.resp).includes(b)) && (!f.resp || (f.resp === "__eu" ? norm(t.resp) === meuNome() : t.resp === f.resp)) && (!f.prio || t.prioridade === f.prio) && (!f.origem || t.origem === f.origem));
  }
  function viewQuadro(el) {
    const ts = filtrarTarefas(), pode = podeCriarTarefa();
    el.innerHTML = `<div class="filtros">
        <input class="inp busca" id="fBusca" type="search" placeholder="Buscar encaminhamento" value="${esc(S.f.busca)}" aria-label="Buscar encaminhamento">
        <select class="sel" id="fResp" aria-label="Responsável"><option value="">Todos os responsáveis</option><option value="__eu" ${S.f.resp === "__eu" ? "selected" : ""}>Só os meus</option>${nomesPessoas().map(n => `<option ${S.f.resp === n ? "selected" : ""}>${esc(n)}</option>`).join("")}</select>
        <select class="sel" id="fPrio" aria-label="Prioridade"><option value="">Qualquer prioridade</option>${Object.entries(PRIOS).map(([k, l]) => `<option value="${k}" ${S.f.prio === k ? "selected" : ""}>${l}</option>`).join("")}</select>
        <select class="sel" id="fOrig" aria-label="Reunião de origem"><option value="">Todas as reuniões</option>${S.data.reunioes.map(r => `<option value="${esc(r.id)}" ${S.f.origem === r.id ? "selected" : ""}>${esc(r.titulo)}</option>`).join("")}</select>
        ${pode ? `<button class="btn" data-act="novaTarefa" style="margin-left:auto">${ico("mais")}Novo encaminhamento</button>` : ""}
      </div>
      <div class="quadro" id="quadro">${ESTADOS.map(e => {
        const cs = ts.filter(t => (t.status || "afazer") === e.id).sort((a, b) => (a.ordem || 0) - (b.ordem || 0) || (a.prazo || "9").localeCompare(b.prazo || "9"));
        return `<section class="coluna" data-col="${e.id}" aria-label="${e.l}"><div class="col-h"><i style="background:${e.c}"></i>${e.l}<span class="n">${cs.length}</span>${pode ? `<button class="iconbtn" data-act="novaTarefa" data-status="${e.id}" aria-label="Novo em ${e.l}">${ico("mais")}</button>` : ""}</div>
          ${cs.map(cartao).join("")}${!cs.length ? `<p class="vazio" style="padding:14px 6px;font-size:13px">${e.id === "concluido" ? "O que for concluído vem para cá." : "Arraste um cartão para cá."}</p>` : ""}</section>`;
      }).join("")}</div>`;
    const deb = fn => { let t; return e => { clearTimeout(t); t = setTimeout(() => fn(e), 180); }; };
    $("#fBusca").oninput = deb(e => { S.f.busca = e.target.value; const p = e.target.selectionStart; render(); const i = $("#fBusca"); if (i) { i.focus(); i.setSelectionRange(p, p); } });
    $("#fResp").onchange = e => { S.f.resp = e.target.value; render(); };
    $("#fPrio").onchange = e => { S.f.prio = e.target.value; render(); };
    $("#fOrig").onchange = e => { S.f.origem = e.target.value; render(); };
  }
  function cartao(t) {
    const d = diasAte(t.prazo), feito = t.status === "concluido", ck = (t.checklist || []), nOk = ck.filter(c => c.ok).length;
    const prazo = !t.prazo ? "" : feito ? `<span class="chip ok">${dataBR(t.prazo)}</span>` : d < 0 ? `<span class="chip bad">${-d}d atrasado</span>` : d <= 2 ? `<span class="chip warn">${d === 0 ? "hoje" : dataBR(t.prazo)}</span>` : `<span class="chip">${dataBR(t.prazo)}</span>`;
    return `<button class="cartao" draggable="${podeEditarTarefa(t)}" data-act="abrirTarefa" data-id="${esc(t.id)}"><div class="prio p-${esc(t.prioridade || "baixa")}" title="Prioridade ${esc(PRIOS[t.prioridade] || "")}"></div><div class="t">${esc(t.titulo)}</div>
      <div class="meta"><span class="resp"><span class="avatar">${esc(iniciais(t.resp))}</span>${esc(t.resp || "Sem responsável")}</span>${prazo}${ck.length ? `<span class="chip ${nOk === ck.length ? "ok" : ""}">${nOk}/${ck.length}</span>` : ""}${t.area ? `<span class="chip marca">${esc(t.area)}</span>` : ""}</div></button>`;
  }
  /* arrastar e soltar entre colunas */
  function ligarArraste() {
    let id = null;
    document.addEventListener("dragstart", e => { const c = e.target.closest?.(".cartao"); if (!c) return; id = c.dataset.id; c.classList.add("arrast"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", id); });
    document.addEventListener("dragend", e => { e.target.closest?.(".cartao")?.classList.remove("arrast"); $$(".coluna.sobre").forEach(x => x.classList.remove("sobre")); });
    document.addEventListener("dragover", e => { const col = e.target.closest?.(".coluna"); if (!col || !id) return; e.preventDefault(); $$(".coluna.sobre").forEach(x => x !== col && x.classList.remove("sobre")); col.classList.add("sobre"); });
    document.addEventListener("drop", async e => {
      const col = e.target.closest?.(".coluna"); if (!col || !id) return; e.preventDefault(); col.classList.remove("sobre");
      const t = S.data.tarefas.find(x => x.id === id), st = col.dataset.col; id = null;
      if (!t || t.status === st || !podeEditarTarefa(t)) return;
      const antes = t.status; await salvarTarefa({ ...t, status: st }, `moveu de "${rotulo(antes)}" para "${rotulo(st)}"`);
      toast(`Movido para ${rotulo(st)}`, async () => salvarTarefa({ ...t, status: antes }, "desfez a mudança"));
    });
  }
  const rotulo = st => ESTADOS.find(e => e.id === st)?.l || st;

  async function salvarTarefa(t, acao) {
    const agora = new Date().toISOString(), velho = S.data.tarefas.find(x => x.id === t.id);
    const d = { titulo: str(t.titulo, 160), descricao: str(t.descricao, 4000), status: ESTADOS.some(e => e.id === t.status) ? t.status : "afazer", prioridade: PRIOS[t.prioridade] ? t.prioridade : "media", resp: str(t.resp, 80), prazo: /^\d{4}-\d{2}-\d{2}$/.test(t.prazo || "") ? t.prazo : "", origem: str(t.origem, 60), area: str(t.area, 40), checklist: (t.checklist || []).slice(0, 40).map(c => ({ id: c.id || uid(), t: str(c.t, 200), ok: !!c.ok })).filter(c => c.t), comentarios: (t.comentarios || []).slice(-200), ordem: t.ordem || Date.now(), atualizadoEm: agora, atualizadoPor: S.me.nome };
    if (!d.titulo) throw new Error("Dê um título ao encaminhamento.");
    d.respEmail = normEmail(pessoaPorNome(d.resp)?.email || "");
    if (d.status === "concluido" && velho?.status !== "concluido") d.concluidoEm = agora;
    if (d.status !== "concluido") d.concluidoEm = "";
    d.historico = [...(velho?.historico || []), { em: agora, por: S.me.nome, acao: acao || (velho ? "editou" : "criou") }].slice(-50);
    if (!velho) { d.criadoEm = agora; d.criadoPor = S.me.nome; d.criadoPorEmail = meuEmail(); } else { d.criadoEm = velho.criadoEm || agora; d.criadoPor = velho.criadoPor || ""; d.criadoPorEmail = velho.criadoPorEmail || ""; }
    await S.store.set("tarefas", t.id, d, false);
    const auto = cfgDoc("automacoes");
    if (S.modo === "cloud" && auto.ativo && d.respEmail && d.respEmail !== normEmail(S.me.email) && (!velho || normEmail(velho.respEmail) !== d.respEmail))
      Mail.fila([{ para: d.respEmail, assunto: `Novo encaminhamento: ${d.titulo}`, html: mailTarefa(d, `${S.me.nome} passou este encaminhamento para você.`) }]).catch(() => { });
  }

  function gavetaTarefa(t, novo) {
    const pode = novo ? podeCriarTarefa() : podeEditarTarefa(t), ro = pode ? "" : "disabled";
    const r = S.data.reunioes;
    abrirGaveta(novo ? "Novo encaminhamento" : "Encaminhamento", `
      <label class="f">O que precisa ser feito<input class="inp" id="tTit" maxlength="160" value="${esc(t.titulo)}" ${ro} required></label>
      <div class="grid2">
        <label class="f">Responsável<input class="inp" id="tResp" list="dlPessoas" value="${esc(t.resp)}" ${ro} placeholder="Nome"></label>
        <label class="f">Prazo<input class="inp" id="tPrazo" type="date" value="${esc(t.prazo)}" ${ro}></label>
        <label class="f">Situação<select class="sel inp" id="tSt" ${ro}>${ESTADOS.map(e => `<option value="${e.id}" ${t.status === e.id ? "selected" : ""}>${e.l}</option>`).join("")}</select></label>
        <label class="f">Prioridade<select class="sel inp" id="tPr" ${ro}>${Object.entries(PRIOS).map(([k, l]) => `<option value="${k}" ${t.prioridade === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <label class="f">Área<input class="inp" id="tArea" list="dlAreas" value="${esc(t.area)}" ${ro}></label>
        <label class="f">Reunião de origem<select class="sel inp" id="tOrig" ${ro}><option value="">Nenhuma</option>${r.map(x => `<option value="${esc(x.id)}" ${t.origem === x.id ? "selected" : ""}>${esc(x.titulo)}</option>`).join("")}</select></label>
      </div>
      <label class="f">Detalhes<textarea class="inp" id="tDesc" maxlength="4000" ${ro}>${esc(t.descricao)}</textarea></label>
      <div><div class="f" style="font-size:13px;font-weight:800;color:var(--muted);margin-bottom:6px">Checklist</div><div class="checklist" id="tCk">${(t.checklist || []).map(c => itemCk(c, ro)).join("")}</div>${pode ? `<button type="button" class="btn sm ghost mt-s" data-act="addCk">${ico("mais")}Adicionar item</button>` : ""}</div>
      ${novo ? "" : `<div><div style="font-size:13px;font-weight:800;color:var(--muted);margin-bottom:6px">Comentários</div><div class="lista" style="gap:6px">${(t.comentarios || []).map(c => `<div class="coment"><small>${esc(c.autor)} · ${relTempo(c.em)}</small><div>${esc(c.texto)}</div></div>`).join("") || '<p class="sub" style="margin:0;color:var(--muted)">Sem comentários.</p>'}</div>
        ${veAba("encaminhamentos") && S.me.papel !== "leitor" ? `<div style="display:flex;gap:8px;margin-top:8px"><input class="inp" id="tCom" maxlength="1000" placeholder="Escreva um comentário"><button class="btn sm" type="button" data-act="comentar" data-id="${esc(t.id)}">Comentar</button></div>` : ""}</div>
        <p style="font-size:12.5px;color:var(--muted);margin:0">${(t.historico || []).slice(-3).reverse().map(h => `${esc(h.por)} ${esc(h.acao)} ${relTempo(h.em)}`).join(" · ")}</p>`}
      <datalist id="dlPessoas">${nomesPessoas().map(n => `<option value="${esc(n)}">`).join("")}</datalist><datalist id="dlAreas">${AREAS.map(n => `<option value="${esc(n)}">`).join("")}</datalist>`,
      `${!novo && pode && podeEditar("encaminhamentos") ? `<button class="btn ghost esq" data-act="excluirTarefa" data-id="${esc(t.id)}">${ico("lixo")}Excluir</button>` : '<span class="esq"></span>'}
       ${!novo ? `<button class="btn ghost" data-act="lembrarTarefa" data-id="${esc(t.id)}">${ico("mail")}Lembrar responsável</button>` : ""}
       ${pode ? `<button class="btn" data-act="salvarTarefa" data-id="${esc(t.id)}" data-novo="${novo ? 1 : 0}">${novo ? "Criar encaminhamento" : "Salvar"}</button>` : ""}`);
  }
  const itemCk = (c, ro = "") => `<div class="it" data-id="${esc(c.id || uid())}"><input type="checkbox" ${c.ok ? "checked" : ""} ${ro} aria-label="Feito"><input class="inp" type="text" value="${esc(c.t)}" maxlength="200" ${ro}>${ro ? "" : `<button type="button" class="iconbtn" data-act="rmCk" aria-label="Remover item">${ico("x")}</button>`}</div>`;
  function lerGavetaTarefa(base) {
    return { ...base, titulo: $("#tTit").value, resp: $("#tResp").value, prazo: $("#tPrazo").value, status: $("#tSt").value, prioridade: $("#tPr").value, area: $("#tArea").value, origem: $("#tOrig").value, descricao: $("#tDesc").value, checklist: $$("#tCk .it").map(it => ({ id: it.dataset.id, ok: it.querySelector("[type=checkbox]").checked, t: it.querySelector("[type=text]").value })) };
  }

  function viewReunioes(el) {
    const rs = S.data.reunioes.slice().sort((a, b) => (b.data || "9999").localeCompare(a.data || "9999")), pode = podeEditar("encaminhamentos");
    el.innerHTML = `<section class="card"><div class="card-h"><div><h2>Reuniões e atas</h2><p class="sub">Registre a pauta, as decisões e os encaminhamentos. Cada encaminhamento vira um cartão no quadro.</p></div>${pode ? `<div class="dir"><button class="btn" data-act="novaReuniao">${ico("mais")}Nova reunião</button></div>` : ""}</div>
      ${rs.length ? `<div class="lista">${rs.map(r => { const ts = S.data.tarefas.filter(t => t.origem === r.id), ok = ts.filter(t => t.status === "concluido").length;
        return `<div class="li click" data-act="abrirReuniao" data-id="${esc(r.id)}" role="button" tabindex="0"><span class="avatar" style="background:var(--acai)">${ico("ata")}</span><div class="tt">${esc(r.titulo)}<small>${r.data ? dataBR(r.data) : "data a confirmar"} · ${esc(r.tipo || "Reunião")} · ${(r.participantes || []).length} participantes</small></div><div class="dir">${ts.length ? `<span class="chip ${ok === ts.length ? "ok" : ""}">${ok}/${ts.length} encaminhamentos</span>` : '<span class="chip">sem encaminhamentos</span>'}</div></div>`; }).join("")}</div>`
        : `<div class="vazio"><b>Nenhuma reunião registrada.</b>Comece pela próxima reunião semanal ou pela RMR.${pode ? `<br><button class="btn" data-act="novaReuniao">${ico("mais")}Registrar reunião</button>` : ""}</div>`}</section>`;
  }
  /* ---------- ATA no padrão Gomes de Matos: participantes com presença, pauta, definições,
     encaminhamentos (ação · responsável · data), pontos positivos e de melhoria ---------- */
  const PRES = { P: "Presente", NP: "Não presente", J: "Justificado" };
  const ataPart = r => {
    const pres = r.presenca || {};
    const nomes = (r.participantes || []).length ? r.participantes : S.data.pessoas.filter(p => p.ativo !== false).map(p => p.nome);
    return nomes.map(n => ({ nome: n, p: pres[n] || "P" }));
  };
  const ataPauta = r => Array.isArray(r.pautaItens) && r.pautaItens.length ? r.pautaItens : (r.pauta ? String(r.pauta).split(/\n+/).filter(Boolean).map(t => ({ t, hora: "", resp: "", ok: false })) : []);
  const linhaPart = (x, ro) => `<div class="ata-l" data-part><input class="inp" data-nome list="dlPessoas" value="${esc(x.nome)}" placeholder="Nome" ${ro}><select class="sel inp" data-pres ${ro} aria-label="Presença">${Object.keys(PRES).map(k => `<option value="${k}" ${x.p === k ? "selected" : ""}>${k} · ${PRES[k]}</option>`).join("")}</select>${ro ? "" : `<button type="button" class="iconbtn" data-act="ataRm" aria-label="Remover">${ico("x")}</button>`}</div>`;
  const linhaPauta = (x, ro) => `<div class="ata-l ata-pauta" data-pauta><input class="inp" data-t value="${esc(x.t)}" placeholder="Assunto" ${ro}><input class="inp" data-hora value="${esc(x.hora || "")}" placeholder="13:00 às 14:00" ${ro}><input class="inp" data-resp list="dlPessoas" value="${esc(x.resp || "")}" placeholder="Responsável" ${ro}><label class="ck" title="Tratado"><input type="checkbox" data-ok ${x.ok ? "checked" : ""} ${ro}><span>ok</span></label>${ro ? "" : `<button type="button" class="iconbtn" data-act="ataRm" aria-label="Remover">${ico("x")}</button>`}</div>`;
  const linhaEnc = (x, ro) => `<div class="ata-l ata-enc" data-enc><input class="inp" data-acao value="${esc(x.titulo || "")}" placeholder="Ação (o que vai ser feito)" ${ro}><input class="inp" data-resp list="dlPessoas" value="${esc(x.resp || "")}" placeholder="Responsável" ${ro}><input class="inp" type="date" data-prazo value="${esc(x.prazo || "")}" ${ro} aria-label="Data"><button type="button" class="iconbtn" data-act="ataRm" aria-label="Remover">${ico("x")}</button></div>`;
  function gavetaReuniao(r, novo) {
    const pode = podeEditar("encaminhamentos"), ro = pode ? "" : "disabled", ts = S.data.tarefas.filter(t => t.origem === r.id);
    abrirGaveta(novo ? "Nova reunião" : "Ata da reunião", `
      <label class="f">Título<input class="inp" id="rTit" maxlength="140" value="${esc(r.titulo)}" ${ro} placeholder="Ex.: Reunião Semanal de Vendas"></label>
      <div class="grid2"><label class="f">Data<input class="inp" id="rData" type="date" value="${esc(r.data)}" ${ro}></label>
        <label class="f">Tipo<select class="sel inp" id="rTipo" ${ro}>${["Semanal comercial", "RMR", "Diretoria", "Alinhamento", "Treinamento"].map(x => `<option ${r.tipo === x ? "selected" : ""}>${x}</option>`).join("")}</select></label></div>
      <div class="grid2"><label class="f">Horário de início<input class="inp" id="rIni" type="time" value="${esc(r.horaIni || "")}" ${ro}></label><label class="f">Horário de fim<input class="inp" id="rFim" type="time" value="${esc(r.horaFim || "")}" ${ro}></label></div>
      <label class="f">Condução<input class="inp" id="rCond" maxlength="120" value="${esc(r.conducao || "Gomes de Matos Consultoria")}" ${ro}></label>
      <div class="ata-bloco"><div class="ata-h">Participantes <small>P = presente · NP = não presente · J = justificado</small></div>
        <div id="rPartL">${ataPart(r).map(x => linhaPart(x, ro)).join("")}</div>${pode ? `<button type="button" class="btn sm ghost" data-act="ataAdd" data-tipo="part">${ico("mais")}Participante</button>` : ""}</div>
      <div class="ata-bloco"><div class="ata-h">Pauta</div>
        <div id="rPautaL">${ataPauta(r).map(x => linhaPauta(x, ro)).join("")}</div>${pode ? `<button type="button" class="btn sm ghost" data-act="ataAdd" data-tipo="pauta">${ico("mais")}Item de pauta</button>` : ""}</div>
      <label class="f">Definições da reunião <small>uma por linha</small><textarea class="inp" id="rDec" maxlength="8000" style="min-height:110px" ${ro}>${esc(r.decisoes)}</textarea></label>
      ${pode ? `<div class="ata-bloco"><div class="ata-h">Novos encaminhamentos <small>cada linha vira um cartão no quadro</small></div>
        <div class="ata-l ata-enc ata-cab" aria-hidden="true"><span>Ação</span><span>Responsável</span><span>Data</span><span></span></div>
        <div id="rEncL">${linhaEnc({}, "")}</div><button type="button" class="btn sm ghost" data-act="ataAdd" data-tipo="enc">${ico("mais")}Encaminhamento</button></div>` : ""}
      ${ts.length ? `<div class="ata-bloco"><div class="ata-h">Encaminhamentos desta reunião</div><div class="lista">${ts.map(liTarefa).join("")}</div></div>` : ""}
      <div class="grid2"><label class="f">Pontos positivos<textarea class="inp" id="rPos" maxlength="3000" ${ro}>${esc(r.positivos || "")}</textarea></label><label class="f">Pontos de melhoria<textarea class="inp" id="rMel" maxlength="3000" ${ro}>${esc(r.melhorias || "")}</textarea></label></div>
      <datalist id="dlPessoas">${nomesPessoas().map(n => `<option value="${esc(n)}">`).join("")}</datalist>`,
      `${!novo && pode ? `<button class="btn ghost esq" data-act="excluirReuniao" data-id="${esc(r.id)}">${ico("lixo")}Excluir</button>` : '<span class="esq"></span>'}
       ${!novo ? `<button class="btn ghost" data-act="enviarAta" data-id="${esc(r.id)}">${ico("mail")}Gerar PDF e enviar</button>` : ""}
       ${pode ? `<button class="btn" data-act="salvarReuniao" data-id="${esc(r.id)}">${novo ? "Registrar reunião" : "Salvar ata"}</button>` : ""}`);
  }
  function lerAta() {
    const part = $$("#rPartL [data-part]").map(d => ({ nome: str(d.querySelector("[data-nome]").value, 80), p: d.querySelector("[data-pres]").value })).filter(x => x.nome);
    const pauta = $$("#rPautaL [data-pauta]").map(d => ({ t: str(d.querySelector("[data-t]").value, 300), hora: str(d.querySelector("[data-hora]").value, 40), resp: str(d.querySelector("[data-resp]").value, 80), ok: d.querySelector("[data-ok]").checked })).filter(x => x.t);
    const enc = $$("#rEncL [data-enc]").map(d => ({ titulo: str(d.querySelector("[data-acao]").value, 160), resp: str(d.querySelector("[data-resp]").value, 80), prazo: d.querySelector("[data-prazo]").value })).filter(x => x.titulo);
    return { titulo: str($("#rTit").value, 140), data: $("#rData").value, tipo: $("#rTipo").value, horaIni: $("#rIni").value, horaFim: $("#rFim").value, conducao: str($("#rCond").value, 120),
      participantes: part.map(x => x.nome), presenca: Object.fromEntries(part.map(x => [x.nome, x.p])), pautaItens: pauta, pauta: pauta.map(x => x.t).join("\n"),
      decisoes: str($("#rDec").value, 8000), positivos: str($("#rPos").value, 3000), melhorias: str($("#rMel").value, 3000), _enc: enc };
  }

  /* PDF da ata (html2canvas + jsPDF, carregados só quando precisa) */
  const carregarScript = src => new Promise((ok, falha) => { if ([...document.scripts].some(s => s.src === src)) return ok(); const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => falha(new Error("não carregou " + src)); document.head.appendChild(s); });
  async function pdfAta(r) {
    await carregarScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js");
    await carregarScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
    const ts = S.data.tarefas.filter(t => t.origem === r.id), est = Object.fromEntries(ESTADOS.map(e => [e.id, e.l]));
    const part = ataPart(r), pauta = ataPauta(r), defs = String(r.decisoes || "").split(/\n+/).map(x => x.trim()).filter(Boolean);
    const titulo = /^ata\b/i.test(r.titulo || "") ? r.titulo : "ATA · " + (r.titulo || "Reunião");
    const host = document.createElement("div"); host.className = "ata-pdf";
    host.innerHTML = `
      <header><img src="assets/gomes-de-matos.png" alt=""><h1>${esc(titulo.toUpperCase())}</h1><img src="assets/simbolo.svg" alt="" class="nat"></header>
      <div class="sec">Dados da reunião</div>
      <div class="dados"><div><span>Data</span><b>${r.data ? dataBR(r.data) : "—"}</b></div><div><span>Horário de início</span><b>${esc(r.horaIni || "—")}</b></div><div><span>Horário de fim</span><b>${esc(r.horaFim || "—")}</b></div><div><span>Tipo</span><b>${esc(r.tipo || "—")}</b></div></div>
      <div class="sec">Participantes <small>P = Presente · NP = Não presente · J = Justificado</small></div>
      <div class="parts">${part.map(x => `<div><i class="p-${x.p}">${x.p}</i>${esc(x.nome)}</div>`).join("")}</div>
      <p class="cond"><b>Condução:</b> ${esc(r.conducao || "Gomes de Matos Consultoria")}</p>
      <table><thead><tr><th>Pauta</th><th style="width:22%">Horário</th><th style="width:22%">Resp.</th><th style="width:10%">Status</th></tr></thead><tbody>
        ${pauta.length ? pauta.map(x => `<tr><td>${esc(x.t)}</td><td>${esc(x.hora || "")}</td><td>${esc(x.resp || "")}</td><td class="c">${x.ok ? "✓" : ""}</td></tr>`).join("") : `<tr><td colspan="4" class="vaz">—</td></tr>`}</tbody></table>
      <div class="sec">Definições da reunião</div>
      ${defs.length ? `<ol class="defs">${defs.map(d => `<li>${esc(d.replace(/^\d+[.)]\s*/, ""))}</li>`).join("")}</ol>` : '<p class="vaz">—</p>'}
      <table><thead><tr><th>Encaminhamentos</th><th style="width:18%">Responsável</th><th style="width:11%">Prazo</th><th style="width:11%">Novo prazo</th><th style="width:13%">Status</th></tr></thead><tbody>
        ${ts.length ? ts.map(t => `<tr><td>${esc(t.titulo)}</td><td>${esc(t.resp || "")}</td><td class="c">${t.prazo ? dataBR(t.prazo) : ""}</td><td class="c">${t.novoPrazo ? dataBR(t.novoPrazo) : ""}</td><td class="c">${esc(est[t.status] || "A fazer")}</td></tr>`).join("") : `<tr><td colspan="5" class="vaz">—</td></tr>`}</tbody></table>
      <div class="pm"><div><div class="sec">Pontos positivos</div><p>${esc(r.positivos || "—").replace(/\n/g, "<br>")}</p></div><div><div class="sec">Pontos de melhoria</div><p>${esc(r.melhorias || "—").replace(/\n/g, "<br>")}</p></div></div>
      <footer>Gomes de Matos Consultoria · Projeto Naturalle Ice Up · gerado em ${new Date().toLocaleDateString("pt-BR")}</footer>`;
    document.body.appendChild(host);
    try {
      await Promise.all([...host.querySelectorAll("img")].map(i => i.complete ? 0 : new Promise(ok => { i.onload = i.onerror = ok; })));
      const canvas = await html2canvas(host, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      const { jsPDF } = window.jspdf, pdf = new jsPDF({ unit: "mm", format: "a4" }), W = 210, H = 297, M = 8;
      const pxPorMm = canvas.width / (W - 2 * M), alturaPag = Math.floor((H - 2 * M) * pxPorMm);
      for (let y = 0, pg = 0; y < canvas.height; y += alturaPag, pg++) {
        const fatia = document.createElement("canvas"); fatia.width = canvas.width; fatia.height = Math.min(alturaPag, canvas.height - y);
        fatia.getContext("2d").drawImage(canvas, 0, y, canvas.width, fatia.height, 0, 0, canvas.width, fatia.height);
        if (pg) pdf.addPage();
        pdf.addImage(fatia.toDataURL("image/jpeg", 0.92), "JPEG", M, M, W - 2 * M, fatia.height / pxPorMm);
      }
      const nome = `ATA - ${(r.titulo || "Reunião").replace(/[\\/:*?"<>|]/g, "")} - ${r.data ? dataBR(r.data).replace(/\//g, ".") : "sem data"}.pdf`;
      pdf.save(nome);
      return nome;
    } finally { host.remove(); }
  }
  function lerEncaminhamentos(txt, ano) {
    return String(txt || "").split(/\n+/).map(l => l.trim()).filter(Boolean).map(l => {
      const p = l.split(/\s*[·|;]\s*|\s+-\s+/), m = /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/.exec(p[2] || p[1] || "");
      let prazo = ""; if (m) { const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : ano; prazo = `${y}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`; }
      return { titulo: p[0], resp: p[1] && !/^\d/.test(p[1]) ? p[1] : "", prazo };
    });
  }

  function viewAutomacoes(el) {
    const a = { ativo: false, diasAntes: 2, atrasadas: true, resumoSemanal: true, diaResumo: 1, destinatarios: [], ...cfgDoc("automacoes") }, pode = podeEditar("encaminhamentos");
    const semEmail = nomesPessoas().filter(n => !normEmail(pessoaPorNome(n)?.email));
    el.innerHTML = `<div class="linha l2">
      <section class="card"><div class="card-h"><div><h2>Lembretes automáticos</h2><p class="sub">${S.modo === "cloud" ? "O robô de e-mails (Google Apps Script) lê esta configuração todo dia às 7h." : "Funciona com a nuvem ligada. No modo equipe, use o botão Lembrar responsável dentro de cada cartão."}</p></div></div>
        <form class="lista" style="gap:12px" id="auForm">
          <label class="ck"><input type="checkbox" id="auOn" ${a.ativo ? "checked" : ""} ${pode ? "" : "disabled"}><span>Enviar lembretes por e-mail</span></label>
          <label class="ck"><input type="checkbox" id="auNovo" checked disabled><span>Avisar a pessoa quando receber um encaminhamento</span></label>
          <label class="f">Lembrar antes do prazo<select class="sel inp" id="auDias" ${pode ? "" : "disabled"}>${[1, 2, 3, 5, 7].map(d => `<option value="${d}" ${+a.diasAntes === d ? "selected" : ""}>${d} ${d === 1 ? "dia" : "dias"} antes</option>`).join("")}</select></label>
          <label class="ck"><input type="checkbox" id="auAtr" ${a.atrasadas ? "checked" : ""} ${pode ? "" : "disabled"}><span>Cobrar todo dia os encaminhamentos atrasados</span></label>
          <label class="ck"><input type="checkbox" id="auSem" ${a.resumoSemanal ? "checked" : ""} ${pode ? "" : "disabled"}><span>Resumo semanal para a gestão</span></label>
          <div class="grid2"><label class="f">Dia do resumo<select class="sel inp" id="auDia" ${pode ? "" : "disabled"}>${["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"].map((d, i) => `<option value="${i}" ${+a.diaResumo === i ? "selected" : ""}>${d}</option>`).join("")}</select></label>
          <label class="f">Quem recebe o resumo<input class="inp" id="auDest" value="${esc((a.destinatarios || []).join(", "))}" placeholder="e-mails separados por vírgula" ${pode ? "" : "disabled"}></label></div>
          ${pode ? `<div><button class="btn" type="submit">Salvar lembretes</button></div>` : ""}
          ${a.ultimaExecucao ? `<p class="sub" style="color:var(--muted);margin:0">Última execução do robô: ${dataBR(a.ultimaExecucao)} ${esc(a.ultimoResultado || "")}</p>` : ""}
        </form></section>
      <section class="card"><div class="card-h"><div><h2>Quem recebe</h2><p class="sub">Os e-mails vêm do cadastro de pessoas.</p></div>${ehAdmin() ? `<div class="dir"><button class="btn sm ghost" data-act="ir" data-to="config" data-sub="pessoas">${ico("pessoas")}Pessoas</button></div>` : ""}</div>
        ${semEmail.length ? `<p class="aviso-modo" style="margin:0 0 10px">${semEmail.length} ${semEmail.length === 1 ? "pessoa está" : "pessoas estão"} sem e-mail e não ${semEmail.length === 1 ? "recebe" : "recebem"} lembretes: ${semEmail.map(esc).join(", ")}.</p>` : `<p class="chip ok">Todos os responsáveis têm e-mail.</p>`}
        <div class="lista">${S.data.pessoas.filter(p => p.ativo !== false).map(p => `<div class="li"><span class="avatar">${esc(iniciais(p.nome))}</span><div class="tt">${esc(p.nome)}<small>${esc(p.email || "sem e-mail")}</small></div></div>`).join("")}</div></section></div>`;
    $("#auForm").onsubmit = async e => { e.preventDefault(); const dest = $("#auDest").value.split(/[,;\s]+/).map(normEmail).filter(emailOk);
      await guardar(() => S.store.set("config", "automacoes", { ativo: $("#auOn").checked, diasAntes: +$("#auDias").value, atrasadas: $("#auAtr").checked, resumoSemanal: $("#auSem").checked, diaResumo: +$("#auDia").value, destinatarios: dest, atualizadoEm: new Date().toISOString(), por: S.me.nome }), "Lembretes salvos"); };
  }

  /* =================================================================
     6. E-MAILS · fila no Firestore, enviada pelo robô (robo-emails.gs)
     ================================================================= */
  const Mail = {
    async fila(lista) {
      if (S.modo !== "cloud") throw new Error("local");
      for (const m of lista) await S.store.set("mail", uid(), { para: normEmail(m.para), assunto: str(m.assunto, 180), html: String(m.html).slice(0, 60000), status: "pendente", criadoEm: new Date().toISOString(), por: normEmail(S.me.email) }, false);
    },
    mailto(para, assunto, texto) { location.href = `mailto:${encodeURIComponent(para || "")}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(texto)}`; },
  };
  const linkPlat = (hash = "") => (CFG.urlPublica || location.href.split("#")[0]) + hash;
  const mailCasca = (titulo, corpo) => `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#2A1F17"><div style="background:#2B1A10;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0;font-weight:bold;font-size:16px">Naturalle · Plataforma comercial</div><div style="border:1px solid #E6DCCD;border-top:0;padding:20px;border-radius:0 0 12px 12px"><h2 style="margin:0 0 12px;font-size:18px">${esc(titulo)}</h2>${corpo}<p style="margin-top:22px"><a href="${esc(linkPlat("#encaminhamentos"))}" style="background:#A15F1D;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold">Abrir a plataforma</a></p></div></div>`;
  const mailTarefa = (t, intro) => mailCasca(t.titulo, `<p>${esc(intro)}</p><p><b>Prazo:</b> ${t.prazo ? dataBR(t.prazo) : "sem prazo"}<br><b>Prioridade:</b> ${esc(PRIOS[t.prioridade] || "")}</p>${t.descricao ? `<p style="white-space:pre-wrap">${esc(t.descricao)}</p>` : ""}`);
  const textoAta = r => { const ts = S.data.tarefas.filter(t => t.origem === r.id), pres = r.presenca || {}; return `${r.titulo}\n${r.data ? "Data: " + dataBR(r.data) + (r.horaIni ? " · " + r.horaIni + (r.horaFim ? " às " + r.horaFim : "") : "") + "\n" : ""}Participantes: ${(r.participantes || []).map(n => n + (pres[n] && pres[n] !== "P" ? " (" + pres[n] + ")" : "")).join(", ")}\nCondução: ${r.conducao || "Gomes de Matos Consultoria"}\n\nPauta\n${(r.pautaItens || []).map(p => "- " + p.t + (p.resp ? " · " + p.resp : "")).join("\n") || r.pauta || "-"}\n\nDefinições\n${r.decisoes || "-"}\n\nEncaminhamentos\n${ts.map(t => `- ${t.titulo} · ${t.resp || "sem responsável"}${t.prazo ? " · até " + dataBR(t.prazo) : ""}`).join("\n") || "-"}\n\n${linkPlat("#encaminhamentos/reunioes")}`; };

  /* =================================================================
     5d. PLANEJAMENTO COMERCIAL · metas do ano e frentes com iniciativas
     ================================================================= */
  const ST_INI = { nao_iniciada: { l: "Não iniciada", c: "" }, andamento: { l: "Em andamento", c: "warn" }, concluida: { l: "Concluída", c: "ok" }, pausada: { l: "Pausada", c: "" } };
  function viewPlanejamento(el) {
    const sub = S.sub.planejamento || "plano";
    el.innerHTML = `<div class="subabas" role="tablist">${[["plano", "Frentes e iniciativas"], ["metas", "Metas do ano"]].map(([id, l]) => `<button role="tab" aria-selected="${sub === id}" data-act="sub" data-v="planejamento" data-s="${id}">${l}</button>`).join("")}</div><div id="plB"></div>`;
    (sub === "metas" ? viewMetas : viewPlano)($("#plB"));
  }
  function viewPlano(el) {
    const fs = S.data.frentes.slice().sort((a, b) => (a.ordem || 0) - (b.ordem || 0)), pode = podeEditar("planejamento"), ini = S.data.iniciativas;
    const tot = ini.length, ok = ini.filter(i => i.status === "concluida").length, atras = ini.filter(i => i.status !== "concluida" && i.prazo && diasAte(i.prazo) < 0).length;
    el.innerHTML = `<div class="linha l3"><div class="card kpi"><div class="t">Iniciativas concluídas</div><div class="v">${ok} de ${tot}</div><div class="s">${tot ? nBR(ok / tot * 100, 0) + "% do plano" : "cadastre a primeira iniciativa"}</div></div>
      <div class="card kpi"><div class="t">Em andamento</div><div class="v warn">${ini.filter(i => i.status === "andamento").length}</div><div class="s">com responsável definido</div></div>
      <div class="card kpi"><div class="t">Prazo vencido</div><div class="v ${atras ? "bad" : "ok"}">${atras}</div><div class="s">${atras ? "pedem nova data ou conclusão" : "nenhuma atrasada"}</div></div></div>
      <div class="card-h mt"><div><h2>Frentes do planejamento comercial</h2><p class="sub">Cada frente reúne as iniciativas que levam a empresa ao próximo horizonte.</p></div>${pode ? `<div class="dir"><button class="btn ghost" data-act="novaFrente">${ico("mais")}Nova frente</button></div>` : ""}</div>
      ${fs.length ? fs.map(f => { const is = ini.filter(i => i.frente === f.id).sort((a, b) => (a.prazo || "9").localeCompare(b.prazo || "9")), pr = is.length ? sum(is, i => i.status === "concluida" ? 100 : +i.progresso || 0) / is.length : 0;
        return `<section class="frente"><div class="frente-h"><div style="min-width:0"><h3>${esc(f.nome)}</h3><div class="sub">${esc(f.descricao || "")}</div></div><div class="dir"><div class="prog" style="width:90px" title="${nBR(pr, 0)}%"><i class="${pr >= 100 ? "ok" : ""}" style="width:${pr.toFixed(0)}%"></i></div><b class="num" style="font-size:13px">${nBR(pr, 0)}%</b>${pode ? `<button class="iconbtn" data-act="editarFrente" data-id="${esc(f.id)}" aria-label="Editar frente">${ico("editar")}</button><button class="iconbtn" data-act="novaIniciativa" data-frente="${esc(f.id)}" aria-label="Nova iniciativa">${ico("mais")}</button>` : ""}</div></div>
          ${is.map(i => { const d = diasAte(i.prazo), atr = i.status !== "concluida" && d != null && d < 0, p = i.status === "concluida" ? 100 : +i.progresso || 0;
            return `<div class="inic li click" data-act="abrirIniciativa" data-id="${esc(i.id)}" role="button" tabindex="0" style="display:grid"><div class="tt">${esc(i.titulo)}<small>${esc(i.resp || "sem responsável")}</small></div><span class="chip ${atr ? "bad" : ST_INI[i.status]?.c || ""}">${atr ? "prazo vencido" : ST_INI[i.status]?.l || ""}</span><span class="esc" style="font-size:13px;color:var(--muted)">${i.prazo ? dataBR(i.prazo) : "sem prazo"}</span><div class="prog esc"><i class="${p >= 100 ? "ok" : atr ? "bad" : ""}" style="width:${p}%"></i></div><span class="esc num" style="font-size:12.5px;font-weight:800">${p}%</span></div>`; }).join("") || `<p class="vazio" style="padding:14px">Nenhuma iniciativa nesta frente.</p>`}</section>`; }).join("")
        : `<div class="card vazio"><b>O planejamento ainda está vazio.</b>Crie as frentes (ex.: estrutura comercial, novos clientes) e as iniciativas de cada uma.</div>`}`;
  }
  function gavetaFrente(f, novo) {
    abrirGaveta(novo ? "Nova frente" : "Frente", `<label class="f">Nome<input class="inp" id="fNome" maxlength="100" value="${esc(f.nome)}"></label><label class="f">Descrição<textarea class="inp" id="fDesc" maxlength="1500">${esc(f.descricao)}</textarea></label>`,
      `${novo ? '<span class="esq"></span>' : `<button class="btn ghost esq" data-act="excluirFrente" data-id="${esc(f.id)}">${ico("lixo")}Excluir</button>`}<button class="btn" data-act="salvarFrente" data-id="${esc(f.id)}">${novo ? "Criar frente" : "Salvar"}</button>`);
  }
  function gavetaIniciativa(i, novo) {
    const pode = podeEditar("planejamento"), ro = pode ? "" : "disabled";
    abrirGaveta(novo ? "Nova iniciativa" : "Iniciativa", `
      <label class="f">Iniciativa<input class="inp" id="iTit" maxlength="160" value="${esc(i.titulo)}" ${ro}></label>
      <div class="grid2"><label class="f">Frente<select class="sel inp" id="iFr" ${ro}>${S.data.frentes.map(f => `<option value="${esc(f.id)}" ${i.frente === f.id ? "selected" : ""}>${esc(f.nome)}</option>`).join("")}</select></label>
        <label class="f">Responsável<input class="inp" id="iResp" list="dlPessoas" value="${esc(i.resp)}" ${ro}></label>
        <label class="f">Prazo<input class="inp" id="iPrazo" type="date" value="${esc(i.prazo)}" ${ro}></label>
        <label class="f">Situação<select class="sel inp" id="iSt" ${ro}>${Object.entries(ST_INI).map(([k, v]) => `<option value="${k}" ${i.status === k ? "selected" : ""}>${v.l}</option>`).join("")}</select></label></div>
      <label class="f">Andamento: <b id="iPv">${+i.progresso || 0}%</b><input type="range" id="iProg" min="0" max="100" step="5" value="${+i.progresso || 0}" ${ro} style="accent-color:var(--caramelo)"></label>
      <label class="f">Observações<textarea class="inp" id="iObs" maxlength="2000" ${ro}>${esc(i.obs)}</textarea></label>
      <datalist id="dlPessoas">${nomesPessoas().map(n => `<option value="${esc(n)}">`).join("")}</datalist>`,
      `${!novo && pode ? `<button class="btn ghost esq" data-act="excluirIniciativa" data-id="${esc(i.id)}">${ico("lixo")}Excluir</button>` : '<span class="esq"></span>'}${!novo && podeCriarTarefa() ? `<button class="btn ghost" data-act="iniciativaParaTarefa" data-id="${esc(i.id)}">Criar encaminhamento</button>` : ""}${pode ? `<button class="btn" data-act="salvarIniciativa" data-id="${esc(i.id)}">${novo ? "Criar iniciativa" : "Salvar"}</button>` : ""}`);
    const r = $("#iProg"); if (r) r.oninput = () => $("#iPv").textContent = r.value + "%";
  }
  function viewMetas(el) {
    const anos = [...new Set([new Date().getFullYear(), ...mesesComDados().map(x => x.ano)])].sort((a, b) => b - a), ano = +(S.sub.metasAno || anos[0]), pode = podeEditar("planejamento");
    const doc = S.data.metas.find(x => x.id === String(ano)) || {};
    const linhas = MESES.map((_, i) => { const m = i + 1, real = sum(recsMes(ano, m), r => r.venda), metaV = doc["m" + m] ? +doc["m" + m] : null, metaVend = sum(recsMes(ano, m), r => r.meta); return { m, real, meta: metaV, metaVend }; });
    const tMeta = sum(linhas, l => l.meta || 0), tReal = sum(linhas, l => l.real), tRealComMeta = sum(linhas.filter(l => l.meta), l => l.real);
    el.innerHTML = `<section class="card"><div class="card-h"><div><h2>Metas de faturamento ${ano}</h2><p class="sub">Meta da empresa por mês (sem imposto). O realizado vem da aba Vendas da planilha.${S.vendasErro ? " " + esc(S.vendasErro) : ""}</p></div>
        <div class="dir"><select class="sel inp" id="mAno" style="width:auto">${anos.map(a => `<option ${a === ano ? "selected" : ""}>${a}</option>`).join("")}</select>${S.links ? `<button class="btn sm ghost" data-act="recarregarVendas">${ico("recarregar")}Atualizar</button>` : ""}</div></div>
      <div class="graf"><canvas id="gMetas" aria-label="Meta e realizado por mês"></canvas></div>
      <div class="tab-wrap mt"><table class="t resp"><thead><tr><th>Mês</th><th class="r">Meta da empresa</th><th class="r">Soma das metas dos vendedores</th><th class="r">Realizado</th><th class="r">Atingimento</th></tr></thead><tbody>
        ${linhas.map(l => { const at = l.meta && l.real ? l.real / l.meta * 100 : null; return `<tr><td data-l="Mês"><b>${MESES_L[l.m - 1]}</b></td><td class="r" data-l="Meta">${pode ? `<input class="inp num" data-meta="${l.m}" inputmode="numeric" value="${l.meta ? nBR(l.meta) : ""}" placeholder="—" aria-label="Meta de ${MESES_L[l.m - 1]}">` : (l.meta ? BRL.format(l.meta) : "—")}</td><td class="r num" data-l="Metas vendedores">${l.metaVend ? BRL.format(l.metaVend) : "—"}</td><td class="r num" data-l="Realizado">${l.real ? BRL.format(l.real) : "—"}</td><td class="r" data-l="Atingimento">${at != null ? `<span class="chip ${at >= 100 ? "ok" : at >= 90 ? "warn" : "bad"}">${nBR(at, 1)}%</span>` : "—"}</td></tr>`; }).join("")}
        <tr class="tot"><td data-l="Total">Ano</td><td class="r num" data-l="Meta">${tMeta ? BRL.format(tMeta) : "—"}</td><td></td><td class="r num" data-l="Realizado">${BRL.format(tReal)}</td><td class="r" data-l="Atingimento" title="Só os meses com meta">${tMeta ? nBR(tRealComMeta / tMeta * 100, 1) + "%" : "—"}</td></tr></tbody></table></div></section>`;
    $("#mAno").onchange = e => { S.sub.metasAno = e.target.value; render(); };
    $$("[data-meta]").forEach(i => i.onchange = async () => { const v = parseValor(i.value); await guardar(() => S.store.set("metas", String(ano), { ["m" + i.dataset.meta]: v || null, atualizadoEm: new Date().toISOString(), por: S.me.nome }), "Meta salva"); });
    grafico("gMetas", { type: "bar", data: { labels: MESES, datasets: [{ type: "line", label: "Meta", data: linhas.map(l => l.meta), borderColor: "#2B1A10", backgroundColor: "#2B1A10", borderDash: [6, 4], pointRadius: 3, spanGaps: false, datalabels: { display: false } }, { label: "Realizado", data: linhas.map(l => l.real || null), backgroundColor: linhas.map(l => l.meta && l.real >= l.meta ? "#4F7A4A" : "#C98A4B"), borderRadius: 6 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { usePointStyle: true } }, datalabels: { anchor: "end", align: "end", formatter: v => v ? brlMil(v).replace("R$ ", "") : "", font: { weight: "bold", size: 11 }, color: "#2A1F17" } }, scales: { y: { beginAtZero: true, grace: "12%", ticks: { callback: v => brlMil(v) } }, x: { grid: { display: false } } } } });
  }

  /* =================================================================
     5e. REMUNERAÇÃO · comissão de vendedores e supervisor
     ================================================================= */
  const REGRA_EXEMPLO = { exemplo: true, vendedor: { pct: 2, fixo: 0, bonusMeta: 0, faixas: [{ de: 0, mult: 0.5 }, { de: 80, mult: 0.8 }, { de: 100, mult: 1 }, { de: 120, mult: 1.2 }] }, individuais: {}, supervisor: { nome: "RODRIGO", pct: 0.5, bonusMeta: 0, faixas: [{ de: 0, mult: 0 }, { de: 90, mult: 0.8 }, { de: 100, mult: 1 }, { de: 110, mult: 1.2 }] } };
  const multDe = (faixas, at) => { if (at == null) return 1; let m = 0; (faixas || []).slice().sort((a, b) => a.de - b.de).forEach(f => { if (at >= f.de) m = +f.mult; }); return m; };
  function calcRemuneracao(ano, mes, regras, simul = {}) {
    const rs = recsMes(ano, mes).filter(r => r.grupo !== VendasDados.GRUPO_CANAIS);
    const linhas = rs.map(r => {
      const ind = regras.individuais?.[norm(r.vendedor)] || {}, base = regras.vendedor || {};
      const venda = simul[r.vendedor] != null ? simul[r.vendedor] : r.venda, pct = ind.pct ?? base.pct ?? 0, fixo = ind.fixo ?? base.fixo ?? 0;
      const at = r.meta ? venda / r.meta * 100 : null, mult = multDe(base.faixas, at), comissao = venda * pct / 100 * mult, bonus = at != null && at >= 100 ? (+base.bonusMeta || 0) : 0;
      return { vendedor: r.vendedor, grupo: r.grupo, venda, real: r.venda, meta: r.meta, at, pct, mult, comissao, bonus, fixo, total: fixo + comissao + bonus, simulado: simul[r.vendedor] != null };
    }).sort((a, b) => b.total - a.total);
    const sup = regras.supervisor || {}, comMeta = linhas.filter(l => l.meta), baseEq = sum(linhas, l => l.venda), atEq = comMeta.length ? sum(comMeta, l => l.venda) / sum(comMeta, l => l.meta) * 100 : null;
    const multS = multDe(sup.faixas, atEq), comS = baseEq * (+sup.pct || 0) / 100 * multS, bonS = atEq != null && atEq >= 100 ? (+sup.bonusMeta || 0) : 0;
    return { linhas, sup: { nome: sup.nome || "Supervisor", base: baseEq, at: atEq, pct: +sup.pct || 0, mult: multS, comissao: comS, bonus: bonS, total: comS + bonS } };
  }
  function viewRemuneracao(el) {
    const meses = mesesComDados(), rg = cfgDoc("remuneracao"), temRegra = !!rg.vendedor, pode = podeEditar("remuneracao");
    if (!S.vendas) { el.innerHTML = `<div class="card vazio"><b>Sem dados de vendas.</b>${esc(S.vendasErro || "A remuneração usa o faturamento e as metas da aba Vendas.")}${S.links ? `<br><button class="btn" data-act="recarregarVendas">${ico("recarregar")}Tentar de novo</button>` : ""}</div>`; return; }
    const sel = S.sub.remMes || (meses[0] ? meses[0].ano + "-" + meses[0].mes : ""), [ano, mes] = sel.split("-").map(Number);
    const regras = temRegra ? rg : REGRA_EXEMPLO, R = calcRemuneracao(ano, mes, regras, S.simul || {});
    const tot = sum(R.linhas, l => l.total) + R.sup.total, fat = sum(R.linhas, l => l.venda);
    el.innerHTML = `${!temRegra ? `<div class="aviso-modo" style="background:var(--caramelo-cl);color:var(--caramelo-esc)">${ico("rem")}<span><b>Regra de exemplo.</b> Os valores abaixo usam 2% sobre o faturamento com escala por atingimento, só para mostrar como a tela funciona. Cadastre a regra real antes de usar para pagamento.</span>${pode ? `<button class="btn sm" data-act="regras">Cadastrar regra</button>` : ""}</div>` : ""}
      <div class="filtros"><select class="sel inp" id="remMes" style="width:auto" aria-label="Mês">${meses.map(x => `<option value="${x.ano}-${x.mes}" ${sel === x.ano + "-" + x.mes ? "selected" : ""}>${MESES_L[x.mes - 1]}/${x.ano}</option>`).join("")}</select>
        ${pode ? `<button class="btn ghost" data-act="regras">${ico("editar")}Regras de comissão</button>` : ""}<button class="btn ghost" data-act="exportarRem">${ico("baixar")}Baixar planilha</button>${Object.keys(S.simul || {}).length ? `<button class="btn ghost" data-act="limparSimul">Limpar simulação</button>` : ""}</div>
      <div class="linha l4"><div class="card kpi"><div class="t">Total de remuneração variável</div><div class="v">${BRL.format(tot)}</div><div class="s">${MESES_L[mes - 1]}/${ano}${temRegra ? "" : " · regra de exemplo"}</div></div>
        <div class="card kpi"><div class="t">Custo sobre o faturamento</div><div class="v">${fat ? nBR(tot / fat * 100, 2) + "%" : "—"}</div><div class="s">equipe comercial: ${BRL.format(fat)}</div></div>
        <div class="card kpi"><div class="t">Atingimento da equipe</div><div class="v ${R.sup.at >= 100 ? "ok" : R.sup.at != null ? "bad" : ""}">${R.sup.at != null ? nBR(R.sup.at, 1) + "%" : "—"}</div><div class="s">vendedores com meta</div></div>
        <div class="card kpi"><div class="t">Supervisor · ${esc(capital(R.sup.nome))}</div><div class="v">${BRL.format(R.sup.total)}</div><div class="s">${nBR(R.sup.pct, 2)}% sobre a equipe × ${nBR(R.sup.mult, 2)}</div></div></div>
      <div class="linha l2 mt">
        <section class="card"><div class="card-h"><div><h2>Por vendedor</h2><p class="sub">Digite um valor em "Simular" para ver quanto a pessoa ganharia vendendo mais. Outros canais (distribuidores, iFood) ficam fora da base.</p></div></div>
          <div class="tab-wrap"><table class="t resp"><thead><tr><th>Vendedor</th><th class="r">Faturado</th><th class="r">Meta</th><th class="r">Ating.</th><th class="r">%</th><th class="r">Escala</th><th class="r">Comissão</th><th class="r">Bônus</th><th class="r">Total</th><th class="r">Simular</th></tr></thead><tbody>
          ${R.linhas.map(l => `<tr><td data-l="Vendedor"><b>${esc(capital(l.vendedor))}</b>${l.simulado ? ' <span class="chip warn">simulado</span>' : ""}</td><td class="r num" data-l="Faturado">${BRL.format(l.venda)}</td><td class="r num" data-l="Meta">${l.meta ? BRL.format(l.meta) : "—"}</td><td class="r" data-l="Ating.">${l.at != null ? `<span class="chip ${l.at >= 100 ? "ok" : l.at >= 80 ? "warn" : "bad"}">${nBR(l.at, 0)}%</span>` : '<span class="chip">sem meta</span>'}</td><td class="r num" data-l="%">${nBR(l.pct, 2)}%</td><td class="r num" data-l="Escala">${nBR(l.mult, 2)}×</td><td class="r num" data-l="Comissão">${BRL2.format(l.comissao)}</td><td class="r num" data-l="Bônus">${l.bonus ? BRL2.format(l.bonus) : "—"}</td><td class="r num" data-l="Total"><b>${BRL2.format(l.total)}</b></td><td class="r" data-l="Simular"><input class="inp num" data-simul="${esc(l.vendedor)}" inputmode="numeric" placeholder="R$" value="${l.simulado ? nBR(l.venda) : ""}" aria-label="Simular faturamento de ${esc(l.vendedor)}"></td></tr>`).join("")}
          <tr class="tot"><td data-l="Supervisor">Supervisor · ${esc(capital(R.sup.nome))}</td><td class="r num" data-l="Base">${BRL.format(R.sup.base)}</td><td></td><td class="r" data-l="Ating.">${R.sup.at != null ? nBR(R.sup.at, 0) + "%" : "—"}</td><td class="r num" data-l="%">${nBR(R.sup.pct, 2)}%</td><td class="r num" data-l="Escala">${nBR(R.sup.mult, 2)}×</td><td class="r num" data-l="Comissão">${BRL2.format(R.sup.comissao)}</td><td class="r num" data-l="Bônus">${R.sup.bonus ? BRL2.format(R.sup.bonus) : "—"}</td><td class="r num" data-l="Total">${BRL2.format(R.sup.total)}</td><td></td></tr></tbody></table></div></section>
        <section class="card"><div class="card-h"><div><h2>Quanto cada um recebe</h2><p class="sub">Total variável do mês.</p></div></div><div class="graf" style="height:${Math.max(240, R.linhas.length * 38 + 60)}px"><canvas id="gRem" aria-label="Remuneração por vendedor"></canvas></div>
          <h3 style="font-size:15px;margin-top:14px">Escala por atingimento</h3><p class="sub" style="color:var(--muted);margin:4px 0 0">${(regras.vendedor.faixas || []).slice().sort((a, b) => a.de - b.de).map(f => `a partir de ${f.de}%: ${nBR(f.mult, 2)}×`).join(" · ")}</p></section></div>`;
    $("#remMes").onchange = e => { S.sub.remMes = e.target.value; S.simul = {}; render(); };
    $$("[data-simul]").forEach(i => i.onchange = () => { S.simul = S.simul || {}; const v = parseValor(i.value); if (v == null) delete S.simul[i.dataset.simul]; else S.simul[i.dataset.simul] = v; render(); });
    grafico("gRem", { type: "bar", data: { labels: R.linhas.map(l => capital(l.vendedor)), datasets: [{ label: "Total", data: R.linhas.map(l => +l.total.toFixed(2)), backgroundColor: R.linhas.map(l => l.at >= 100 ? "#4F7A4A" : "#A15F1D"), borderRadius: 6 }] },
      options: { indexAxis: "y", maintainAspectRatio: false, plugins: { legend: { display: false }, datalabels: { anchor: "end", align: "end", formatter: v => BRL.format(v), font: { weight: "bold", size: 11 }, color: "#2A1F17" } }, scales: { x: { beginAtZero: true, grace: "22%", ticks: { callback: v => BRL.format(v) } }, y: { grid: { display: false } } } } });
  }
  function gavetaRegras() {
    const rg = cfgDoc("remuneracao").vendedor ? cfgDoc("remuneracao") : REGRA_EXEMPLO, v = rg.vendedor, s = rg.supervisor;
    const vendNomes = [...new Set((S.vendas?.recs || []).filter(r => r.grupo !== VendasDados.GRUPO_CANAIS).map(r => norm(r.vendedor)))].sort();
    const fx = (id, fs) => `<div class="checklist" id="${id}">${fs.slice().sort((a, b) => a.de - b.de).map(f => `<div class="it"><span style="font-size:13px;font-weight:800;color:var(--muted)">a partir de</span><input class="inp num" style="max-width:80px" data-de value="${f.de}" inputmode="decimal"><span style="font-size:13px;font-weight:800;color:var(--muted)">% → paga</span><input class="inp num" style="max-width:80px" data-mult value="${f.mult}" inputmode="decimal"><span style="font-size:13px;font-weight:800;color:var(--muted)">×</span><button type="button" class="iconbtn" data-act="rmFaixa" aria-label="Remover faixa">${ico("x")}</button></div>`).join("")}</div><button type="button" class="btn sm ghost mt-s" data-act="addFaixa" data-alvo="${id}">${ico("mais")}Faixa</button>`;
    abrirGaveta("Regras de comissão", `
      <p class="sub" style="color:var(--muted);margin:0">Comissão = faturamento sem imposto × % × escala do atingimento. Bônus quando bate 100% da meta.</p>
      <h3 style="font-size:16px">Vendedores</h3>
      <div class="grid3"><label class="f">% sobre o faturamento<input class="inp" id="rgPct" inputmode="decimal" value="${v.pct}"></label><label class="f">Fixo (R$)<input class="inp" id="rgFixo" inputmode="decimal" value="${v.fixo || 0}"></label><label class="f">Bônus meta batida (R$)<input class="inp" id="rgBonus" inputmode="decimal" value="${v.bonusMeta || 0}"></label></div>
      <div><div style="font-size:13px;font-weight:800;color:var(--muted);margin-bottom:6px">Escala por atingimento da meta individual</div>${fx("fxV", v.faixas || [])}</div>
      <div><div style="font-size:13px;font-weight:800;color:var(--muted);margin-bottom:6px">Exceções por vendedor <small style="font-weight:600">(deixe em branco para usar a regra geral)</small></div>
        <table class="t"><thead><tr><th>Vendedor</th><th>%</th><th>Fixo</th></tr></thead><tbody>${vendNomes.map(n => { const i = rg.individuais?.[n] || {}; return `<tr data-ind="${esc(n)}"><td>${esc(capital(n))}</td><td><input class="inp" data-ipct inputmode="decimal" value="${i.pct ?? ""}" placeholder="${v.pct}"></td><td><input class="inp" data-ifixo inputmode="decimal" value="${i.fixo ?? ""}" placeholder="${v.fixo || 0}"></td></tr>`; }).join("")}</tbody></table></div>
      <h3 style="font-size:16px">Supervisor</h3>
      <div class="grid3"><label class="f">Nome na planilha<input class="inp" id="rgSNome" value="${esc(s.nome)}"></label><label class="f">% sobre a equipe<input class="inp" id="rgSPct" inputmode="decimal" value="${s.pct}"></label><label class="f">Bônus equipe na meta (R$)<input class="inp" id="rgSBonus" inputmode="decimal" value="${s.bonusMeta || 0}"></label></div>
      <div><div style="font-size:13px;font-weight:800;color:var(--muted);margin-bottom:6px">Escala por atingimento da equipe</div>${fx("fxS", s.faixas || [])}</div>`,
      `<span class="esq"></span><button class="btn" data-act="salvarRegras">Salvar regras</button>`);
  }
  const numIn = v => { const x = parseFloat(String(v).replace(/\./g, "").replace(",", ".")); return isFinite(x) ? x : null; };
  const numPct = v => { const x = parseFloat(String(v).replace(",", ".")); return isFinite(x) ? x : null; };
  const lerFaixas = id => $$(`#${id} .it`).map(it => ({ de: numPct(it.querySelector("[data-de]").value), mult: numPct(it.querySelector("[data-mult]").value) })).filter(f => f.de != null && f.mult != null);

  /* =================================================================
     5f. CONFIGURAÇÕES
     ================================================================= */
  function viewConfig(el) {
    const tabs = [["conta", "Minha conta", true], ["pessoas", "Pessoas e acessos", ehAdmin()], ["metas", "Metas e feriados", ehGestao()], ["seguranca", "Segurança", ehAdmin()], ["nuvem", "Nuvem e dados", ehAdmin()], ["sobre", "Privacidade", true]].filter(t => t[2]);
    const sub = tabs.some(t => t[0] === S.sub.config) ? S.sub.config : "conta";
    el.innerHTML = `<div class="subabas" role="tablist">${tabs.map(([id, l]) => `<button role="tab" aria-selected="${sub === id}" data-act="sub" data-v="config" data-s="${id}">${l}</button>`).join("")}</div><div id="cfB"></div>`;
    ({ conta: S.modo === "local" ? cfgContaPortal : cfgConta, pessoas: S.modo === "local" ? cfgAcessos : cfgPessoas, metas: cfgMetas, seguranca: cfgSeguranca, nuvem: cfgNuvem, sobre: cfgSobre })[sub]($("#cfB"));
  }
  function cfgConta(el) {
    el.innerHTML = `<div class="linha l2"><section class="card"><div class="card-h"><div><h2>Seus dados</h2><p class="sub">${S.modo === "cloud" ? esc(S.me.email) : "Modo equipe: o nome fica salvo neste aparelho."}</p></div></div>
      <form id="ctNome" class="lista" style="gap:12px"><label class="f">Como você aparece<input class="inp" id="ctN" value="${esc(S.me.nome)}" maxlength="80" ${S.modo === "cloud" ? "disabled" : ""}></label>${S.modo === "cloud" ? '<p class="sub" style="color:var(--muted);margin:0">O nome é definido por um administrador em Pessoas e acessos.</p>' : '<div><button class="btn" type="submit">Salvar nome</button></div>'}</form></section>
      ${S.modo === "cloud" ? `<section class="card"><div class="card-h"><div><h2>Trocar senha</h2><p class="sub">Pelo menos 8 caracteres, com letras e números.</p></div></div><form id="ctSenha" class="lista" style="gap:12px"><label class="f">Senha atual<input class="inp" id="pw0" type="password" autocomplete="current-password"></label><label class="f">Nova senha<input class="inp" id="pw1" type="password" autocomplete="new-password"></label><label class="f">Repita a nova senha<input class="inp" id="pw2" type="password" autocomplete="new-password"></label><p class="lg-erro" id="pwMsg"></p><div><button class="btn" type="submit">Trocar senha</button></div></form></section>` : ""}</div>`;
    const fn = $("#ctNome"); if (fn) fn.onsubmit = e => { e.preventDefault(); if (S.modo === "cloud") return; const n = str($("#ctN").value, 80); if (!n) return; S.me.nome = n; lsSet(KEY + "-nome", n); montarMoldura(); render(); toast("Nome salvo"); };
    const fs = $("#ctSenha"); if (fs) fs.onsubmit = async e => { e.preventDefault(); const [a, b, c] = ["#pw0", "#pw1", "#pw2"].map(x => $(x).value), m = $("#pwMsg");
      if (b.length < 8 || !/[a-z]/i.test(b) || !/\d/.test(b)) return m.textContent = "A nova senha precisa de 8 caracteres, com letras e números."; if (b !== c) return m.textContent = "As duas senhas novas não são iguais.";
      try { const u = S.fb.auth().currentUser; await u.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(u.email, a)); await u.updatePassword(b); fs.reset(); m.textContent = ""; toast("Senha trocada"); } catch (er) { m.textContent = erroAuth(er); } };
  }
  /* ---------- PESSOAS E ACESSOS pelo número do celular corporativo (servidor) ---------- */
  const fmtNum = n => { const d = String(n || ""); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : d; };
  const apiP = (acao, dados) => VendasDados.api(CFG.apiUrl, Object.assign({ acao, t: S.token }, dados || {}));
  let USUARIOS = null;
  async function cfgAcessos(el) {
    el.innerHTML = `<section class="card"><div class="card-h"><div><h2>Acessos pelo número do celular</h2><p class="sub">Cada pessoa entra com o número do celular corporativo e uma senha. Se alguém sair, o acesso fica com o número: troque a senha ou desative.</p></div>
        <div class="dir"><button class="btn" id="acNovo">${ico("mais")}Novo acesso</button></div></div><div id="acLista"><p class="sub">Carregando…</p></div></section>
      <section class="card mt"><div class="card-h"><div><h2>Senha do acesso "equipe"</h2><p class="sub">Acesso antigo e compartilhado (usuário <b>equipe</b>), que vê tudo. Depois que cada pessoa tiver o próprio número, troque esta senha por uma longa que ninguém usa.</p></div></div>
        <form id="eqForm" class="grid2" style="align-items:end"><label class="f">Senha atual<input class="inp" type="password" id="eqA" autocomplete="current-password"></label><label class="f">Nova senha (mín. 10)<input class="inp" type="password" id="eqN" autocomplete="new-password"></label><div><button class="btn" type="submit">Trocar senha</button> <span class="sub" id="eqMsg"></span></div></form></section>
      <div id="pessoasLocais" class="mt"></div>`;
    $("#acNovo").onclick = () => gavetaAcesso({ ativo: true, papel: "vendedor" }, true);
    $("#eqForm").onsubmit = async e => { e.preventDefault(); const m = $("#eqMsg"); m.textContent = "Salvando…";
      try { await apiP("equipeSenha", { atual: $("#eqA").value, nova: $("#eqN").value }); m.textContent = "Senha trocada. Quem entra como equipe vai precisar da senha nova."; $("#eqForm").reset(); } catch (er) { m.textContent = "Não trocou: " + er.message; } };
    cfgPessoas($("#pessoasLocais"));
    const h = $("#pessoasLocais h2"); if (h) h.textContent = "Responsáveis dos encaminhamentos";
    try { USUARIOS = (await apiP("usuarios")).lista; } catch (er) { $("#acLista").innerHTML = `<p class="sub">Não consegui carregar: ${esc(er.message)}</p>`; return; }
    desenharAcessos();
  }
  function desenharAcessos() {
    const l = $("#acLista"); if (!l) return;
    if (!USUARIOS.length) { l.innerHTML = `<div class="vazio"><p class="sub">Nenhum acesso por número ainda. Clique em <b>Novo acesso</b> e cadastre o primeiro (comece pelo seu, como Administrador).</p></div>`; return; }
    l.innerHTML = `<div class="tab-wrap"><table class="t resp"><thead><tr><th>Número</th><th>Pessoa</th><th>Papel</th><th>Vê</th><th>Situação</th><th></th></tr></thead><tbody>
      ${USUARIOS.map(u => `<tr><td data-l="Número"><b>${esc(fmtNum(u.numero))}</b></td><td data-l="Pessoa">${esc(u.nome)}</td><td data-l="Papel">${esc(PAPEIS[u.papel]?.l || u.papel)}</td>
        <td data-l="Vê">${u.papel === "vendedor" ? "só os números de " + esc(u.linhas.join(" + ")) : u.papel === "admin" ? "tudo" : (["vendas", "encaminhamentos", "planejamento", "remuneracao"].filter(a => u.abas[a]).map(a => ABAS.find(x => x.id === a).nome).join(", ") || "Início")}</td>
        <td data-l="Situação">${u.ativo ? `<span class="chip ok">ativo</span>` : `<span class="chip">inativo</span>`}<br><small style="color:var(--muted)">${u.ultimoAcesso ? "entrou " + relTempo(u.ultimoAcesso) : "ainda não entrou"}</small></td>
        <td><button class="btn sm ghost" data-num="${esc(u.numero)}">Editar</button></td></tr>`).join("")}</tbody></table></div>`;
    l.querySelectorAll("[data-num]").forEach(b => b.onclick = () => gavetaAcesso(USUARIOS.find(u => u.numero === b.dataset.num), false));
  }
  function gavetaAcesso(u, novo) {
    const linhasDisp = [...new Set((S.vendas?.recs || []).filter(r => r.grupo !== "Outros canais").map(r => r.vendedor))].sort();
    abrirGaveta(novo ? "Novo acesso" : "Acesso de " + u.nome, `
      <div class="grid2"><label class="f">Número do celular corporativo<input class="inp" id="aNum" inputmode="tel" placeholder="(85) 99999-0000" value="${esc(fmtNum(u.numero || ""))}"></label><label class="f">Nome<input class="inp" id="aNome" maxlength="60" value="${esc(u.nome || "")}" placeholder="Ex.: Allyson"></label></div>
      <label class="f">Papel<select class="sel inp" id="aPapel">${["vendedor", "admin", "gestor", "membro", "leitor"].map(k => `<option value="${k}" ${u.papel === k ? "selected" : ""}>${PAPEIS[k].l} · ${PAPEIS[k].d}</option>`).join("")}</select></label>
      <div id="aVend" class="grid2"><label class="f">Linha na aba Vendas<input class="inp" id="aLinhas" list="dlLinhasV" value="${esc((u.linhas || []).join(" + "))}" placeholder="ALLYSON · para duas: RODRIGO + RODRIGO SORVETES"></label><label class="f">Nome na Corridinha <small>opcional</small><input class="inp" id="aCorr" maxlength="60" value="${esc(u.corr || "")}" placeholder="Ex.: Allyson"></label>
        <datalist id="dlLinhasV">${linhasDisp.map(x => `<option value="${esc(x)}">`).join("")}</datalist></div>
      <fieldset id="aAbas" style="border:1px solid var(--linha);border-radius:12px;padding:12px 14px"><legend style="font-size:13px;font-weight:800;color:var(--muted);padding:0 6px">Abas que a pessoa vê</legend><div class="grid2">${ABAS.filter(a => !a.livre).map(a => `<label class="ck"><input type="checkbox" data-aba="${a.id}" ${(u.abas || {})[a.id] ? "checked" : ""}><span>${a.nome}</span></label>`).join("")}</div></fieldset>
      <label class="f">${novo || !u.temSenha ? "Senha" : "Nova senha"} <small>${novo || !u.temSenha ? "mínimo 6 caracteres" : "deixe em branco para manter a atual"}</small><input class="inp" id="aSenha" type="text" autocomplete="off" maxlength="60" placeholder="${novo ? "Crie a senha" : "••••••"}"></label>
      <label class="ck"><input type="checkbox" id="aAtivo" ${u.ativo !== false ? "checked" : ""}><span>Acesso ativo</span></label>
      <p class="sub" style="color:var(--muted)">Ao trocar a senha, mudar o papel ou desativar, quem estiver conectado com esse número sai na hora.</p>
      <div id="aMsgBox" hidden><label class="f">Mensagem para mandar no WhatsApp<textarea class="inp" id="aMsg" rows="6" readonly></textarea></label><button type="button" class="btn ghost sm" id="aCopiar">Copiar mensagem</button></div>`,
      `${novo ? '<span class="esq"></span>' : `<button class="btn ghost esq" id="aExcluir">${ico("lixo")}Excluir</button>`}<button class="btn" id="aSalvar">${novo ? "Criar acesso" : "Salvar"}</button>`);
    const papel = () => $("#aPapel").value;
    const ver = () => { $("#aVend").hidden = papel() !== "vendedor"; $("#aAbas").hidden = papel() === "vendedor" || papel() === "admin"; };
    $("#aPapel").onchange = ver; ver();
    $("#aSalvar").onclick = async () => {
      const b = $("#aSalvar"), senha = $("#aSenha").value.trim(), abas = {}; $$("#aAbas [data-aba]").forEach(i => { if (i.checked) abas[i.dataset.aba] = true; });
      b.disabled = true;
      try {
        const r = await apiP("usuarioSalvar", { numero: $("#aNum").value, numeroAntigo: u.numero || "", nome: $("#aNome").value, papel: papel(), linhas: $("#aLinhas").value, corr: $("#aCorr").value, abas, senha: senha || null, ativo: $("#aAtivo").checked });
        USUARIOS = r.lista; desenharAcessos(); toast(novo ? "Acesso criado" : "Acesso salvo");
        const num = r.lista.find(x => x.nome === $("#aNome").value.trim())?.numero || $("#aNum").value;
        const link = location.origin + location.pathname;
        $("#aMsg").value = `Olá, ${$("#aNome").value.trim()}! Seu acesso à plataforma comercial da Naturalle:\n\n${link}\nNúmero: ${fmtNum(num)}\n${senha ? "Senha: " + senha + "\n" : ""}\nA senha é pessoal. ${papel() === "vendedor" ? "Lá você acompanha as suas vendas, meta, carteira de clientes, produtos, campanha e comissão." : ""}`;
        $("#aMsgBox").hidden = false; $("#aSenha").value = ""; u = r.lista.find(x => x.numero === String(num).replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "")) || u; novo = false;
      } catch (er) { toast("Não salvou: " + er.message); }
      finally { b.disabled = false; }
    };
    $("#aCopiar").onclick = async () => { try { await navigator.clipboard.writeText($("#aMsg").value); toast("Mensagem copiada"); } catch (_) { $("#aMsg").select(); document.execCommand("copy"); } };
    const ex = $("#aExcluir"); if (ex) ex.onclick = async () => { if (!(await confirmar({ titulo: `Excluir o acesso de ${u.nome}?`, texto: `O número ${fmtNum(u.numero)} deixa de entrar na hora.`, ok: "Excluir" }))) return; try { USUARIOS = (await apiP("usuarioExcluir", { numero: u.numero })).lista; desenharAcessos(); fecharGaveta(); toast("Acesso excluído"); } catch (er) { toast(er.message); } };
  }
  /* metas e feriados do painel de vendas (iframe na aba Config do painel) */
  function cfgMetas(el) {
    sessaoPainel();
    el.innerHTML = `<div class="frame-cfg"><iframe class="vendas-frame" title="Metas e feriados" src="${esc(painelUrl("Config"))}" referrerpolicy="same-origin"></iframe></div>`;
  }
  /* minha conta: nome e troca da própria senha */
  function cfgContaPortal(el) {
    const numerado = S.me.id && S.me.id !== "equipe";
    el.innerHTML = `<div class="linha l2"><section class="card"><div class="card-h"><div><h2>Seus dados</h2><p class="sub">${numerado ? "Número " + esc(fmtNum(S.me.id)) + " · " + esc(PAPEIS[S.me.papel]?.l || "") : "Acesso compartilhado da equipe."}</p></div></div>
        ${numerado ? `<p><b>${esc(S.me.nome)}</b></p><p class="sub" style="color:var(--muted)">O nome e o papel são definidos por um administrador em Pessoas e acessos.</p>` : `<form id="ctNome" class="lista" style="gap:12px"><label class="f">Como você aparece<input class="inp" id="ctN" value="${esc(S.me.nome)}" maxlength="80"></label><div><button class="btn" type="submit">Salvar neste aparelho</button></div></form>`}</section>
      ${numerado ? `<section class="card"><div class="card-h"><div><h2>Trocar minha senha</h2><p class="sub">Mínimo 6 caracteres.</p></div></div><form id="msF" class="lista" style="gap:12px"><label class="f">Senha atual<input class="inp" id="ms0" type="password" autocomplete="current-password"></label><label class="f">Nova senha<input class="inp" id="ms1" type="password" autocomplete="new-password"></label><div><button class="btn" type="submit">Trocar senha</button> <span class="sub" id="msMsg"></span></div></form></section>` : ""}</div>`;
    const fn = $("#ctNome"); if (fn) fn.onsubmit = e => { e.preventDefault(); const n = str($("#ctN").value, 80); if (!n) return; S.me.nome = n; lsSet(KEY + "-nome", n); montarMoldura(); render(); toast("Nome salvo"); };
    const fm = $("#msF"); if (fm) fm.onsubmit = async e => { e.preventDefault(); const m = $("#msMsg"); m.textContent = "Salvando…";
      try { const r = await apiP("minhaSenha", { atual: $("#ms0").value, nova: $("#ms1").value }); abrirSessao({ t: r.t, papel: S.me.papel, nome: S.me.nome, id: S.me.id, abas: S.me.papel === "admin" ? null : S.me.abas }, !!lsGet(KEY + "-sessao", null)); fm.reset(); m.textContent = "Senha trocada."; toast("Senha trocada"); }
      catch (er) { m.textContent = "Não trocou: " + er.message; } };
  }
  function cfgPessoas(el) {
    const ps = S.data.pessoas.slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    el.innerHTML = `<section class="card"><div class="card-h"><div><h2>Pessoas e acessos</h2><p class="sub">${S.modo === "cloud" ? "Quem entra na plataforma, com qual papel e quais abas vê. Ao dar acesso, a pessoa recebe um e-mail para criar a própria senha." : "No modo equipe todos entram com a mesma senha. Cadastre as pessoas para usar como responsáveis e nos lembretes quando a nuvem estiver ligada."}</p></div><div class="dir"><button class="btn" data-act="novaPessoa">${ico("mais")}Nova pessoa</button></div></div>
      <div class="tab-wrap"><table class="t resp"><thead><tr><th>Pessoa</th><th>Papel</th><th>Abas</th><th>Situação</th><th></th></tr></thead><tbody>
      ${ps.map(p => `<tr><td data-l="Pessoa"><b>${esc(p.nome)}</b><br><small style="color:var(--muted)">${esc(p.email || "sem e-mail")}${p.cargo ? " · " + esc(p.cargo) : ""}</small></td><td data-l="Papel">${esc(PAPEIS[p.papel]?.l || "Sem acesso")}</td><td data-l="Abas">${p.papel === "admin" ? "todas" : ABA_IDS.filter(a => p.abas?.[a]).map(a => ABAS.find(x => x.id === a).nome).join(", ") || "nenhuma"}</td><td data-l="Situação">${p.ativo === false ? '<span class="chip bad">desativada</span>' : !p.email ? '<span class="chip">só responsável</span>' : S.modo === "cloud" ? (p.convidadoEm ? `<span class="chip ok">convite ${relTempo(p.convidadoEm)}</span>` : '<span class="chip warn">sem convite</span>') : '<span class="chip ok">ativa</span>'}</td><td class="r"><button class="btn sm ghost" data-act="editarPessoa" data-id="${esc(p.id)}">Editar</button></td></tr>`).join("")}</tbody></table></div></section>
      <section class="card mt"><div class="card-h"><div><h2>Papéis</h2></div></div><div class="lista">${Object.values(PAPEIS).map(p => `<div class="li"><div class="tt">${p.l}<small>${p.d}</small></div></div>`).join("")}</div></section>`;
  }
  function gavetaPessoa(p, novo) {
    abrirGaveta(novo ? "Nova pessoa" : "Pessoa", `
      <div class="grid2"><label class="f">Nome<input class="inp" id="pNome" maxlength="80" value="${esc(p.nome)}"></label><label class="f">E-mail<input class="inp" id="pEmail" type="email" maxlength="120" value="${esc(p.email)}" ${!novo && S.modo === "cloud" && p.email ? "disabled" : ""}></label></div>
      <label class="f">Cargo<input class="inp" id="pCargo" maxlength="80" value="${esc(p.cargo)}"></label>
      <label class="f">Papel<select class="sel inp" id="pPapel">${Object.entries(PAPEIS).map(([k, v]) => `<option value="${k}" ${p.papel === k ? "selected" : ""}>${v.l} · ${v.d}</option>`).join("")}<option value="sem_acesso" ${p.papel === "sem_acesso" ? "selected" : ""}>Sem acesso · só aparece como responsável e recebe lembretes</option></select></label>
      <fieldset style="border:1px solid var(--linha);border-radius:12px;padding:12px 14px"><legend style="font-size:13px;font-weight:800;color:var(--muted);padding:0 6px">Abas que a pessoa vê</legend><div class="grid2">${ABAS.filter(a => !a.livre).map(a => `<label class="ck"><input type="checkbox" data-aba="${a.id}" ${p.abas?.[a.id] ? "checked" : ""}><span>${a.nome}</span></label>`).join("")}</div></fieldset>
      <label class="ck"><input type="checkbox" id="pAtivo" ${p.ativo !== false ? "checked" : ""}><span>Acesso ativo</span></label>`,
      `${novo ? '<span class="esq"></span>' : `<button class="btn ghost esq" data-act="excluirPessoa" data-id="${esc(p.id)}">${ico("lixo")}Excluir</button>`}${S.modo === "cloud" && !novo && p.email ? `<button class="btn ghost" data-act="convidar" data-id="${esc(p.id)}">${ico("mail")}${p.convidadoEm ? "Reenviar convite" : "Enviar convite"}</button>` : ""}<button class="btn" data-act="salvarPessoa" data-id="${esc(p.id)}" data-novo="${novo ? 1 : 0}">${novo ? "Cadastrar" : "Salvar"}</button>`);
  }
  function cfgSeguranca(el) {
    const sg = cfgDoc("seguranca"), as = cfgDoc("abasSenha");
    el.innerHTML = `<div class="linha l2"><section class="card"><div class="card-h"><div><h2>Sessão</h2><p class="sub">Fecha o acesso de quem deixar a plataforma aberta e parada.</p></div></div>
        <form id="sgF" class="lista" style="gap:12px"><label class="f">Sair automaticamente após<select class="sel inp" id="sgT">${[[15, "15 minutos"], [30, "30 minutos"], [60, "1 hora"], [120, "2 horas"], [480, "8 horas"], [0, "Nunca"]].map(([v, l]) => `<option value="${v}" ${+(sg.timeoutMin ?? 60) === v ? "selected" : ""}>${l}</option>`).join("")}</select></label><div><button class="btn" type="submit">Salvar</button></div></form>
        <p class="sub mt" style="color:var(--muted)">Senha errada 3 vezes: espera de 1 minuto. 6 vezes: 5 minutos. 9 vezes: 15 minutos.</p></section>
      <section class="card"><div class="card-h"><div><h2>Senha por aba</h2><p class="sub">${S.modo === "cloud" ? "Na nuvem, cada pessoa só vê as abas liberadas no cadastro dela (Pessoas e acessos), e o servidor bloqueia o resto." : "No modo equipe, proteja abas sensíveis com uma senha própria, além da senha da equipe."}</p></div></div>
        ${S.modo === "cloud" ? `<button class="btn ghost" data-act="sub" data-v="config" data-s="pessoas">${ico("pessoas")}Abrir Pessoas e acessos</button>` : `<div class="lista">${ABAS.filter(a => !a.livre && a.id !== "vendas").map(a => `<div class="li"><div class="tt">${a.nome}<small>${as[a.id] ? "protegida por senha" : "só a senha da equipe"}</small></div><div class="dir"><button class="btn sm ghost" data-act="senhaAba" data-aba="${a.id}">${as[a.id] ? "Trocar" : "Definir senha"}</button>${as[a.id] ? `<button class="btn sm ghost" data-act="tirarSenhaAba" data-aba="${a.id}">Remover</button>` : ""}</div></div>`).join("")}</div>`}</section></div>`;
    $("#sgF").onsubmit = e => { e.preventDefault(); guardar(() => S.store.set("config", "seguranca", { timeoutMin: +$("#sgT").value }), "Sessão salva"); };
  }
  function cfgNuvem(el) {
    const ok = S.nuvem, mig = cfgDoc("migracao"), local = lsGet(KEY + "-dados-v1", null);
    const nLocal = local ? ["tarefas", "reunioes", "frentes", "iniciativas"].reduce((t, c) => t + Object.keys(local[c] || {}).length, 0) : 0;
    el.innerHTML = `<div class="linha l2"><section class="card"><div class="card-h"><div><h2>${ok ? "Nuvem ligada" : "Nuvem fora do ar"}</h2><p class="sub">${ok ? `Encaminhamentos, atas, planejamento e responsáveis ficam no Google Firebase (projeto ${esc(CFG.firebase?.projectId || "")}, São Paulo), iguais para toda a gestão e atualizados na hora.` : "Não consegui abrir a nuvem agora. O que você cadastrar fica só neste navegador até ela voltar. Recarregue a página."}</p></div><span class="chip ${ok ? "ok" : "warn"}">${ok ? "nuvem" : "neste navegador"}</span></div>
        <p class="sub" style="color:var(--muted)">O login é um só (número + senha). Vendas, metas e acessos vêm da planilha pelo portal; o resto fica no Firebase.${mig.em ? ` Dados levados para a nuvem em ${esc(dataBR(mig.em.slice(0, 10)))} por ${esc(mig.por || "")}.` : ""}</p>
        ${ok && nLocal ? `<div class="mt"><p class="sub" style="margin:0 0 8px">Este navegador ainda guarda ${nLocal} ${nLocal === 1 ? "item" : "itens"} do modo antigo. Se algum não aparece na nuvem, envie de novo (só soma, não apaga nada).</p><button class="btn ghost" data-act="enviarLocalNuvem">${ico("nuvem")}Enviar dados deste navegador para a nuvem</button></div>` : ""}
        <div class="mt"><button class="btn ghost" data-act="exportarLocal">${ico("baixar")}Baixar cópia dos dados</button></div></section>
      <section class="card"><div class="card-h"><div><h2>Dados de vendas</h2><p class="sub">${S.vendas ? `Planilha lida ${relTempo(new Date(S.vendas.em).toISOString())}.` : esc(S.vendasErro || "Lidos pelo portal seguro.")}</p></div><span class="chip ${S.vendas ? "ok" : "warn"}">${S.vendas ? "conectado" : "pendente"}</span></div>
        <div class="mt"><button class="btn ghost" data-act="recarregarVendas">${ico("recarregar")}Ler a planilha de novo</button></div></section></div>`;
  }
  function cfgSobre(el) {
    el.innerHTML = `<section class="card"><div class="card-h"><div><h2>Privacidade e dados</h2></div></div><div style="max-width:72ch;line-height:1.65">
      <p>A plataforma reúne as informações comerciais da Naturalle Ice Up: vendas, encaminhamentos de reuniões, planejamento e regras de remuneração.</p>
      <p><b>Dados pessoais tratados:</b> nome, e-mail e cargo das pessoas cadastradas, e o registro de quem criou ou alterou cada informação.</p>
      <p><b>Finalidade:</b> organizar a execução comercial e enviar lembretes dos encaminhamentos. Os dados não são vendidos nem compartilhados com terceiros.</p>
      <p><b>Onde ficam:</b> ${S.nuvem ? "encaminhamentos, atas e planejamento no Google Firebase (Cloud Firestore, São Paulo), com acesso restrito por papel e por aba; vendas, metas e acessos na planilha da Naturalle, entregues pelo portal seguro só a quem pode ver." : "neste navegador (a nuvem não respondeu) e na planilha da Naturalle, pelo portal seguro."}</p>
      <p><b>Direitos (LGPD):</b> para consultar, corrigir ou excluir seus dados, fale com um administrador da plataforma.</p></div></section>`;
  }

  /* =================================================================
     BASE DA INTERFACE · gaveta, diálogo, aviso, gráficos
     ================================================================= */
  let gavetaFoco = null;
  function abrirGaveta(titulo, corpo, pe) {
    gavetaFoco = document.activeElement;
    const d = $("#drawer"); d.innerHTML = `<div class="dr-h"><h2 id="dr-t">${esc(titulo)}</h2><button class="iconbtn" data-act="fecharGaveta" aria-label="Fechar">${ico("x")}</button></div><div class="dr-b">${corpo}</div><div class="dr-p">${pe}</div>`;
    d.hidden = false; $("#scrim").hidden = false; setTimeout(() => { const i = d.querySelector(".dr-b input:not([disabled]),.dr-b select:not([disabled]),.dr-b textarea:not([disabled])"); (i || d.querySelector(".iconbtn")).focus(); }, 40);
  }
  function fecharGaveta() { $("#drawer").hidden = true; $("#scrim").hidden = true; $("#drawer").innerHTML = ""; if (gavetaFoco?.isConnected) gavetaFoco.focus(); }
  function confirmar({ titulo, texto, ok = "Confirmar", perigo = false }) {
    return new Promise(res => {
      const w = $("#dialog"); w.innerHTML = `<div class="dialog-box" role="alertdialog" aria-modal="true" aria-labelledby="dg-t"><h3 id="dg-t">${esc(titulo)}</h3><p>${esc(texto)}</p><div class="acoes"><button class="btn ghost" data-r="0">Cancelar</button><button class="btn ${perigo ? "danger" : ""}" data-r="1">${esc(ok)}</button></div></div>`;
      w.hidden = false; w.querySelector('[data-r="1"]').focus();
      const fim = v => { w.hidden = true; w.innerHTML = ""; res(v); };
      w.onclick = e => { const b = e.target.closest("[data-r]"); if (b) fim(b.dataset.r === "1"); else if (e.target === w) fim(false); };
      w.onkeydown = e => { if (e.key === "Escape") fim(false); };
    });
  }
  function pedirTexto({ titulo, texto, ok, tipo = "text" }) {
    return new Promise(res => {
      const w = $("#dialog"); w.innerHTML = `<form class="dialog-box" role="dialog" aria-modal="true" aria-labelledby="dg-t"><h3 id="dg-t">${esc(titulo)}</h3><p>${esc(texto)}</p><input class="inp" id="dgIn" type="${tipo}" autocomplete="off"><div class="acoes"><button type="button" class="btn ghost" data-r="0">Cancelar</button><button class="btn" type="submit">${esc(ok)}</button></div></form>`;
      w.hidden = false; $("#dgIn").focus();
      const fim = v => { w.hidden = true; w.innerHTML = ""; res(v); };
      w.querySelector("form").onsubmit = e => { e.preventDefault(); fim($("#dgIn").value); };
      w.querySelector('[data-r="0"]').onclick = () => fim(null);
      w.onkeydown = e => { if (e.key === "Escape") fim(null); };
    });
  }
  let toastT = null;
  function toast(msg, desfazer) {
    const t = $("#toast"); t.innerHTML = `<span>${esc(msg)}</span>${desfazer ? '<button type="button">Desfazer</button>' : ""}`; t.hidden = false;
    if (desfazer) t.querySelector("button").onclick = () => { t.hidden = true; desfazer(); };
    clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, desfazer ? 6000 : 3200);
  }
  async function guardar(fn, ok) { try { await fn(); if (ok) toast(ok); return true; } catch (e) { console.error(e); toast(/permission/i.test(e?.code || e?.message || "") ? "Você não tem permissão para isso." : (e.message || "Não foi possível salvar.")); return false; } }
  function grafico(id, cfg) { const c = document.getElementById(id); if (!c || !window.Chart) return; if (window.ChartDataLabels) cfg.plugins = [ChartDataLabels]; Chart.defaults.font.family = "Nunito, system-ui, sans-serif"; Chart.defaults.color = "#76665A"; S.charts.push(new Chart(c, cfg)); }
  function destruirGraficos() { S.charts.forEach(c => { try { c.destroy(); } catch (_) { } }); S.charts = []; }
  function baixarCSV(nome, linhas) { const csv = "﻿" + linhas.map(l => l.map(v => { const s = String(v ?? ""); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(";")).join("\n"); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

  /* =================================================================
     AÇÕES (delegação de eventos)
     ================================================================= */
  const A = {
    ir: b => ir(b.dataset.to, b.dataset.sub),
    sub: b => { S.sub[b.dataset.v] = b.dataset.s; ir(b.dataset.v, b.dataset.s); },
    mini: () => { const m = !$("#app").classList.contains("mini"); lsSet(KEY + "-mini", m); $("#app").classList.toggle("mini", m); $(".recolher").innerHTML = ico(m ? "expandir" : "recolher") + "<span>Recolher menu</span>"; },
    abrirMenu: () => $("#app").classList.add("aberta"),
    sair: async () => { if (await confirmar({ titulo: "Sair da plataforma?", texto: "Você vai precisar da senha para entrar de novo.", ok: "Sair" })) sair(); },
    fecharGaveta,
    recarregarVendas: () => { toast("Lendo a planilha…"); carregarVendas(true); },
    /* encaminhamentos */
    novaTarefa: b => gavetaTarefa({ id: uid(), titulo: "", resp: S.me.papel === "membro" ? S.me.nome : "", prazo: "", status: b.dataset.status || "afazer", prioridade: "media", area: "", origem: S.f.origem || "", descricao: "", checklist: [] }, true),
    abrirTarefa: b => { const t = S.data.tarefas.find(x => x.id === b.dataset.id); if (t) gavetaTarefa(t, false); },
    salvarTarefa: async b => { const base = S.data.tarefas.find(x => x.id === b.dataset.id) || { id: b.dataset.id }; if (await guardar(() => salvarTarefa(lerGavetaTarefa(base)), b.dataset.novo === "1" ? "Encaminhamento criado" : "Encaminhamento salvo")) fecharGaveta(); },
    excluirTarefa: async b => { const t = S.data.tarefas.find(x => x.id === b.dataset.id); if (!t || !(await confirmar({ titulo: "Excluir este encaminhamento?", texto: t.titulo, ok: "Excluir", perigo: true }))) return; fecharGaveta(); await guardar(() => S.store.del("tarefas", t.id)); toast("Encaminhamento excluído", () => S.store.set("tarefas", t.id, (({ id, ...d }) => d)(t), false)); },
    addCk: () => { $("#tCk").insertAdjacentHTML("beforeend", itemCk({ id: uid(), t: "", ok: false })); $("#tCk .it:last-child [type=text]").focus(); },
    rmCk: b => b.closest(".it").remove(),
    comentar: async b => { const t = S.data.tarefas.find(x => x.id === b.dataset.id), txt = str($("#tCom").value, 1000); if (!t || !txt) return; const com = [...(t.comentarios || []), { id: uid(), autor: S.me.nome, texto: txt, em: new Date().toISOString() }];
      if (podeEditarTarefa(t)) await guardar(() => salvarTarefa({ ...t, comentarios: com }, "comentou")); else await guardar(() => S.store.set("tarefas", t.id, { comentarios: com }));
      gavetaTarefa({ ...t, comentarios: com }, false); },
    lembrarTarefa: async b => { const t = S.data.tarefas.find(x => x.id === b.dataset.id); if (!t) return; const em = normEmail(pessoaPorNome(t.resp)?.email);
      if (S.modo === "cloud" && em) { await guardar(() => Mail.fila([{ para: em, assunto: `Lembrete: ${t.titulo}`, html: mailTarefa(t, `${S.me.nome} está lembrando você deste encaminhamento.`) }]), "Lembrete na fila de envio"); }
      else Mail.mailto(em, `Lembrete: ${t.titulo}`, `Olá, ${t.resp}!\n\nLembrete do encaminhamento: ${t.titulo}\nPrazo: ${t.prazo ? dataBR(t.prazo) : "sem prazo"}\n\n${t.descricao || ""}\n\n${linkPlat("#encaminhamentos")}`); },
    /* reuniões */
    novaReuniao: () => gavetaReuniao({ id: uid(), titulo: "", data: hojeISO(), tipo: "Semanal comercial", participantes: [], pauta: "", decisoes: "" }, true),
    abrirReuniao: b => { const r = S.data.reunioes.find(x => x.id === b.dataset.id); if (r) gavetaReuniao(r, false); },
    salvarReuniao: async b => {
      const id = b.dataset.id, a = lerAta(), novos = a._enc; delete a._enc;
      const d = { ...a, atualizadoEm: new Date().toISOString(), atualizadoPor: S.me.nome };
      if (!d.titulo) return toast("Dê um título à reunião.");
      if (novos.some(n => !n.resp || !n.prazo) && !(await confirmar({ titulo: "Há encaminhamento sem responsável ou sem data", texto: "Encaminhamento sem dono e sem prazo costuma ficar parado. Salvar mesmo assim?", ok: "Salvar assim" }))) return;
      if (!S.data.reunioes.some(x => x.id === id)) d.criadoEm = new Date().toISOString();
      const ok = await guardar(async () => { await S.store.set("reunioes", id, d); for (const n of novos) await salvarTarefa({ id: uid(), ...n, status: "afazer", prioridade: "media", origem: id, area: "", descricao: `Encaminhamento da reunião "${d.titulo}"${d.data ? " de " + dataBR(d.data) : ""}.`, checklist: [] }, "criou a partir da ata"); }, novos.length ? `Ata salva e ${novos.length} ${novos.length === 1 ? "encaminhamento criado" : "encaminhamentos criados"}` : "Ata salva");
      if (ok) fecharGaveta();
    },
    ataAdd: b => { const t = b.dataset.tipo, alvo = t === "part" ? "#rPartL" : t === "pauta" ? "#rPautaL" : "#rEncL";
      $(alvo).insertAdjacentHTML("beforeend", t === "part" ? linhaPart({ nome: "", p: "P" }, "") : t === "pauta" ? linhaPauta({ t: "" }, "") : linhaEnc({}, ""));
      const l = $(alvo).lastElementChild; if (l) l.querySelector("input").focus(); },
    ataRm: b => b.closest(".ata-l").remove(),
    excluirReuniao: async b => { const r = S.data.reunioes.find(x => x.id === b.dataset.id); if (!r || !(await confirmar({ titulo: "Excluir esta reunião?", texto: "Os encaminhamentos criados a partir dela continuam no quadro.", ok: "Excluir", perigo: true }))) return; fecharGaveta(); await guardar(() => S.store.del("reunioes", r.id), "Reunião excluída"); },
    enviarAta: async b => {
      const r = S.data.reunioes.find(x => x.id === b.dataset.id); if (!r) return;
      // se a gaveta está aberta, guarda o que foi digitado antes de gerar o PDF
      if ($("#rTit") && podeEditar("encaminhamentos")) {
        const a = lerAta(); if (a._enc.length) return toast("Clique em Salvar ata primeiro: os novos encaminhamentos ainda não foram criados.");
        delete a._enc; Object.assign(r, a); await guardar(() => S.store.set("reunioes", r.id, { ...a, atualizadoEm: new Date().toISOString(), atualizadoPor: S.me.nome }), "");
      }
      b.disabled = true; const rotulo = b.innerHTML; b.textContent = "Gerando PDF…";
      let nome = ""; try { nome = await pdfAta(r); } catch (e) { console.error(e); toast("Não consegui gerar o PDF: " + (e.message || e)); } finally { b.disabled = false; b.innerHTML = rotulo; }
      const emails = (r.participantes || []).map(n => normEmail(pessoaPorNome(n)?.email)).filter(emailOk);
      if (S.modo === "cloud" && emails.length) { if (!(await confirmar({ titulo: `Enviar a ata para ${emails.length} ${emails.length === 1 ? "pessoa" : "pessoas"}?`, texto: emails.join(", "), ok: "Enviar ata" }))) return; await guardar(() => Mail.fila(emails.map(e => ({ para: e, assunto: `Ata: ${r.titulo}`, html: mailCasca(r.titulo, `<pre style="white-space:pre-wrap;font-family:Arial,sans-serif">${esc(textoAta(r))}</pre>`) }))), "Ata na fila de envio"); return; }
      if (!nome) return;
      toast(`PDF baixado: ${nome}. Anexe no e-mail que abriu.`);
      Mail.mailto(emails.join(","), `Ata: ${r.titulo}${r.data ? " · " + dataBR(r.data) : ""}`, textoAta(r) + "\n\nA ata completa segue em PDF, em anexo."); },
    /* planejamento */
    novaFrente: () => gavetaFrente({ id: uid(), nome: "", descricao: "" }, true),
    editarFrente: b => { const f = S.data.frentes.find(x => x.id === b.dataset.id); if (f) gavetaFrente(f, false); },
    salvarFrente: async b => { const n = str($("#fNome").value, 100); if (!n) return toast("Dê um nome à frente."); const ex = S.data.frentes.find(x => x.id === b.dataset.id); if (await guardar(() => S.store.set("frentes", b.dataset.id, { nome: n, descricao: str($("#fDesc").value, 1500), ordem: ex?.ordem || S.data.frentes.length + 1, ...(ex ? {} : { criadoEm: new Date().toISOString() }) }), "Frente salva")) fecharGaveta(); },
    excluirFrente: async b => { if (S.data.iniciativas.some(i => i.frente === b.dataset.id)) return toast("Mova ou exclua as iniciativas desta frente antes."); if (await confirmar({ titulo: "Excluir esta frente?", texto: "Esta ação não pode ser desfeita.", ok: "Excluir", perigo: true })) { fecharGaveta(); guardar(() => S.store.del("frentes", b.dataset.id), "Frente excluída"); } },
    novaIniciativa: b => gavetaIniciativa({ id: uid(), frente: b.dataset.frente || S.data.frentes[0]?.id, titulo: "", resp: "", prazo: "", status: "nao_iniciada", progresso: 0 }, true),
    abrirIniciativa: b => { const i = S.data.iniciativas.find(x => x.id === b.dataset.id); if (i) gavetaIniciativa(i, false); },
    salvarIniciativa: async b => { const t = str($("#iTit").value, 160); if (!t) return toast("Descreva a iniciativa."); const st = $("#iSt").value, ex = S.data.iniciativas.find(x => x.id === b.dataset.id);
      if (await guardar(() => S.store.set("iniciativas", b.dataset.id, { titulo: t, frente: $("#iFr").value, resp: str($("#iResp").value, 80), prazo: $("#iPrazo").value, status: st, progresso: st === "concluida" ? 100 : +$("#iProg").value, obs: str($("#iObs").value, 2000), atualizadoEm: new Date().toISOString(), atualizadoPor: S.me.nome, ...(ex ? {} : { criadoEm: new Date().toISOString() }) }), "Iniciativa salva")) fecharGaveta(); },
    excluirIniciativa: async b => { if (await confirmar({ titulo: "Excluir esta iniciativa?", texto: "Esta ação não pode ser desfeita.", ok: "Excluir", perigo: true })) { fecharGaveta(); guardar(() => S.store.del("iniciativas", b.dataset.id), "Iniciativa excluída"); } },
    iniciativaParaTarefa: b => { const i = S.data.iniciativas.find(x => x.id === b.dataset.id); if (!i) return; gavetaTarefa({ id: uid(), titulo: i.titulo, resp: i.resp, prazo: i.prazo, status: "afazer", prioridade: "media", area: "Comercial", origem: "", descricao: `Iniciativa do planejamento comercial (${S.data.frentes.find(f => f.id === i.frente)?.nome || ""}).`, checklist: [] }, true); },
    /* remuneração */
    regras: () => gavetaRegras(),
    addFaixa: b => { $("#" + b.dataset.alvo).insertAdjacentHTML("beforeend", `<div class="it"><span style="font-size:13px;font-weight:800;color:var(--muted)">a partir de</span><input class="inp num" style="max-width:80px" data-de inputmode="decimal"><span style="font-size:13px;font-weight:800;color:var(--muted)">% → paga</span><input class="inp num" style="max-width:80px" data-mult inputmode="decimal"><span style="font-size:13px;font-weight:800;color:var(--muted)">×</span><button type="button" class="iconbtn" data-act="rmFaixa" aria-label="Remover faixa">${ico("x")}</button></div>`); },
    rmFaixa: b => b.closest(".it").remove(),
    salvarRegras: async () => {
      const ind = {}; $$("[data-ind]").forEach(tr => { const p = numPct(tr.querySelector("[data-ipct]").value), f = numIn(tr.querySelector("[data-ifixo]").value); if (p != null || f != null) ind[tr.dataset.ind] = { ...(p != null ? { pct: p } : {}), ...(f != null ? { fixo: f } : {}) }; });
      const d = { exemplo: false, vendedor: { pct: numPct($("#rgPct").value) || 0, fixo: numIn($("#rgFixo").value) || 0, bonusMeta: numIn($("#rgBonus").value) || 0, faixas: lerFaixas("fxV") }, individuais: ind, supervisor: { nome: str($("#rgSNome").value, 60), pct: numPct($("#rgSPct").value) || 0, bonusMeta: numIn($("#rgSBonus").value) || 0, faixas: lerFaixas("fxS") }, atualizadoEm: new Date().toISOString(), por: S.me.nome };
      if (await guardar(() => S.store.set("config", "remuneracao", d, false), "Regras salvas")) fecharGaveta();
    },
    limparSimul: () => { S.simul = {}; render(); },
    exportarRem: () => { const [a, m] = (S.sub.remMes || (mesesComDados()[0] ? mesesComDados()[0].ano + "-" + mesesComDados()[0].mes : "")).split("-").map(Number); const rg = cfgDoc("remuneracao").vendedor ? cfgDoc("remuneracao") : REGRA_EXEMPLO, R = calcRemuneracao(a, m, rg, S.simul || {});
      baixarCSV(`Remuneracao_${MESES_L[m - 1]}_${a}.csv`, [["Vendedor", "Faturado", "Meta", "Atingimento %", "% comissão", "Escala", "Comissão", "Bônus", "Fixo", "Total"], ...R.linhas.map(l => [l.vendedor, nBR(l.venda, 2), l.meta ? nBR(l.meta, 2) : "", l.at != null ? nBR(l.at, 1) : "", nBR(l.pct, 2), nBR(l.mult, 2), nBR(l.comissao, 2), nBR(l.bonus, 2), nBR(l.fixo, 2), nBR(l.total, 2)]), ["Supervisor " + R.sup.nome, nBR(R.sup.base, 2), "", R.sup.at != null ? nBR(R.sup.at, 1) : "", nBR(R.sup.pct, 2), nBR(R.sup.mult, 2), nBR(R.sup.comissao, 2), nBR(R.sup.bonus, 2), "", nBR(R.sup.total, 2)]]); },
    /* pessoas */
    novaPessoa: () => gavetaPessoa({ id: uid(), nome: "", email: "", cargo: "", papel: "membro", abas: { vendas: true, encaminhamentos: true, planejamento: true }, ativo: true }, true),
    editarPessoa: b => { const p = S.data.pessoas.find(x => x.id === b.dataset.id); if (p) gavetaPessoa(p, false); },
    salvarPessoa: async b => {
      const ex = S.data.pessoas.find(x => x.id === b.dataset.id), email = normEmail($("#pEmail").value || ex?.email), d = { nome: str($("#pNome").value, 80), email, cargo: str($("#pCargo").value, 80), papel: $("#pPapel").value, abas: Object.fromEntries($$("[data-aba]").map(c => [c.dataset.aba, c.checked])), ativo: $("#pAtivo").checked, atualizadoEm: new Date().toISOString() };
      if (!d.nome) return toast("Informe o nome."); if (email && !emailOk(email)) return toast("E-mail inválido."); if (d.papel !== "sem_acesso" && S.modo === "cloud" && !email) return toast("Para dar acesso, informe o e-mail.");
      if (S.data.pessoas.some(p => p.id !== b.dataset.id && email && normEmail(p.email) === email)) return toast("Já existe uma pessoa com este e-mail.");
      const ok = await guardar(async () => { await S.store.set("pessoas", b.dataset.id, { ...d, ...(ex ? {} : { criadoEm: new Date().toISOString() }) });
        if (S.modo === "cloud" && email) { const ref = S.fb.firestore().doc(`acessos/${email}`); if (d.papel === "sem_acesso") await ref.delete().catch(() => { }); else await ref.set({ nome: d.nome, papel: d.papel, abas: d.abas, ativo: d.ativo, atualizadoEm: d.atualizadoEm, por: S.me.email }, { merge: true }); } }, "Pessoa salva");
      if (ok) { fecharGaveta(); if (S.modo === "cloud" && email && d.papel !== "sem_acesso" && !ex?.convidadoEm && await confirmar({ titulo: "Enviar o convite agora?", texto: `${email} recebe um e-mail para criar a própria senha.`, ok: "Enviar convite" })) A.convidar({ dataset: { id: b.dataset.id } }); }
    },
    excluirPessoa: async b => { const p = S.data.pessoas.find(x => x.id === b.dataset.id); if (!p || !(await confirmar({ titulo: `Excluir ${p.nome}?`, texto: "A pessoa perde o acesso. Os encaminhamentos no nome dela continuam no quadro.", ok: "Excluir", perigo: true }))) return; fecharGaveta();
      await guardar(async () => { await S.store.del("pessoas", p.id); if (S.modo === "cloud" && p.email) await S.fb.firestore().doc(`acessos/${normEmail(p.email)}`).delete().catch(() => { }); }, "Pessoa excluída"); },
    convidar: async b => { const p = S.data.pessoas.find(x => x.id === b.dataset.id); if (!p?.email) return;
      await guardar(async () => { const sec = firebase.apps.find(x => x.name === "convites") || firebase.initializeApp(CFG.firebase, "convites"); const tmp = Array.from(crypto.getRandomValues(new Uint8Array(18)), x => x.toString(36)).join("") + "Aa1!";
        try { await sec.auth().createUserWithEmailAndPassword(p.email, tmp); } catch (e) { if (e.code !== "auth/email-already-in-use") throw new Error(erroAuth(e)); } finally { try { await sec.auth().signOut(); } catch (_) { } }
        await S.fb.auth().sendPasswordResetEmail(p.email, { url: CFG.urlPublica || location.href.split("#")[0] }); await S.store.set("pessoas", p.id, { convidadoEm: new Date().toISOString() }); }, `Convite enviado para ${p.email}`); },
    /* segurança (modo equipe) */
    senhaAba: async b => { const v = await pedirTexto({ titulo: "Senha da aba " + ABAS.find(a => a.id === b.dataset.aba).nome, texto: "Quem abrir esta aba vai precisar desta senha, além da senha da equipe.", ok: "Salvar senha", tipo: "password" }); if (!v) return; if (v.length < 6) return toast("Use pelo menos 6 caracteres.");
      const as = { ...cfgDoc("abasSenha") }; delete as.id; as[b.dataset.aba] = await sha256(VendasDados.normSenha(v)); await guardar(() => S.store.set("config", "abasSenha", as, false), "Senha da aba salva"); const ok = ssGet(KEY + "-abas-ok", {}); ok[b.dataset.aba] = true; ssSet(KEY + "-abas-ok", ok); },
    tirarSenhaAba: async b => { const as = { ...cfgDoc("abasSenha") }; delete as.id; delete as[b.dataset.aba]; await guardar(() => S.store.set("config", "abasSenha", as, false), "Senha removida"); },
    enviarLocalNuvem: async () => {
      const local = lsGet(KEY + "-dados-v1", null); if (!S.nuvem || !local) return;
      if (!(await confirmar({ titulo: "Enviar os dados deste navegador?", texto: "Itens que já existem na nuvem com o mesmo código são atualizados com a versão deste navegador. Nada é apagado.", ok: "Enviar" }))) return;
      await guardar(async () => { const db = S.fb.firestore(); let b = db.batch(), n = 0;
        for (const c of ["pessoas", "tarefas", "reunioes", "frentes", "iniciativas", "metas"]) for (const [id, d] of Object.entries(local[c] || {})) { b.set(db.doc(`${c}/${id}`), JSON.parse(JSON.stringify(d)), { merge: true }); if (++n % 400 === 0) { await b.commit(); b = db.batch(); } }
        await b.commit(); }, "Dados enviados para a nuvem"); },
    exportarLocal: () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(S.nuvem ? Object.fromEntries(COLS.map(c => [c, Object.fromEntries((S.data[c] || []).map(({ id, ...d }) => [id, d]))])) : lsGet(KEY + "-dados-v1", {}), null, 2)], { type: "application/json" })); a.download = "plataforma-naturalle-dados.json"; a.click(); },
  };
  function ligarEventos() {
    document.addEventListener("click", e => { const b = e.target.closest("[data-act]"); if (!b || b.disabled) return; const f = A[b.dataset.act]; if (f) { e.preventDefault(); f(b, e); } });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape") { if (!$("#dialog").hidden) return; if (!$("#drawer").hidden) fecharGaveta(); else $("#app").classList.remove("aberta"); }
      if ((e.key === "Enter" || e.key === " ") && e.target.matches?.('[role="button"][data-act]')) { e.preventDefault(); e.target.click(); }
    });
    $("#scrim").onclick = fecharGaveta;
    document.addEventListener("click", e => { if ($("#app").classList.contains("aberta") && !e.target.closest(".side") && !e.target.closest(".menu")) $("#app").classList.remove("aberta"); });
    addEventListener("message", ev => { if (ev.origin === location.origin && ev.data && ev.data.tipo === "naturalle-sessao-expirada" && S.iniciado && S.modo === "local") sair("Sua sessão terminou. Entre de novo."); });
    addEventListener("hashchange", () => { if (!S.iniciado) return; const [v, sub] = location.hash.slice(1).split("/"); if (v && (v !== S.view || (sub && sub !== S.sub[v]))) ir(v, sub); });
    ligarArraste();
    setInterval(() => { if (S.iniciado && S.links && !document.hidden) carregarVendas(true); }, 5 * 60e3);
  }

  /* =================================================================
     PARTIDA
     ================================================================= */
  async function carregarFirebase() {
    const v = "10.12.2"; for (const m of ["app", "auth", "firestore"]) await new Promise((ok, er) => { const s = document.createElement("script"); s.src = `https://www.gstatic.com/firebasejs/${v}/firebase-${m}-compat.js`; s.onload = ok; s.onerror = er; document.head.appendChild(s); });
    return !!window.firebase;
  }
  async function partida() {
    ligarEventos();
    if (CFG.firebase && CFG.firebase.apiKey && CFG.loginPortal) {
      // login único no portal; o Firebase guarda os quadros (ver ligarNuvem)
      try { await carregarFirebase(); if (window.firebase) S.fb = firebase.initializeApp(CFG.firebase); } catch (e) { console.error("firebase", e); }
    } else if (CFG.firebase && CFG.firebase.apiKey) {
      try { await carregarFirebase(); } catch (e) { console.error(e); }
      if (window.firebase) {
        S.modo = "cloud"; S.fb = firebase.initializeApp(CFG.firebase); S.fb.auth().languageCode = "pt";
        telaEntrada();
        S.fb.auth().onAuthStateChanged(async u => { if (u && !S.iniciado) { try { await depoisDoLoginNuvem(u); } catch (e) { console.error(e); telaEntrada("Não foi possível entrar: " + (e.message || e.code)); } } else if (!u && S.iniciado) sair(); });
        return;
      }
      return telaEntrada("Não consegui carregar a nuvem. Verifique a internet e recarregue a página.");
    }
    S.modo = "local";
    const ses = ssGet(KEY + "-sessao", null) || lsGet(KEY + "-sessao", null);
    if (ses?.t && ses.papel) {
      try { S.token = ses.t; S.links = true; S.me = meDaSessao(ses); ssSet(KEY + "-sessao", ses); return iniciarApp(); }
      catch (_) { ssDel(KEY + "-sessao"); lsDel(KEY + "-sessao"); }
    }
    telaEntrada();
  }
  partida();
})();
