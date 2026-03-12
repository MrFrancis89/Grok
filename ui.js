// ui.js — StockFlow Pro v10.0.0
// ══════════════════════════════════════════════════════════════════
// CORREÇÕES APLICADAS
// ══════════════════════════════════════════════════════════════════
// BUG #1 — containerItens capturado no top-level do módulo
//   PROBLEMA : document.getElementById() executado quando o módulo é
//              parseado/importado, antes do DOMContentLoaded → retorna
//              null → qualquer chamada subsequente joga TypeError.
//   CORREÇÃO : lazy getter getContainer() resolve o elemento sob demanda.
//
// BUG #2 — Array.sort() muta o array de entrada
//   PROBLEMA : renderizarListaCompleta(dados) ordena o próprio 'dados'
//              in-place, causando efeitos colaterais silenciosos nos
//              chamadores (ex.: salvarEAtualizar salva a lista reordenada
//              antes de chamar esta função, mas a segunda chamada recebe
//              um array já mutado e em ordem diferente do esperado).
//   CORREÇÃO : [...dados].sort() cria uma cópia rasa antes de ordenar.
//
// BUG #3 — for...in em objeto literal
//   PROBLEMA : for...in itera propriedades herdadas do protótipo.
//              Polyfills e libs antigas podem adicionar enumeráveis ao
//              Object.prototype, inserindo categorias fantasma no DOM.
//   CORREÇÃO : for...of Object.entries() itera apenas propriedades próprias.
//
// BUG #4 — null-guard ausente em atualizarStatusSave
//   PROBLEMA : Se #status-save não existir (ex.: aba diferente carregada),
//              style.opacity joga TypeError silencioso.
//   CORREÇÃO : Guard adicionado.
// ══════════════════════════════════════════════════════════════════

import { identificarCategoria, coresCategorias, nomesCategorias } from './categorias.js';
import { salvarDados } from './storage.js';
import { abrirCalculadora } from './calculadora.js';
import { atualizarPainelCompras } from './compras.js';
import { coletarDadosDaTabela } from './tabela.js';
import { atualizarDropdown } from './dropdown.js';
// FIX v10.0.0 — SEGURANÇA: esc() importada para sanitizar dados do usuário antes
// de injetar no innerHTML (previne XSS se um nome de produto contiver HTML/JS).
import { esc } from './utils.js';

// BUG FIX #1: lazy getter — nunca capture elementos DOM no top-level de módulos ES.
function getContainer() {
    const el = document.getElementById('lista-itens-container');
    if (!el) console.warn('[ui.js] #lista-itens-container não encontrado no DOM.');
    return el;
}

export function renderizarListaCompleta(dados) {
    const containerItens = getContainer();
    if (!containerItens) return;

    containerItens.innerHTML = '';

    // BUG FIX #2: spread cria cópia rasa — o array original não é mutado.
    const sorted = [...dados].sort((a, b) => a.n.localeCompare(b.n, 'pt-BR'));

    const grupos = {
        carnes: [], laticinios: [], hortifruti: [], mercearia: [],
        temperos: [], limpeza: [], bebidas: [], embalagens: [], outros: []
    };
    sorted.forEach(item => grupos[identificarCategoria(item.n)].push(item));

    // BUG FIX #3: for...of Object.entries() — seguro contra protótipos poluídos.
    for (const [cat, itens] of Object.entries(grupos)) {
        if (itens.length === 0) continue;

        const trHeader = document.createElement('tr');
        trHeader.classList.add('categoria-header-row');
        trHeader.innerHTML = `<td colspan="4" class="categoria-header" style="background-color:${coresCategorias[cat]}">${nomesCategorias[cat]}</td>`;
        containerItens.appendChild(trHeader);

        itens.forEach(item => inserirLinhaNoDOM(item.n, item.q, item.u, item.c, item.min, item.max));
    }
}

export function inserirLinhaNoDOM(n, q, u, chk, min, max) {
    const containerItens = getContainer();
    if (!containerItens) return;

    const tr = document.createElement('tr');
    if (chk) tr.classList.add('linha-marcada');
    tr.dataset.min = (min != null) ? min : '';
    tr.dataset.max = (max != null) ? max : '';

    // FIX v10.0.0 — SEGURANÇA: esc() sanitiza nome e quantidade do usuário antes
    // de injetar no innerHTML. Previne XSS caso um backup malicioso ou entrada
    // manual contenha HTML (<img src=x onerror=...>) no nome do produto.
    const nSafe = esc(n);
    const qSafe = esc(q);

    tr.innerHTML = `
        <td class="col-check"><input type="checkbox" ${chk ? 'checked' : ''}></td>
        <td class="col-desc">
            <span contenteditable="true" class="nome-prod">${nSafe}</span>
        </td>
        <td class="col-qtd"><input type="text" class="input-qtd-tabela" value="${qSafe}" readonly></td>
        <td class="col-unid"><select class="select-tabela">
            <option value="kg"  ${u === 'kg'  ? 'selected' : ''}>kg</option>
            <option value="g"   ${u === 'g'   ? 'selected' : ''}>g</option>
            <option value="uni" ${u === 'uni' ? 'selected' : ''}>uni</option>
            <option value="pct" ${u === 'pct' ? 'selected' : ''}>pct</option>
            <option value="cx"  ${u === 'cx'  ? 'selected' : ''}>cx</option>
            <option value="bld" ${u === 'bld' ? 'selected' : ''}>bld</option>
            <option value="crt" ${u === 'crt' ? 'selected' : ''}>crt</option>
        </select></td>
    `;
    containerItens.appendChild(tr);
}

export function atualizarStatusSave() {
    // BUG FIX #4: null-guard
    const s = document.getElementById('status-save');
    if (!s) return;
    s.style.opacity = '1';
    setTimeout(() => { s.style.opacity = '0'; }, 1500);
}

export function salvarEAtualizar() {
    const dados = coletarDadosDaTabela();
    salvarDados(dados);
    renderizarListaCompleta(dados);
    atualizarDropdown();
    atualizarPainelCompras();
}