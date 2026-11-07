/* =====================================================================
   DADOS DE VENDAS · lê a aba "Vendas" da planilha (CSV publicado)
   Mesma leitura do painel de vendas (index.html na raiz), para a plataforma
   usar faturamento e metas em Início, Planejamento e Remuneração.
   Os links ficam no cofre (AES-GCM); a chave vem da senha da equipe
   (modo equipe) ou do Firestore, liberada só para quem tem a aba Vendas.
   ===================================================================== */
(function () {
  "use strict";
  const NORM = s => String(s ?? "").trim().replace(/\s+/g, " ").toUpperCase();
  const tira = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
  const MESES_UP = ["JANEIRO", "FEVEREIRO", "MARCO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
  const GRUPO_CASA = "Vendedores da casa", GRUPO_REP = "Representantes", GRUPO_CANAIS = "Outros canais";
  const CASA = ["ALLYSON", "ALLYSSON", "GENESIA", "LAUDEMIR", "GLEICY", "RODRIGO"];
  const REP = ["RODRIGO SORVETES", "RAIMUNDO JR", "RAIMUNDO", "PAULO SERGIO"];

  function grupoDe(vend, bloco) {
    const v = tira(NORM(vend));
    if (CASA.includes(v)) return GRUPO_CASA;
    if (REP.includes(v)) return GRUPO_REP;
    return bloco === "canais" ? GRUPO_CANAIS : GRUPO_CASA;
  }
  function parseCSV(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const rows = []; let row = [], f = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === ",") { row.push(f); f = ""; }
      else if (c === "\r") { }
      else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; }
      else f += c;
    }
    if (f !== "" || row.length) { row.push(f); rows.push(row); }
    return rows;
  }
  function num(v) {
    if (typeof v !== "string") return +v || 0;
    let s = v.trim().replace(/^R\$\s*/, "");
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    else if (/^-?\d+,\d+$/.test(s)) s = s.replace(",", ".");
    return +s || 0;
  }
  /* Blocos "PERÍODO: MÊS/AAAA" → um registro por vendedor e mês */
  function parseVendas(rows) {
    const recs = []; let i = 0;
    while (i < rows.length) {
      const m = /^PER[ÍI]ODO:\s*([A-ZÇÃÕÉ]+)\/(\d{4})/.exec(NORM((rows[i] || [])[0]));
      if (!m) { i++; continue; }
      const mes = MESES_UP.indexOf(tira(m[1])) + 1, ano = +m[2];
      if (!mes) { i++; continue; }
      const hdr = (rows[i + 1] || []).map(NORM), dias = [], semanas = []; let cMeta = -1;
      hdr.forEach((h, idx) => {
        let x;
        if ((x = /^DIA\s+(\d{1,2})/.exec(h)) || (idx > 0 && (x = /^(\d{1,2})$/.exec(h)))) dias.push({ idx, dia: +x[1] });
        else if ((x = /^SEMANA\s+(\d)/.exec(h))) semanas.push({ idx });
        else if (h === "META") cMeta = idx;
      });
      let r = i + 2, bloco = "equipe";
      for (; r < rows.length; r++) {
        const row = rows[r] || [], a = NORM(row[0]);
        if (!a) continue;
        if (a.startsWith("PERÍODO") || a.startsWith("PERIODO")) break;
        if (a.startsWith("TOTAL GERAL")) { r++; break; }
        if (a.startsWith("TOTAL EQUIPE")) { bloco = "canais"; continue; }
        if (a.startsWith("TOTAL")) continue;
        const vendedor = String(row[0]).trim();
        let venda = 0, porDia = null;
        if (dias.length) { porDia = dias.map(c => ({ dia: c.dia, valor: num(row[c.idx]) })); venda = porDia.reduce((s, d) => s + d.valor, 0); }
        else { const wc = semanas.length ? semanas : [1, 2, 3, 4, 5].map(n => ({ idx: n })); venda = wc.reduce((s, c) => s + num(row[c.idx]), 0); }
        const mr = cMeta >= 0 ? row[cMeta] : row[7];
        const meta = mr == null || String(mr).trim() === "" ? null : num(mr) || null;
        recs.push({ ano, mes, vendedor, grupo: grupoDe(vendedor, bloco), venda, meta, dias: porDia });
      }
      i = r;
    }
    return recs;
  }

  /* ---------- cofre ---------- */
  const b64 = b => Uint8Array.from(atob(b), c => c.charCodeAt(0));
  const normSenha = v => String(v || "").trim().toUpperCase().replace(/\s+/g, "");
  async function chaveDaSenha(senha, cofre) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(normSenha(senha)), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt: b64(cofre.salt), iterations: cofre.iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, true, ["decrypt"]);
  }
  async function chaveDeBase64(raw) { return crypto.subtle.importKey("raw", b64(raw), { name: "AES-GCM" }, true, ["decrypt"]); }
  async function chaveParaBase64(k) { return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey("raw", k)))); }
  async function abrirCofre(chave, cofre) {
    const claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(cofre.iv) }, chave, b64(cofre.dados));
    return JSON.parse(new TextDecoder().decode(claro));
  }

  let cache = null, emAndamento = null;
  async function carregar(links, forcar) {
    if (cache && !forcar && Date.now() - cache.em < 5 * 60e3) return cache;
    if (emAndamento) return emAndamento;
    emAndamento = (async () => {
      const r = await fetch(links.SHEET_CSV_URL + (links.SHEET_CSV_URL.includes("?") ? "&" : "?") + "t=" + Date.now(), { cache: "no-store", credentials: "omit" });
      if (!r.ok) throw new Error("A planilha respondeu " + r.status);
      const recs = parseVendas(parseCSV(await r.text()));
      if (!recs.length) throw new Error("Não encontrei blocos de período na aba Vendas.");
      cache = { recs, em: Date.now() };
      return cache;
    })();
    try { return await emAndamento; } finally { emAndamento = null; }
  }

  window.VendasDados = { parseCSV, parseVendas, carregar, chaveDaSenha, chaveDeBase64, chaveParaBase64, abrirCofre, normSenha, GRUPO_CASA, GRUPO_REP, GRUPO_CANAIS };
})();
