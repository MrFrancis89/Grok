// listafacil.js — StockFlow Pro v9.7.5
// v9.7.5: CSS extraído para style.css; esc() centralizado em utils.js.
// ══════════════════════════════════════════════════════════════════
// CORREÇÃO DEFINITIVA — Delegação de eventos
// ══════════════════════════════════════════════════════════════════
// A raiz dos problemas anteriores era adicionar listeners individuais
// em cada <tr> durante renderLFLista(). Isso cria race conditions,
// handlers duplicados e pode ser bloqueado por CSS do container.
//
// SOLUÇÃO: Delegação de eventos — UM listener no tbody que detecta
// clicks em qualquer botão/input filho via e.target.closest().
// Sobrevive a re-renders, não acumula, não é afetado por CSS pai.
// ══════════════════════════════════════════════════════════════════

import {
    carregarItensLF, salvarItensLF,
    carregarOrcamentoLF, salvarOrcamentoLF,
    registrarPrecoHistorico,
} from './storage.js';
import { mostrarToast }        from './toast.js';
import { mostrarConfirmacao }  from './confirm.js';
import { darFeedback, copiarParaClipboard, esc } from './utils.js';
import { agendarSnapshot }     from './calendario.js';

// ── Estado ───────────────────────────────────────────────────────
let lfItens     = [];
let lfOrcamento = 3200;
let lfCalcInput = null;
let lfCalcExpr  = '';
let _delegacaoInited = false;

// ── Inicialização ─────────────────────────────────────────────────
export function iniciarListaFacil() {
    const raw = carregarItensLF();
    lfItens = Array.isArray(raw) ? raw.map((it, i) => ({
        id: it.id  || (Date.now() + i),
        n:  it.n   || '',
        q:  it.q   !== undefined ? Number(it.q) : 1,
        p:  it.p   !== undefined ? Number(it.p) : 0,
    })) : [];
    lfOrcamento = carregarOrcamentoLF() || 3200;

    renderLFLista();
    atualizarGauge();
    configurarEventosDelegados(); // ← delegação, UMA vez
    configurarTabsLF();
    configurarBudgetInput();
    configurarCalcLF();
    configurarAddModal();
    configurarComparador();

    // FAB
    document.addEventListener('tabChanged', e => {
        const fab = document.getElementById('lf-fabAddItem');
        if (!fab) return;
        fab.style.display = (e.detail?.tab === 'listafacil') ? 'flex' : 'none';
    });
    document.getElementById('lf-fabAddItem')?.addEventListener('click', () => {
        darFeedback(); abrirAddModal();
    });

    // Ações globais
    document.getElementById('lf-zerarPrecosBtn')?.addEventListener('click', () => {
        darFeedback();
        mostrarConfirmacao('Zerar todos os preços da lista?', () => {
            lfItens = lfItens.map(it => ({ ...it, p: 0 }));
            salvarLF(); renderLFLista(); atualizarGauge();
        });
    });
    document.getElementById('lf-zerarQuantidadesBtn')?.addEventListener('click', () => {
        darFeedback();
        mostrarConfirmacao('Zerar todas as quantidades?', () => {
            lfItens = lfItens.map(it => ({ ...it, q: 0 }));
            salvarLF(); renderLFLista(); atualizarGauge();
        });
    });
    document.getElementById('lf-zerarItensBtn')?.addEventListener('click', () => {
        darFeedback();
        mostrarConfirmacao('Remover TODOS os itens da lista?', () => {
            lfItens = []; salvarLF(); renderLFLista(); atualizarGauge();
        }, 'perigo');
    });

    document.getElementById('lf-shareBtn')?.addEventListener('click', compartilharListaLF);

    document.getElementById('lf-showChangelog')?.addEventListener('click', () => {
        darFeedback();
        document.getElementById('lf-changelogModal').style.display = 'flex';
    });
    document.getElementById('lf-closeChangelog')?.addEventListener('click', () => {
        document.getElementById('lf-changelogModal').style.display = 'none';
    });
    document.getElementById('lf-closeChangelogBtn')?.addEventListener('click', () => {
        document.getElementById('lf-changelogModal').style.display = 'none';
    });
}

// ── Delegação de eventos na tabela (UMA VEZ) ──────────────────────
function configurarEventosDelegados() {
    if (_delegacaoInited) return;
    _delegacaoInited = true;

    const tbody = document.getElementById('lf-tableBody');
    if (!tbody) return;

    // ── Apagar item ────────────────────────────────────────────
    tbody.addEventListener('click', (e) => {
        const btn = e.target.closest('.lf-btn-del-row');
        if (!btn) return;

        const lid  = parseInt(btn.dataset.lid);
        const nome = btn.dataset.nome || '?';

        mostrarConfirmacao(`Remover "${nome}" da lista?`, () => {
            const idx = lfItens.findIndex(i => i.id === lid);
            if (idx !== -1) {
                lfItens.splice(idx, 1);
                salvarLF();
                renderLFLista();
                atualizarGauge();
            }
        });
    });

    // ── Abrir calculadora ao clicar no preço ───────────────────
    tbody.addEventListener('click', (e) => {
        const inp = e.target.closest('.lf-input-preco');
        if (!inp) return;
        e.preventDefault();
        darFeedback();
        abrirCalcLF(inp, inp.dataset.nome || '');
    });

    // ── Atualizar quantidade ───────────────────────────────────
    tbody.addEventListener('change', (e) => {
        const inp = e.target.closest('.lf-input-qtd');
        if (!inp) return;
        const lid  = parseInt(inp.dataset.lid);
        const it   = lfItens.find(i => i.id === lid);
        if (!it) return;
        const novaQ = parseFloat(inp.value.replace(',', '.')) || 0;
        it.q = novaQ;
        const totalEl = tbody.querySelector(`.lf-item-total[data-lid="${lid}"]`);
        if (totalEl) totalEl.textContent = fmtMoeda(novaQ * (it.p || 0));
        salvarLF();
        atualizarGauge();
    });

    // ── Selecionar tudo ao focar qtd ───────────────────────────
    tbody.addEventListener('focus', (e) => {
        if (e.target.classList.contains('lf-input-qtd')) e.target.select();
    }, true);
}

// ── Render da lista (puro HTML, sem listeners por linha) ──────────
function renderLFLista() {
    const tbody = document.getElementById('lf-tableBody');
    if (!tbody) return;

    if (lfItens.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5"
            style="text-align:center;padding:32px 16px;opacity:.45;font-size:14px;">
            Nenhum item — toque no <strong>+</strong> para adicionar
            </td></tr>`;
        return;
    }

    tbody.innerHTML = lfItens.map(item => {
        const q = Number(item.q) || 0;
        const p = Number(item.p) || 0;
        return `
        <tr data-lid="${item.id}">
          <td class="lf-td-nome">
            <span class="lf-nome-item">${esc(item.n)}</span>
          </td>
          <td class="lf-td-qtd">
            <input type="text" class="lf-input-qtd"
                   value="${fmtQtd(q)}"
                   inputmode="decimal"
                   data-lid="${item.id}"
                   aria-label="Qtd ${esc(item.n)}">
          </td>
          <td class="lf-td-preco">
            <input type="text" class="lf-input-preco"
                   value="${fmtMoeda(p)}"
                   readonly
                   data-lid="${item.id}"
                   data-nome="${esc(item.n)}"
                   aria-label="Preço ${esc(item.n)}">
          </td>
          <td class="lf-td-total">
            <span class="lf-item-total" data-lid="${item.id}">${fmtMoeda(q * p)}</span>
          </td>
          <td class="lf-td-del">
            <button class="lf-btn-del-row"
                    type="button"
                    data-lid="${item.id}"
                    data-nome="${esc(item.n)}"
                    aria-label="Remover ${esc(item.n)}">
              <svg width="15" height="15" viewBox="0 0 24 24"
                   fill="none" stroke="currentColor"
                   stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3,6 5,6 21,6"/>
                <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                <path d="M10 11v6M14 11v6M9 6V4h6v2"/>
              </svg>
            </button>
          </td>
        </tr>`;
    }).join('');
}

// ── Modal de adicionar item ───────────────────────────────────────
function configurarAddModal() {
    const modal    = document.getElementById('lf-addModal');
    if (!modal) return;
    const inputEl  = document.getElementById('lf-addNomeInput');
    const btnOk    = document.getElementById('lf-confirmAddItem');
    const btnCan   = document.getElementById('lf-cancelAddItem');
    const btnClose = document.getElementById('lf-closeAddModal');

    function fechar() { modal.style.display = 'none'; if (inputEl) inputEl.value = ''; }
    function confirmar() {
        const nome = inputEl?.value.trim();
        if (!nome) { mostrarToast('Digite o nome do produto.'); return; }
        if (lfItens.find(it => it.n.toLowerCase() === nome.toLowerCase())) {
            mostrarToast('Produto já está na lista.'); return;
        }
        lfItens.push({ id: Date.now(), n: nome, q: 1, p: 0 });
        salvarLF(); renderLFLista(); atualizarGauge();
        fechar(); mostrarToast('Item adicionado!');
    }

    btnOk?.addEventListener('click',    () => { darFeedback(); confirmar(); });
    btnCan?.addEventListener('click',   () => { darFeedback(); fechar(); });
    btnClose?.addEventListener('click', () => { darFeedback(); fechar(); });
    modal.addEventListener('click', e => { if (e.target === modal) fechar(); });
    inputEl?.addEventListener('keydown', e => { if (e.key === 'Enter') confirmar(); });
}

function abrirAddModal() {
    const modal = document.getElementById('lf-addModal');
    if (!modal) return;
    modal.style.display = 'flex';
    setTimeout(() => document.getElementById('lf-addNomeInput')?.focus(), 80);
}

// ── Calculadora LF ────────────────────────────────────────────────
function configurarCalcLF() {
    const modal = document.getElementById('lf-calcModal');
    if (!modal) return;

    function fecharCalc() { modal.style.display = 'none'; lfCalcInput = null; lfCalcExpr = ''; }
    document.getElementById('lf-closeCalc')?.addEventListener('click', () => { darFeedback(); fecharCalc(); });
    modal.addEventListener('click', e => { if (e.target === modal) fecharCalc(); });

    document.querySelectorAll('[data-lf-calc]').forEach(btn => {
        btn.addEventListener('click', () => {
            darFeedback();
            const v = btn.dataset.lfCalc;
            if      (v === 'OK')   { salvarCalcLF(); }
            else if (v === 'C')    { lfCalcExpr = ''; atualizarDisplayCalcLF(); }
            else if (v === 'BACK') { lfCalcExpr = lfCalcExpr.slice(0, -1); atualizarDisplayCalcLF(); }
            else {
                if (v === ',') {
                    const parts = lfCalcExpr.split(/[+\-*/]/);
                    if (parts[parts.length - 1].includes('.')) return;
                }
                lfCalcExpr += (v === ',') ? '.' : v;
                atualizarDisplayCalcLF();
            }
        });
    });
}

function abrirCalcLF(input, nome) {
    lfCalcInput = input;
    lfCalcExpr  = '';
    const title = document.getElementById('lf-calc-title');
    if (title) title.textContent = '🧮 ' + nome;
    atualizarDisplayCalcLF();
    document.getElementById('lf-calcModal').style.display = 'flex';
}

function atualizarDisplayCalcLF() {
    const el = document.getElementById('lf-calc-display');
    if (el) el.textContent = lfCalcExpr.replace(/\./g, ',') || '0';
}

function salvarCalcLF() {
    if (!lfCalcInput) return;
    const display = document.getElementById('lf-calc-display');
    try {
        let val = avaliarExpr(lfCalcExpr || '0');
        if (!isFinite(val) || isNaN(val)) throw new Error('inválido');
        val = Math.round(val * 100) / 100;

        lfCalcInput.value = fmtMoeda(val);

        if (lfCalcInput.classList.contains('lf-input-preco')) {
            const tbody = document.getElementById('lf-tableBody');
            const lid   = parseInt(lfCalcInput.dataset.lid);
            const it    = !isNaN(lid) ? lfItens.find(i => i.id === lid) : null;
            if (it) {
                it.p = val;
                const totalEl = tbody?.querySelector(`.lf-item-total[data-lid="${lid}"]`);
                if (totalEl) totalEl.textContent = fmtMoeda((it.q || 0) * val);
                if (val > 0) registrarPrecoHistorico(it.n, val);
            }
            salvarLF();
            atualizarGauge();
        }

        document.getElementById('lf-calcModal').style.display = 'none';
        lfCalcInput = null; lfCalcExpr = '';
        mostrarToast('Preço salvo');
    } catch (e) {
        if (display) { display.textContent = 'Erro'; setTimeout(atualizarDisplayCalcLF, 1000); }
    }
}

function avaliarExpr(expr) {
    const src = expr.replace(/×/g,'*').replace(/÷/g,'/').replace(/\s+/g,'');
    let pos = 0;
    const peek    = () => src[pos];
    const consume = () => src[pos++];
    function parseNum() {
        let s = pos; if (peek()==='-') consume();
        while (pos < src.length && /[\d.]/.test(src[pos])) consume();
        const n = parseFloat(src.slice(s, pos));
        if (isNaN(n)) throw new Error('token'); return n;
    }
    function parseFactor() {
        if (peek()==='(') { consume(); const v=parseExpr(); if (peek()!==')') throw new Error('parêntese não fechado'); consume(); return v; }
        if (peek()==='-') { consume(); return -parseFactor(); }
        return parseNum();
    }
    function parseTerm() {
        let l=parseFactor();
        while (pos<src.length && (peek()==='*'||peek()==='/')) {
            const op=consume(), r=parseFactor();
            if (op==='/'&&r===0) throw new Error('div0');
            l=op==='*'?l*r:l/r;
        }
        return l;
    }
    function parseExpr() {
        let l=parseTerm();
        while (pos<src.length && (peek()==='+'||peek()==='-')) {
            const op=consume(), r=parseTerm(); l=op==='+'?l+r:l-r;
        }
        return l;
    }
    const result = parseExpr();
    // BUG FIX #3: guard idêntico ao de calculadora.js — garante que toda a
    // expressão foi consumida. Sem isso, "2+3abc" retorna 5 silenciosamente
    // em vez de exibir "Erro" ao usuário.
    if (pos !== src.length) throw new Error('Expressão inválida');
    return result;
}

// ── Orçamento / Gauge ─────────────────────────────────────────────
function configurarBudgetInput() {
    const inlineInput = document.getElementById('lf-budgetInlineInput');
    if (!inlineInput) return;
    inlineInput.value = fmtMoeda(lfOrcamento);
    inlineInput.addEventListener('focus', () => {
        inlineInput.value = lfOrcamento.toFixed(2).replace('.', ','); inlineInput.select();
    });
    inlineInput.addEventListener('blur', () => {
        const val = parseMoeda(inlineInput.value) || 3200;
        lfOrcamento = val; salvarOrcamentoLF(val);
        inlineInput.value = fmtMoeda(val); atualizarGauge(); agendarSnapshot();
    });
    const legacyInput = document.getElementById('lf-budgetInput');
    if (legacyInput) {
        legacyInput.value = fmtMoeda(lfOrcamento);
        legacyInput.addEventListener('change', () => {
            lfOrcamento = parseMoeda(legacyInput.value) || 3200;
            salvarOrcamentoLF(lfOrcamento);
            if (inlineInput) inlineInput.value = fmtMoeda(lfOrcamento);
            atualizarGauge();
        });
    }
}

function atualizarGauge() {
    const gasto = calcTotalGasto();
    const saldo = lfOrcamento - gasto;
    const pct   = lfOrcamento > 0 ? Math.min(1, gasto / lfOrcamento) : 0;
    renderGaugeRing(pct);

    const s = Math.abs(saldo) < 0.005 ? 0 : saldo;
    const gastoEl = document.getElementById('lf-gaugeGasto');
    const saldoEl = document.getElementById('lf-gaugeSaldo');
    if (gastoEl) gastoEl.textContent = fmtMoeda(gasto);
    if (saldoEl) {
        saldoEl.textContent = (s < 0 ? '-' : '') + fmtMoeda(Math.abs(s));
        saldoEl.className   = 'lf-gauge-num-value ' + (s >= 0 ? 'saldo-ok' : 'saldo-ruim');
    }
    const fBudget = document.getElementById('lf-footerBudget');
    const fGasto  = document.getElementById('lf-footerGasto');
    const fSaldo  = document.getElementById('lf-footerSaldo');
    if (fBudget) fBudget.textContent = fmtMoeda(lfOrcamento);
    if (fGasto)  fGasto.textContent  = fmtMoeda(gasto);
    if (fSaldo) {
        fSaldo.textContent = (s < 0 ? '-' : '') + fmtMoeda(Math.abs(s));
        fSaldo.className   = 'lf-footer-number ' + (s >= 0 ? 'saldo-ok' : 'saldo-bad');
    }
    const lgGasto = document.getElementById('lf-totalGastoDisplay');
    const lgDif   = document.getElementById('lf-diferencaDisplay');
    if (lgGasto) lgGasto.textContent = fmtMoeda(gasto);
    if (lgDif)   lgDif.textContent   = fmtMoeda(saldo);
}

function calcTotalGasto() {
    return lfItens.reduce((s,it) => s + ((Number(it.q)||0)*(Number(it.p)||0)), 0);
}

function renderGaugeRing(pct) {
    const el = document.getElementById('lf-gaugeRing');
    if (!el) return;
    const r=54, cx=64, cy=64, circ=2*Math.PI*r, dash=pct*circ;
    const cor=pct<0.75?'var(--accent,#30D158)':pct<0.90?'#FF9F0A':'#FF453A';
    el.innerHTML=`<svg width="128" height="128" viewBox="0 0 128 128" aria-hidden="true">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
              stroke="var(--surface-3,rgba(255,255,255,0.08))" stroke-width="10"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${cor}" stroke-width="10"
              stroke-dasharray="${dash.toFixed(2)} ${circ.toFixed(2)}"
              stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})"/>
      <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central"
            fill="var(--text-primary,#fff)" font-size="18" font-weight="700"
            font-family="Inter,sans-serif">${Math.round(pct*100)}%</text></svg>`;
}

// ── Tabs internas ─────────────────────────────────────────────────
// BUG FIX v9.7.4: null-guard documentado — tabEl pode ser null se o ID
// 'lf-tab-<lfTab>' não existir no DOM (HTML parcial ou ID divergente).
// O guard 'if (tabEl)' abaixo previne TypeError silencioso.
function configurarTabsLF() {
    const btns  = document.querySelectorAll('.lf-tab-btn');
    const conts = document.querySelectorAll('.lf-tab-content');
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            darFeedback();
            btns.forEach(b => b.classList.remove('active'));
            conts.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            const tabEl = document.getElementById('lf-tab-' + btn.dataset.lfTab);
            if (tabEl) tabEl.classList.add('active');
        });
    });
}

// ── Comparador ────────────────────────────────────────────────────
const UNIT_FACTOR={kg:1,g:0.001,l:1,ml:0.001,un:1};

function configurarComparador() {
    ['lf-comp_p1','lf-comp_p2'].forEach((id,i) => {
        const el=document.getElementById(id);
        if (!el) return;
        const label=`Produto ${i+1}`;
        el.addEventListener('click', () => { darFeedback(); abrirCalcLF(el, label); });
    });
    document.getElementById('lf-btnComparar')?.addEventListener('click', () => {
        darFeedback(); compararProdutos();
    });
}

function compararProdutos() {
    const p1=parseMoeda(document.getElementById('lf-comp_p1')?.value||'0');
    const q1=parseFloat(document.getElementById('lf-comp_q1')?.value.replace(',','.')||'0')||0;
    const u1=document.getElementById('lf-comp_u1')?.value||'kg';
    const p2=parseMoeda(document.getElementById('lf-comp_p2')?.value||'0');
    const q2=parseFloat(document.getElementById('lf-comp_q2')?.value.replace(',','.')||'0')||0;
    const u2=document.getElementById('lf-comp_u2')?.value||'kg';
    const el=document.getElementById('lf-comparadorResultado');
    if (!el) return;
    if (!p1||!q1||!p2||!q2) {
        el.style.display='block';
        el.innerHTML='<p style="text-align:center;opacity:.5;padding:12px;">Preencha todos os campos.</p>';
        return;
    }
    const ppu1=p1/(q1*(UNIT_FACTOR[u1]||1));
    const ppu2=p2/(q2*(UNIT_FACTOR[u2]||1));
    const uLabel=(u1==='g'||u1==='kg')?'kg':(u1==='l'||u1==='ml')?'L':'un';
    const melhor=ppu1<=ppu2?1:2;
    const pct=(Math.max(ppu1,ppu2)>0)?(Math.abs(ppu1-ppu2)/Math.max(ppu1,ppu2)*100).toFixed(1):'0.0';
    el.style.display='block';
    el.innerHTML=`
        <div class="lf-comp-resultado">
            <div class="lf-comp-linha"><span>Produto 1:</span>
                <strong class="${melhor===1?'comp-winner':''}">${fmtMoeda(ppu1)} / ${uLabel}</strong></div>
            <div class="lf-comp-linha"><span>Produto 2:</span>
                <strong class="${melhor===2?'comp-winner':''}">${fmtMoeda(ppu2)} / ${uLabel}</strong></div>
            <div class="lf-comp-vencedor">✅ Produto ${melhor} é ${pct}% mais barato por ${uLabel}</div>
        </div>`;
}

// ── Compartilhar ──────────────────────────────────────────────────
function compartilharListaLF() {
    darFeedback();
    if (lfItens.length===0) { mostrarToast('Lista vazia.'); return; }
    const total=calcTotalGasto();
    const linhas=lfItens.map(it=>`• ${it.n} × ${fmtQtd(it.q)} = ${fmtMoeda((Number(it.q)||0)*(Number(it.p)||0))}`);
    const texto=`🛒 LISTA DE COMPRAS\n\n${linhas.join('\n')}\n\nTOTAL: ${fmtMoeda(total)}\nORÇAMENTO: ${fmtMoeda(lfOrcamento)}`;
    if (navigator.share) navigator.share({text:texto}).catch(()=>copiarParaClipboard(texto));
    else copiarParaClipboard(texto);
}

// ── Helpers ───────────────────────────────────────────────────────
function salvarLF() { salvarItensLF(lfItens); agendarSnapshot(); }

function fmtMoeda(val) {
    const n=typeof val==='number'?val:parseFloat(val)||0;
    const abs=Math.abs(n)<0.005?0:Math.abs(n);
    return 'R$ '+abs.toFixed(2).replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,'.');
}
function parseMoeda(str) {
    return parseFloat(String(str).replace(/R\$\s?/,'').replace(/\./g,'').replace(',','.'))||0;
}
function fmtQtd(val) {
    const n=Number(val)||0; return n%1===0?String(n):n.toFixed(2).replace('.',',');
}

// ══════════════════════════════════════════════════════════════════
// API INTERNA — Usada exclusivamente pelo módulo ia.js
// Manipula o estado privado (lfItens / lfOrcamento) e re-renderiza
// a UI, garantindo que as mudanças feitas pela IA reflitam em tempo
// real na aba Lista Fácil sem precisar recarregar a página.
// ══════════════════════════════════════════════════════════════════

/** Retorna uma cópia imutável dos itens atuais da lista. */
export function iaObterItensLF() {
    return lfItens.map(it => ({ ...it }));
}

/** Retorna o orçamento atual. */
export function iaObterOrcamentoLF() {
    return lfOrcamento;
}

/**
 * Adiciona um item à lista de compras.
 * @param {string} nome
 * @param {number} [quantidade=1]
 * @param {number} [preco=0]
 */
export function iaAdicionarItemLF(nome, quantidade = 1, preco = 0) {
    if (!nome?.trim()) return { ok: false, erro: 'Nome não informado.' };
    const q = nome.toLowerCase().trim();
    if (lfItens.some(it => it.n.toLowerCase() === q))
        return { ok: false, erro: `"${nome}" já está na lista.` };
    lfItens.push({ id: Date.now(), n: nome.trim(), q: Number(quantidade) || 1, p: Number(preco) || 0 });
    salvarLF();
    renderLFLista();
    atualizarGauge();
    return { ok: true, msg: `"${nome.trim()}" adicionado à lista de compras.` };
}

/**
 * Remove um item da lista de compras (busca parcial pelo nome).
 * @param {string} nome
 */
export function iaRemoverItemLF(nome) {
    if (!nome?.trim()) return { ok: false, erro: 'Nome não informado.' };
    const q = nome.toLowerCase().trim();
    const idx = lfItens.findIndex(it =>
        it.n.toLowerCase() === q || it.n.toLowerCase().includes(q) || q.includes(it.n.toLowerCase())
    );
    if (idx < 0) return { ok: false, erro: `"${nome}" não encontrado na lista.` };
    const removido = lfItens[idx].n;
    lfItens.splice(idx, 1);
    salvarLF();
    renderLFLista();
    atualizarGauge();
    return { ok: true, msg: `"${removido}" removido da lista de compras.` };
}

/**
 * Define o orçamento da lista de compras.
 * @param {number} valor  Valor em R$
 */
export function iaDefinirOrcamentoLF(valor) {
    const v = Number(valor);
    if (!v || v <= 0) return { ok: false, erro: 'Valor de orçamento inválido.' };
    lfOrcamento = v;
    salvarOrcamentoLF(lfOrcamento);
    atualizarGauge();
    return { ok: true, msg: `Orçamento da Lista Fácil definido para R$ ${v.toFixed(2).replace('.', ',')}.` };
}

/**
 * Adiciona múltiplos itens de uma vez à lista (usado por transferir_marcados).
 * Itens já presentes são ignorados.
 * @param {Array<{nome: string, quantidade?: number, preco?: number}>} itens
 */
export function iaAdicionarVariosItensLF(itens) {
    if (!Array.isArray(itens) || !itens.length) return { ok: false, erro: 'Nenhum item informado.' };
    const adicionados = [], ignorados = [];
    for (const it of itens) {
        const nome = it.nome?.trim();
        if (!nome) continue;
        if (lfItens.some(x => x.n.toLowerCase() === nome.toLowerCase())) {
            ignorados.push(nome); continue;
        }
        lfItens.push({ id: Date.now() + Math.random(), n: nome, q: Number(it.quantidade) || 1, p: Number(it.preco) || 0 });
        adicionados.push(nome);
    }
    if (adicionados.length) { salvarLF(); renderLFLista(); atualizarGauge(); }
    return {
        ok: adicionados.length > 0,
        msg: adicionados.length
            ? `${adicionados.length} item(s) transferido(s): ${adicionados.join(', ')}.${ignorados.length ? ` Já existiam: ${ignorados.join(', ')}.` : ''}`
            : `Todos os itens já estavam na lista: ${ignorados.join(', ')}.`,
    };
}
