// ft-dashboard.js — v3.1
// v3.1: getReceitas() → getReceitasAtivas() para consistência com o Simulador.
//       esc() importado de ft-format.js (sem duplicação local).
import { getReceitasAtivas } from './ft-receitas.js';
import { getIngredientes } from './ft-ingredientes.js';
import { calcPrecoMarkup, calcLucro, calcMargemReal, calcRendimento } from './ft-calc.js';
import { formatCurrency, formatPercent, formatQtdUnid, formatNum, esc } from './ft-format.js';
import { renderEmpty, renderTutorial } from './ft-ui.js';
import { ico } from './ft-icons.js';

export function renderDashboard() {
    const recs = getReceitasAtivas();
    const ings = getIngredientes();
    const wrap = document.getElementById('ft-dashboard');
    if (!wrap) return;

    renderTutorial('ft-sec-dash', 'dash', ico.dashboard, 'Entendendo o Dashboard', [
        'O dashboard usa <strong>markup 200%</strong> como referência para comparações.',
        'KPIs mostram um panorama rápido do seu cardápio.',
        'O ranking lista as pizzas da mais lucrativa para a menos lucrativa.',
        'Receitas com <strong>margem negativa</strong> são sinalizadas para correção.',
    ]);

    if (!recs.length) {
        renderEmpty(wrap, ico.dashboard,
            'Dashboard vazio',
            'Cadastre receitas para ver as estatísticas de lucratividade.');
        return;
    }

    const MK     = 200;
    const custos = recs.map(r => r.custo_total || 0);
    const precos = custos.map(c => calcPrecoMarkup(c, MK));
    const lucros = precos.map((p, i) => calcLucro(p, custos[i]));
    const margs  = precos.map((p, i) => calcMargemReal(p, custos[i]));
    const n      = recs.length;

    const custoMed = custos.reduce((a, b) => a + b, 0) / n;
    const margMed  = margs.reduce((a, b) => a + b, 0) / n;

    const iMC = custos.reduce((mi, v, i, a) => v > a[mi] ? i : mi, 0);
    const imc = custos.reduce((mi, v, i, a) => v < a[mi] ? i : mi, 0);
    const iML = lucros.reduce((mi, v, i, a) => v > a[mi] ? i : mi, 0);

    const ranking = recs
        .map((r, i) => ({ r, c: custos[i], p: precos[i], l: lucros[i], m: margs[i] }))
        .sort((a, b) => b.l - a.l);

    // Feat 8: detecta receitas com margem negativa ou zero
    const negativas = ranking.filter(it => it.m <= 0 || it.c === 0);
    _atualizarBadgeAlerta(negativas.length);

    const alertaHtml = negativas.length ? `
        <div class="ft-alerta-margem">
            <div class="ft-alerta-ico">${ico.warn}</div>
            <div class="ft-alerta-body">
                <div class="ft-alerta-titulo">Atenção: margem negativa</div>
                <div class="ft-alerta-sub">
                    ${negativas.map(it =>
                        `<span class="ft-alerta-nome">${esc(it.r.nome)}</span>`
                    ).join('')}
                </div>
                <div class="ft-alerta-hint">Verifique os custos no Simulador.</div>
            </div>
        </div>` : '';

    wrap.innerHTML = `
        ${alertaHtml}

        <!-- KPIs -->
        <div class="ft-kpis">
            <div class="ft-kpi">
                <div class="ft-kpi-ico">${ico.recipes}</div>
                <div class="ft-kpi-val">${n}</div>
                <div class="ft-kpi-lbl">Receitas</div>
            </div>
            <div class="ft-kpi">
                <div class="ft-kpi-ico">${ico.ingredients}</div>
                <div class="ft-kpi-val">${ings.length}</div>
                <div class="ft-kpi-lbl">Ingredientes</div>
            </div>
            <div class="ft-kpi">
                <div class="ft-kpi-ico">${ico.tag}</div>
                <div class="ft-kpi-val">${formatCurrency(custoMed)}</div>
                <div class="ft-kpi-lbl">Custo médio</div>
            </div>
            <div class="ft-kpi${margMed < 0 ? ' ft-kpi-danger' : ' ft-kpi-hi'}">
                <div class="ft-kpi-ico">${ico.money}</div>
                <div class="ft-kpi-val">${formatPercent(margMed)}</div>
                <div class="ft-kpi-lbl">Margem média</div>
            </div>
        </div>

        <!-- Destaques — guard: só mostra "Mais cara/barata" com 2+ receitas -->
        <div class="ft-dash-sec-title">Destaques</div>
        <div class="ft-destaques">
            <div class="ft-dest ft-dest-green">
                <div class="ft-dest-ico">${ico.trophy}</div>
                <div>
                    <div class="ft-dest-lbl">Mais lucrativa</div>
                    <div class="ft-dest-name">${esc(recs[iML].nome)}</div>
                    <div class="ft-dest-val">${formatCurrency(lucros[iML])} lucro</div>
                </div>
            </div>
            ${n > 1 ? `
            <div class="ft-dest ft-dest-amber">
                <div class="ft-dest-ico">${ico.star}</div>
                <div>
                    <div class="ft-dest-lbl">Mais cara (custo)</div>
                    <div class="ft-dest-name">${esc(recs[iMC].nome)}</div>
                    <div class="ft-dest-val">${formatCurrency(custos[iMC])} custo</div>
                </div>
            </div>
            <div class="ft-dest ft-dest-blue">
                <div class="ft-dest-ico">${ico.check}</div>
                <div>
                    <div class="ft-dest-lbl">Mais barata (custo)</div>
                    <div class="ft-dest-name">${esc(recs[imc].nome)}</div>
                    <div class="ft-dest-val">${formatCurrency(custos[imc])} custo</div>
                </div>
            </div>` : ''}
        </div>

        <!-- Ranking -->
        <div class="ft-dash-sec-title">
            Ranking <span class="ft-dash-sec-sub">markup ${MK}%</span>
        </div>
        <div class="ft-ranking">
            ${ranking.map((it, pos) => {
                const barW  = ranking[0].l > 0 ? (it.l / ranking[0].l * 100).toFixed(1) : 0;
                const medal = pos === 0 ? '🥇' : pos === 1 ? '🥈' : pos === 2 ? '🥉' : '';
                const negCls = it.m <= 0 ? 'ft-rank-item-neg' : '';
                return `
                <div class="ft-rank-item ${negCls}">
                    <div class="ft-rank-pos">${medal || pos + 1}</div>
                    <div class="ft-rank-body">
                        <div class="ft-rank-name">
                            ${esc(it.r.nome)}
                            <span class="ft-tam-pill">${it.r.tamanho}</span>
                            ${it.m <= 0 ? `<span class="ft-warn-badge">${ico.warn}</span>` : ''}
                        </div>
                        <div class="ft-rank-sub">Custo ${formatCurrency(it.c)} · Preço ${formatCurrency(it.p)}</div>
                        <div class="ft-rank-bar-wrap">
                            <div class="ft-rank-bar${it.m <= 0 ? ' red' : ''}" style="width:${barW}%"></div>
                        </div>
                    </div>
                    <div class="ft-rank-right">
                        <div class="ft-rank-lucro${it.l <= 0 ? ' neg' : ''}">${formatCurrency(it.l)}</div>
                        <div class="ft-rank-marg">${formatPercent(it.m)}</div>
                    </div>
                </div>`;
            }).join('')}
        </div>

        <!-- Rendimento de ingredientes -->
        ${ings.filter(ig => recs.some(r => r.ingredientes?.some(i => i.ingrediente_id === ig.id))).length ? `
        <div class="ft-dash-sec-title">Rendimento de ingredientes</div>
        <div class="ft-rendilist">
            ${ings
                .filter(ig => recs.some(r => r.ingredientes?.some(i => i.ingrediente_id === ig.id)))
                .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
                .map(ig => {
                    const usos = recs.flatMap(r =>
                        (r.ingredientes || [])
                            .filter(i => i.ingrediente_id === ig.id)
                            .map(i => ({ pizza: r.nome, qtd: i.quantidade }))
                    );
                    return `
                    <div class="ft-rend-card">
                        <div class="ft-rend-hd">
                            <span class="ft-rend-nome">${esc(ig.nome)}</span>
                            <span class="ft-rend-emb">${formatQtdUnid(ig.quantidade_embalagem, ig.unidade)}/emb.</span>
                        </div>
                        ${usos.map(u => `
                        <div class="ft-rend-row">
                            <span>${esc(u.pizza)}</span>
                            <span class="ft-rend-qtd">${formatQtdUnid(u.qtd, ig.unidade)}/pizza</span>
                            <span class="ft-rend-res">${formatNum(calcRendimento(ig.quantidade_embalagem, u.qtd), 1)} pizzas/emb.</span>
                        </div>`).join('')}
                    </div>`;
                }).join('')}
        </div>` : ''}`;
}

// Feat 8: badge vermelho na aba Dashboard
function _atualizarBadgeAlerta(n) {
    const btn = document.querySelector('.ft-nav-btn[data-tab="dash"]');
    if (!btn) return;
    let badge = btn.querySelector('.ft-nav-badge');
    if (n > 0) {
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'ft-nav-badge';
            btn.appendChild(badge);
        }
        badge.textContent = n;
    } else {
        badge?.remove();
    }
}

// fim de ft-dashboard.js
