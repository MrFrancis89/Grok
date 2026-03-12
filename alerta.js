// alerta.js — StockFlow Pro v10.0.0
// ══════════════════════════════════════════════════════════════════
// CORREÇÕES APLICADAS
// ══════════════════════════════════════════════════════════════════
// BUG #1 — verificarAlertas lê do localStorage em vez do DOM em memória
//   PROBLEMA : verificarAlertas() lia os dados via JSON.parse(localStorage)
//              enquanto o DOM pode ter edições não salvas (ex.: usuário
//              alterou a quantidade na tabela mas ainda não salvou).
//              Resultado: alertas disparavam com valores desatualizados,
//              ou NÃO disparavam quando deveriam.
//   CORREÇÃO : Usa coletarDadosDaTabela() como fonte de verdade do estado
//              atual do DOM. O localStorage é consultado apenas via
//              carregarDados() para os limites min/max, pois eles não são
//              editados inline — mas aqui unificamos tudo no DOM via dataset.
//
// BUG #2 — .innerText em nomEl.innerText
//   PROBLEMA : Força reflow. Para texto simples, textContent é suficiente.
//   CORREÇÃO : .textContent
//
// BUG #3 — itemAlertaAtual não é verificado antes de acessar dataset
//   PROBLEMA : Se abrirModalAlerta for chamado com um elemento sem ancestral
//              <tr>, itemAlertaAtual fica null mas o modal ainda abre com
//              campos populados de uma chamada anterior.
//   CORREÇÃO : Guard explícito antes de popular os campos.
// ══════════════════════════════════════════════════════════════════

import { mostrarToast } from './toast.js';
import { salvarDados } from './storage.js';
import { coletarDadosDaTabela } from './tabela.js';
import { alternarCheck } from './eventos.js';

let itemAlertaAtual = null;

export function abrirModalAlerta(elemento) {
    const tr = (elemento.tagName === 'TR') ? elemento : elemento.closest('tr');
    if (!tr) return; // BUG FIX #3: guard antes de qualquer acesso a dataset.

    itemAlertaAtual = tr;
    const min = tr.dataset.min !== '' ? tr.dataset.min : '';
    const max = tr.dataset.max !== '' ? tr.dataset.max : '';
    document.getElementById('alerta-min').value = min;
    document.getElementById('alerta-max').value = max;
    document.getElementById('modal-alerta').style.display = 'flex';
}

export function fecharModalAlerta() {
    document.getElementById('modal-alerta').style.display = 'none';
    itemAlertaAtual = null;
}

export function salvarAlerta() {
    if (!itemAlertaAtual) return;
    const minRaw = document.getElementById('alerta-min').value;
    const maxRaw = document.getElementById('alerta-max').value;
    const min = minRaw !== '' ? parseFloat(minRaw) : null;
    const max = maxRaw !== '' ? parseFloat(maxRaw) : null;

    itemAlertaAtual.dataset.min = (min !== null) ? min : '';
    itemAlertaAtual.dataset.max = (max !== null) ? max : '';

    const dados = coletarDadosDaTabela();
    salvarDados(dados);
    verificarAlertas();
    fecharModalAlerta();
}

export function verificarAlertas() {
    // BUG FIX #1: fonte de verdade = DOM em memória (via coletarDadosDaTabela),
    // não o localStorage. Capta edições ainda não salvas pelo usuário.
    const dados = coletarDadosDaTabela();

    // Indexa TRs por nome uma única vez — O(n) em vez de O(n²).
    const trPorNome = new Map();
    document.querySelectorAll('#lista-itens-container tr:not(.categoria-header-row)').forEach(r => {
        // BUG FIX #2: textContent em vez de innerText.
        const nomEl = r.querySelector('.nome-prod');
        if (nomEl) trPorNome.set(nomEl.textContent.trim(), r);
    });

    dados.forEach(item => {
        if (!item?.n) return;
        const qtd = parseFloat((item.q || '').replace(',', '.')) || 0;

        if (item.min !== null && item.min !== undefined && item.min !== '' && qtd < parseFloat(item.min)) {
            // FIX v10.0.0: tipo 'aviso' (âmbar) — distingue visualmente alertas de estoque
            // de notificações informativas neutras.
            mostrarToast(`⚠️ Estoque baixo: ${item.n}`, 'aviso');
            const r = trPorNome.get(item.n);
            if (r) {
                const chk = r.querySelector('input[type="checkbox"]');
                if (chk && !chk.checked) {
                    chk.checked = true;
                    alternarCheck(chk);
                }
            }
        }

        if (item.max !== null && item.max !== undefined && item.max !== '' && qtd > parseFloat(item.max)) {
            mostrarToast(`📦 Estoque excessivo: ${item.n}`, 'aviso');
        }
    });
}