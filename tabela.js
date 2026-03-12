// tabela.js — StockFlow Pro v9.7.4
// ══════════════════════════════════════════════════════════════════
// CORREÇÕES APLICADAS
// ══════════════════════════════════════════════════════════════════
// BUG #1 — .innerText causa layout reflow (thrashing)
//   PROBLEMA : .innerText força o browser a recalcular o layout (reflow)
//              para computar o texto visível levando em conta CSS
//              (display:none, visibility, white-space, etc.).
//              Em listas grandes (100+ itens) isso degrada performance.
//   CORREÇÃO : .textContent para leitura de texto puro (sem HTML).
//              É ~2–10× mais rápido e não força reflow.
//
// BUG #2 — Regex /(\r\n|\n|\r)/gm com flag 'm' desnecessária
//   PROBLEMA : A flag 'm' muda o comportamento de ^ e $, mas não afeta
//              o match de \r\n|\n|\r. É enganosa e levemente ineficiente.
//   CORREÇÃO : Regex simplificada sem flag 'm'.
// ══════════════════════════════════════════════════════════════════

export function coletarDadosDaTabela() {
    const dados = [];

    document.querySelectorAll('#lista-itens-container tr:not(.categoria-header-row)').forEach(r => {
        const c = r.querySelectorAll('td');
        if (c.length === 0) return;

        // BUG FIX #1: textContent em vez de innerText (sem reflow).
        // BUG FIX #2: regex sem flag 'm' desnecessária.
        const nome = c[1].querySelector('.nome-prod').textContent.replace(/\r\n|\n|\r/g, ' ').trim();
        const qtd  = c[2].querySelector('input').value.trim();
        const unid = c[3].querySelector('select').value;
        const chk  = c[0].querySelector("input[type='checkbox']").checked;
        const min  = r.dataset.min !== '' ? parseFloat(r.dataset.min) : null;
        const max  = r.dataset.max !== '' ? parseFloat(r.dataset.max) : null;

        dados.push({ n: nome, q: qtd, u: unid, c: chk, min, max });
    });

    return dados;
}