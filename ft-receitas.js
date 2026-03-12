// ft-receitas.js — v3.2
// v3.2: _maskDecimal e _esc extraídos para ft-format.js (sem duplicação).
//       applyMaskDecimal preserva cursor corretamente (fix ft-receitas v3.1).
import { salvar, carregar, remover }   from './ft-storage.js';
import { calcCustoIngrediente, calcCustoReceita } from './ft-calc.js';
import { formatCurrency, formatQtdUnid, generateId,
         parseNum, n2input, TAMANHO_LABEL, PORCOES_PADRAO,
         esc, applyMaskDecimal } from './ft-format.js';
import { toast, abrirModal, fecharModal, confirmar,
         renderEmpty, renderTutorial }  from './ft-ui.js';
import { abrirPickerIngrediente }       from './ft-ingredientes.js';
import { ico }                          from './ft-icons.js';

const COL     = 'receitas';
let _recs     = [];
let _editList = [];
let _filtroTam = '';

export async function initReceitas()   { _recs = await carregar(COL); }
export function getReceitas()          { return _recs; }
export function getReceitasAtivas()    { return _recs.filter(r => r.ativo !== false); }
export function getReceitaById(id)     { return _recs.find(r => r.id === id) || null; }

function _tut() {
    renderTutorial('ft-sec-rec', 'rec', ico.recipes, 'Como criar receitas', [
        'Toque em <strong>+</strong> para criar uma nova receita de pizza.',
        'Dê um nome, tamanho e adicione ingredientes com quantidades.',
        'Use <strong>★</strong> para marcar favoritas; <strong>Clonar</strong> cria uma cópia para editar.',
        'Filtre por tamanho com os chips P · M · G · GG.',
    ]);
}

export function renderReceitas(busca = '') {
    const wrap = document.getElementById('ft-lista-rec');
    if (!wrap) return;
    _tut();

    const q    = busca.trim().toLowerCase();
    const lista = [..._recs]
        .filter(r => (!q || r.nome.toLowerCase().includes(q)) && (!_filtroTam || r.tamanho === _filtroTam))
        .sort((a, b) => {
            const fa = a.favorito ? 1 : 0, fb = b.favorito ? 1 : 0;
            if (fb !== fa) return fb - fa;
            return a.nome.localeCompare(b.nome, 'pt-BR');
        });

    const chips = ['', 'P', 'M', 'G', 'GG'].map(t =>
        `<button class="ft-size-chip${_filtroTam === t ? ' active' : ''}" data-tam="${t}" type="button">${t || 'Todos'}</button>`
    ).join('');

    wrap.innerHTML = `
        <div class="ft-rec-toolbar">
            <div class="ft-size-chips">${chips}</div>
            ${lista.length ? `<span class="ft-list-hdr-inline">${lista.length} receita${lista.length !== 1 ? 's' : ''}</span>` : ''}
        </div>`;

    if (!lista.length) {
        const sub = document.createElement('div');
        wrap.appendChild(sub);
        renderEmpty(sub, ico.recipes,
            q ? 'Nenhuma receita encontrada' : 'Nenhuma receita cadastrada',
            q ? 'Tente outro termo.' : 'Crie sua primeira receita tocando em +.',
            q ? null : { label: 'Nova receita', fn: () => abrirFormReceita() }
        );
    } else {
        const listDiv = document.createElement('div');
        listDiv.className = 'ft-list';
        listDiv.innerHTML = lista.map(r => {
            const chips3 = (r.ingredientes || []).slice(0, 3)
                .map(i => `<span class="ft-chip">${esc(i.nome)}</span>`).join('') +
                ((r.ingredientes?.length || 0) > 3
                    ? `<span class="ft-chip ft-chip-more">+${r.ingredientes.length - 3}</span>` : '');
            const inatBadge = r.ativo === false ? `<span class="ft-inat-badge">inativo</span>` : '';
            return `
            <div class="ft-list-item ft-rec-row${r.ativo === false ? ' ft-rec-inativo' : ''}" data-id="${r.id}">
                <button class="ft-rec-main" data-id="${r.id}" type="button">
                    <span class="ft-item-ico ft-ico-rec">${ico.recipes}</span>
                    <span class="ft-item-body">
                        <span class="ft-item-name">
                            ${esc(r.nome)} <span class="ft-tam-pill">${r.tamanho}</span>${inatBadge}
                        </span>
                        <span class="ft-item-chips">${chips3}</span>
                    </span>
                    <span class="ft-item-end">
                        <span class="ft-pill ft-pill-acc">${formatCurrency(r.custo_total)}</span>
                    </span>
                </button>
                <button class="ft-fav-btn${r.favorito ? ' on' : ''}" data-id="${r.id}" type="button"
                    title="${r.favorito ? 'Remover favorito' : 'Marcar favorito'}">
                    ${r.favorito ? ico.starFill : ico.star}
                </button>
            </div>`;
        }).join('');
        wrap.appendChild(listDiv);

        wrap.querySelectorAll('.ft-rec-main').forEach(b =>
            b.addEventListener('click', () => abrirFormReceita(b.dataset.id)));

        // Feat 3: toggle favorito
        wrap.querySelectorAll('.ft-fav-btn').forEach(btn => btn.addEventListener('click', async e => {
            e.stopPropagation();
            const r = getReceitaById(btn.dataset.id);
            if (!r) return;
            r.favorito = !r.favorito;
            await salvar(COL, r.id, r);
            renderReceitas(document.getElementById('ft-busca-rec')?.value || '');
        }));
    }

    // Feat 6: filtro tamanho
    wrap.querySelectorAll('.ft-size-chip').forEach(b => b.addEventListener('click', () => {
        _filtroTam = b.dataset.tam;
        renderReceitas(document.getElementById('ft-busca-rec')?.value || '');
    }));
}

// ── Formulário (síncrono) ────────────────────────────────────
export function abrirFormReceita(id = null, clonarDeId = null) {
    const base     = id ? getReceitaById(id) : clonarDeId ? getReceitaById(clonarDeId) : null;
    const clonando = !id && !!clonarDeId;
    _editList      = base ? (base.ingredientes || []).map(i => ({ ...i })) : [];

    const tamOpts = ['P','M','G','GG'].map(t =>
        `<option value="${t}"${(base?.tamanho === t || (!base && t === 'G')) ? ' selected' : ''}>${TAMANHO_LABEL[t]}</option>`
    ).join('');
    const nomeVal  = clonando ? `${base?.nome || ''} (cópia)` : (base?.nome || '');
    const isAtivo  = base ? base.ativo !== false : true;
    const titulo   = id ? 'Editar receita' : clonando ? 'Clonar receita' : 'Nova receita';

    const html = `
        <div class="ft-mhd">
            <button class="ft-mhd-close" id="_rClose">${ico.close}</button>
            <span class="ft-mhd-title">${titulo}</span>
            ${id ? `<button class="ft-mhd-del" id="_rDel">${ico.trash}</button>` : `<span style="width:32px"></span>`}
        </div>
        <div class="ft-mbody">
            <div class="ft-field-row">
                <div class="ft-field" style="flex:2">
                    <label for="ft-rec-nome">Nome da pizza</label>
                    <input id="ft-rec-nome" class="ft-input" type="text"
                        placeholder="Ex: Margherita, Calabresa…"
                        value="${esc(nomeVal)}" autocomplete="off">
                </div>
                <div class="ft-field">
                    <label for="ft-rec-tam">Tamanho</label>
                    <select id="ft-rec-tam" class="ft-input ft-select">${tamOpts}</select>
                </div>
            </div>
            <label class="ft-toggle-label">
                <input type="checkbox" id="ft-rec-ativo" class="ft-toggle-cb" ${isAtivo ? 'checked' : ''}>
                <span class="ft-toggle-switch"></span>
                <span class="ft-toggle-txt">Receita ativa (visível no Simulador e Dashboard)</span>
            </label>
            <div class="ft-field">
                <div class="ft-label-row">
                    <label>Ingredientes</label>
                    <button class="ft-btn ft-btn-sm ft-btn-ghost" id="_rAddIng" type="button">
                        <span class="ft-bico">${ico.plus}</span><span>Adicionar</span>
                    </button>
                </div>
                <div id="ft-rec-ings"></div>
            </div>
            <div class="ft-calc-preview" id="ft-rec-custo">
                <span class="ft-calc-label">${ico.tag} Custo total</span>
                <span class="ft-calc-val" id="ft-rec-custo-val">—</span>
            </div>
            <div class="ft-tip-banner">${ico.info}
                <span>Use o <strong>Simulador</strong> para calcular preço, overhead e custo por fatia.</span>
            </div>
        </div>
        <div class="ft-mft ft-mft-row">
            ${id ? `<button class="ft-btn ft-btn-ghost" id="_rClonar" type="button">
                <span class="ft-bico">${ico.copy}</span><span>Clonar</span>
            </button>` : ''}
            <button class="ft-btn ft-btn-primary${!id ? ' ft-btn-full' : ''}" id="_rSave" type="button">
                <span class="ft-bico">${ico.save}</span><span>Salvar</span>
            </button>
        </div>`;

    const done = abrirModal(html, { largo: true });
    _renderEdList();

    document.getElementById('_rClose')?.addEventListener('click', () => fecharModal(null), { once: true });
    document.getElementById('_rSave')?.addEventListener('click', () => _save(id));
    document.getElementById('_rDel')?.addEventListener('click', async () => { fecharModal(null); await _del(id); });

    // Feat 5: clonar
    document.getElementById('_rClonar')?.addEventListener('click', () => { fecharModal(null); abrirFormReceita(null, id); });

    document.getElementById('_rAddIng')?.addEventListener('click', async () => {
        const ja  = _editList.map(i => i.ingrediente_id);
        const res = await abrirPickerIngrediente(ja);
        if (!res) return;
        const { ing, qtd } = res;
        _editList.push({
            ingrediente_id: ing.id, nome: ing.nome,
            quantidade: qtd, unidade: ing.unidade,
            custo: calcCustoIngrediente(qtd, ing.custo_unitario),
        });
        _renderEdList();
    });
    return done;
}

// Máscara decimal: importada de ft-format.js (applyMaskDecimal)

function _renderEdList() {
    const wrap = document.getElementById('ft-rec-ings');
    if (!wrap) return;

    if (!_editList.length) {
        wrap.innerHTML = `<div class="ft-ings-empty">${ico.ingredients}
            <span>Nenhum ingrediente. Toque em <strong>+ Adicionar</strong>.</span></div>`;
    } else {
        wrap.innerHTML = `<div class="ft-ings-list">${_editList.map((ing, idx) => {
            // Fix: n2input() para exibir quantidade com vírgula BR (evita bug do ponto)
            const qtdStr = n2input(ing.quantidade);
            return `
            <div class="ft-ing-row">
                <span class="ft-ing-row-ico">${ico.ingredients}</span>
                <span class="ft-ing-row-body">
                    <span class="ft-ing-row-name">${esc(ing.nome)}</span>
                    <span class="ft-ing-inline-wrap">
                        <input class="ft-ing-inline-qtd ft-input" type="text"
                            value="${esc(qtdStr)}" inputmode="decimal"
                            data-idx="${idx}" aria-label="Quantidade" autocomplete="off">
                        <span class="ft-ing-row-unit">${ing.unidade}</span>
                    </span>
                </span>
                <span class="ft-ing-row-cost" id="_ircost_${idx}">${formatCurrency(ing.custo)}</span>
                <button class="ft-ing-row-rm" data-idx="${idx}" aria-label="Remover">${ico.close}</button>
            </div>`; }).join('')}</div>`;

        // Feat 1: edição inline — aplica máscara + recalcula custo
        wrap.querySelectorAll('.ft-ing-inline-qtd').forEach(inp => {
            applyMaskDecimal(inp);
            inp.addEventListener('input', () => {
                const idx     = parseInt(inp.dataset.idx);
                const novaQtd = parseNum(inp.value);
                if (novaQtd <= 0 || !_editList[idx]) return;
                // Calcula custo unitário a partir do custo anterior (preserva margem)
                const cuPorQtd = _editList[idx].quantidade > 0
                    ? _editList[idx].custo / _editList[idx].quantidade : 0;
                _editList[idx].quantidade = novaQtd;
                _editList[idx].custo      = novaQtd * cuPorQtd;
                const costEl = document.getElementById(`_ircost_${idx}`);
                if (costEl) costEl.textContent = formatCurrency(_editList[idx].custo);
                _updateCustoTotal();
            });
        });

        wrap.querySelectorAll('.ft-ing-row-rm').forEach(b =>
            b.addEventListener('click', () => { _editList.splice(parseInt(b.dataset.idx), 1); _renderEdList(); }));
    }
    _updateCustoTotal();
}

function _updateCustoTotal() {
    const c  = calcCustoReceita(_editList);
    const el = document.getElementById('ft-rec-custo-val');
    const bx = document.getElementById('ft-rec-custo');
    if (el) { el.textContent = formatCurrency(c); el.classList.toggle('has', c > 0); }
    if (bx) bx.classList.toggle('active', c > 0);
}

async function _save(id) {
    const nome    = document.getElementById('ft-rec-nome')?.value.trim();
    const tamanho = document.getElementById('ft-rec-tam')?.value || 'G';
    const ativo   = document.getElementById('ft-rec-ativo')?.checked !== false;

    if (!nome) {
        const el = document.getElementById('ft-rec-nome');
        el?.classList.add('err');
        el?.addEventListener('input', () => el.classList.remove('err'), { once: true });
        toast('Informe o nome da pizza.', 'erro'); return;
    }

    const obj = {
        id: id || generateId(), nome, tamanho, ativo,
        ingredientes: _editList.map(i => ({ ...i })),
        custo_total:  calcCustoReceita(_editList),
        favorito: id ? (getReceitaById(id)?.favorito || false) : false,
        criadoEm: Date.now(),
    };

    const btn = document.getElementById('_rSave');
    if (btn) { btn.disabled = true; btn.lastElementChild.textContent = 'Salvando…'; }

    try {
        await salvar(COL, obj.id, obj);
        if (id) { const i = _recs.findIndex(r => r.id === id); if (i >= 0) _recs[i] = obj; else _recs.push(obj); }
        else _recs.push(obj);
        fecharModal('saved');
        toast(id ? 'Receita atualizada!' : 'Receita criada!', 'sucesso');
        renderReceitas(document.getElementById('ft-busca-rec')?.value || '');
        document.dispatchEvent(new CustomEvent('ft:recs-changed'));
    } catch (e) {
        toast('Erro ao salvar.', 'erro');
        if (btn) { btn.disabled = false; btn.lastElementChild.textContent = 'Salvar'; }
        console.error(e);
    }
}

async function _del(id) {
    const r = getReceitaById(id);
    if (!r) return;
    const ok = await confirmar(`Remover <strong>${esc(r.nome)}</strong>?<br>Não pode ser desfeito.`, { labelOK: 'Remover' });
    if (!ok) return;
    await remover(COL, id);
    _recs = _recs.filter(r => r.id !== id);
    toast('Receita removida.', 'info');
    renderReceitas(document.getElementById('ft-busca-rec')?.value || '');
    document.dispatchEvent(new CustomEvent('ft:recs-changed'));
}

// fim de ft-receitas.js
