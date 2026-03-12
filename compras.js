// compras.js — StockFlow Pro v9.7.4
// ══════════════════════════════════════════════════════════════════
// CORREÇÕES APLICADAS
// ══════════════════════════════════════════════════════════════════
// BUG #1 — .innerText força reflow de layout
//   PROBLEMA : .innerText em .nome-prod causa recalcuação do layout CSS
//              a cada leitura. Em listas longas com muitos itens marcados,
//              isso gera múltiplos reflows sequenciais.
//   CORREÇÃO : .textContent para leitura de texto puro.
// ══════════════════════════════════════════════════════════════════

import { coletarDadosDaTabela } from './tabela.js';
import { obterDataAmanha } from './utils.js';

export function atualizarPainelCompras() {
    const ulCompras   = document.getElementById('lista-compras-visual');
    const areaCompras = document.getElementById('area-compras');
    if (!ulCompras || !areaCompras) return;

    // Coleta todos os itens marcados primeiro, depois ordena —
    // garante que o painel visual fique idêntico ao texto exportado.
    const nomes = [];
    document.querySelectorAll('#lista-itens-container tr:not(.categoria-header-row)').forEach(r => {
        const checkbox = r.querySelector("input[type='checkbox']");
        if (checkbox?.checked) {
            // BUG FIX #1: textContent em vez de innerText.
            nomes.push(r.querySelector('.nome-prod').textContent.replace(/\r\n|\n|\r/g, ' ').trim());
        }
    });

    // Ordem alfabetica — identica ao gerarTextoCompras()
    nomes.sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));

    ulCompras.innerHTML = '';
    nomes.forEach(nome => {
        const li = document.createElement('li');
        li.textContent = nome;
        ulCompras.appendChild(li);
    });

    areaCompras.style.display = nomes.length ? 'block' : 'none';
}

export function gerarTextoCompras() {
    const itens = [];

    document.querySelectorAll('#lista-itens-container tr:not(.categoria-header-row)').forEach(r => {
        const check = r.querySelector("input[type='checkbox']");
        if (check?.checked) {
            // BUG FIX #1: textContent em vez de innerText.
            itens.push(r.querySelector('.nome-prod').textContent.replace(/\r\n|\n|\r/g, ' ').trim());
        }
    });

    itens.sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
    return `*LISTA DE COMPRAS ${obterDataAmanha()}*\n\n` + itens.join('\n') + '\n';
}