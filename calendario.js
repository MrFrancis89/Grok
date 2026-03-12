// calendario.js — StockFlow Pro v9.7.4
// ══════════════════════════════════════════════════════════════════
// NOVIDADES v9.7.1 — Exportação e Importação de Backup Externo
// ══════════════════════════════════════════════════════════════════
// PROBLEMA:
//   Se o usuário limpar "Dados de Sites" nas configurações do
//   iOS/Android, todo o IndexedDB (60 dias de backups) e o
//   localStorage (estado atual) são apagados permanentemente.
//
// SOLUÇÃO — dois botões novos na seção inferior do popup:
//
//   [↓ Exportar .json]
//     • Lê todos os snapshots do IDB via exportarTodosSnapshots().
//     • Tenta Web Share API com files (iOS 15+ / Android Chrome 75+)
//       para enviar ao WhatsApp, Drive, Notes, etc.
//     • Fallback: dispara download via <a download>.
//
//   [↑ Importar .json]
//     • Input <file> oculto, aceita apenas .json.
//     • Lê via FileReader, valida schema e chama importarSnapshots().
//     • Mescla sem sobrescrever dados mais recentes (compara por `ts`).
//     • Também mescla o histórico de preços da Lista Fácil.
//     • Exibe toast resumo: "X importados, Y já existiam."
//
// Mudanças em relação ao v9.8.0:
//   • Novos imports: exportarTodosSnapshots, importarSnapshots, mesclarHistorico.
//   • renderCalendario() injeta <div class="cal-backup-section"> no popup.
//   • Funções privadas: _exportarBackup(), _abrirSeletorArquivo(), _lerArquivoComoTexto().
// ══════════════════════════════════════════════════════════════════

import { darFeedback } from './utils.js';
import { mostrarToast } from './toast.js';
import { mostrarConfirmacao } from './confirm.js';
import { idbFmtDate } from './idb.js';
import {
    STORAGE_KEYS,
    carregarSnapshot,
    listarDatasComSnapshot,
    salvarSnapshot,
    exportarTodosSnapshots,
    importarSnapshots,
    mesclarHistorico,
    carregarDados,
    carregarOcultos,
    carregarMeus,
    carregarItensLF,
    carregarOrcamentoLF,
    carregarHistoricoCompleto,
} from './storage.js';

let popupEl           = null;
let mesAtual          = new Date();
let callbackRestaurar = null;

// ── Chip visual de backup automático ─────────────────────────────
function mostrarChipBackup() {
    const prev = document.getElementById('autosave-chip');
    if (prev) prev.remove();

    const chip = document.createElement('div');
    chip.id = 'autosave-chip';
    chip.setAttribute('aria-live', 'polite');
    chip.setAttribute('role', 'status');
    chip.innerHTML =
        '<span class="chip-icon">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>' +
        '<polyline points="17,21 17,13 7,13 7,21"/>' +
        '<polyline points="7,3 7,8 15,8"/>' +
        '</svg></span>' +
        '<span class="chip-text">Backup salvo</span>';
    document.body.appendChild(chip);

    chip.getBoundingClientRect(); // força reflow para animação de entrada
    chip.classList.add('chip-visible');

    setTimeout(() => {
        chip.classList.remove('chip-visible');
        chip.addEventListener('transitionend', () => chip.remove(), { once: true });
        setTimeout(() => { if (chip.parentNode) chip.remove(); }, 500);
    }, 2800);
}

// ── Debounce para auto-snapshot ───────────────────────────────────
let _snapTimer = null;
export function agendarSnapshot() {
    if (_snapTimer) clearTimeout(_snapTimer);
    _snapTimer = setTimeout(async () => {
        try {
            // BUG FIX v9.7.4: usa funções de storage.js em vez de
            // JSON.parse(localStorage.getItem(...)) direto.
            // Aproveita os fallbacks e o try/catch já presentes em _getItem(),
            // evitando exceção silenciosa se alguma chave estiver corrompida.
            const payload = {
                estoque:     carregarDados()             || [],
                ocultos:     carregarOcultos()           || [],
                meus:        carregarMeus()              || [],
                lfItens:     carregarItensLF()           || [],
                lfOrcamento: carregarOrcamentoLF()       || 3200,
                lfHistorico: carregarHistoricoCompleto() || {},
            };
            await salvarSnapshot(payload);
            mostrarChipBackup();
        } catch (e) {
            console.warn('[Snapshot] Erro ao salvar backup:', e);
        }
    }, 2500);
}

// ── Inicialização ─────────────────────────────────────────────────
export function iniciarCalendario(onRestore) {
    callbackRestaurar = onRestore;

    const btn = document.getElementById('btn-calendario');
    if (!btn) return;

    btn.addEventListener('click', e => {
        e.stopPropagation();
        darFeedback();
        if (popupEl && popupEl.style.display !== 'none') {
            fecharCalendario();
        } else {
            mesAtual = new Date();
            abrirCalendario(btn);
        }
    });

    document.addEventListener('click', e => {
        if (
            popupEl &&
            popupEl.style.display !== 'none' &&
            !popupEl.contains(e.target) &&
            !e.target.closest('#btn-calendario')
        ) {
            fecharCalendario();
        }
    }, true);
}

// ── Abrir / fechar ────────────────────────────────────────────────
function abrirCalendario(anchor) {
    if (!popupEl) {
        popupEl = document.createElement('div');
        popupEl.id = 'calendario-popup';
        popupEl.className = 'calendario-popup';
        document.body.appendChild(popupEl);
    }

    popupEl.innerHTML = '<p class="cal-hint" style="text-align:center;padding:20px;">⏳ Carregando...</p>';
    popupEl.style.display = 'block';
    _posicionarPopup(anchor);
    renderCalendario();
}

export function fecharCalendario() {
    if (popupEl) popupEl.style.display = 'none';
}

function _posicionarPopup(anchor) {
    const rect = anchor.getBoundingClientRect();
    // BUG FIX: popup width aumentado de 272 para 290px para acomodar a seção
    // de backup sem overflow. Ajuste de posição mantém popup dentro da viewport.
    const popW = 290;
    let left = rect.left;
    if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
    if (left < 8) left = 8;
    popupEl.style.width = popW + 'px';
    popupEl.style.top  = (rect.bottom + 8 + window.scrollY) + 'px';
    popupEl.style.left = left + 'px';
}

// ── Render do grid mensal (async) ─────────────────────────────────
async function renderCalendario() {
    const datas   = await listarDatasComSnapshot();
    const ano     = mesAtual.getFullYear();
    const mes     = mesAtual.getMonth();
    const hojeStr = idbFmtDate(new Date());
    const primDia = new Date(ano, mes, 1).getDay();
    const ndias   = new Date(ano, mes + 1, 0).getDate();

    const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                   'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const SEMS  = ['D','S','T','Q','Q','S','S'];

    let html = `
      <div class="cal-header">
        <button class="cal-nav" id="cal-prev" aria-label="Mês anterior">&#8249;</button>
        <span class="cal-title">${MESES[mes]} ${ano}</span>
        <button class="cal-nav" id="cal-next" aria-label="Próximo mês">&#8250;</button>
      </div>
      <div class="cal-dow-row">${SEMS.map(s => `<span>${s}</span>`).join('')}</div>
      <div class="cal-grid">`;

    for (let i = 0; i < primDia; i++) html += `<span class="cal-cell cal-empty"></span>`;

    for (let d = 1; d <= ndias; d++) {
        const ds  = idbFmtDate(new Date(ano, mes, d));
        const tem = datas.includes(ds);
        const eh  = ds === hojeStr;
        html += `<span class="cal-cell${eh ? ' cal-hoje' : ''}${tem ? ' cal-tem-dado' : ''}" data-d="${ds}">${d}${tem ? '<i></i>' : ''}</span>`;
    }

    html += `</div>`;
    html += datas.length === 0
        ? `<p class="cal-hint">Os dados serão salvos automaticamente ao editar.</p>`
        : `<p class="cal-hint">${datas.length} dia(s) com backup</p>`;

    // ── Seção de proteção de backup externo ──────────────────────
    html += `
      <div class="cal-backup-section">
        <p class="cal-backup-label">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          🛡️ Proteção de backup
        </p>
        <div class="cal-backup-btns">
          <button class="cal-backup-btn cal-backup-btn--export" id="cal-btn-export" aria-label="Exportar backup completo em JSON">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Exportar .json
          </button>
          <button class="cal-backup-btn cal-backup-btn--import" id="cal-btn-import" aria-label="Importar backup de arquivo JSON">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Importar .json
          </button>
        </div>
        <p class="cal-backup-hint">Salve no WhatsApp, Drive ou Notes para recuperar mesmo após limpar dados do app.</p>
      </div>`;

    if (!popupEl || popupEl.style.display === 'none') return;
    popupEl.innerHTML = html;

    // ── Navegação entre meses ─────────────────────────────────────
    popupEl.querySelector('#cal-prev').addEventListener('click', e => {
        e.stopPropagation();
        darFeedback();
        mesAtual = new Date(ano, mes - 1, 1);
        renderCalendario();
    });
    popupEl.querySelector('#cal-next').addEventListener('click', e => {
        e.stopPropagation();
        darFeedback();
        mesAtual = new Date(ano, mes + 1, 1);
        renderCalendario();
    });

    // ── Clique em dia com backup ──────────────────────────────────
    popupEl.querySelectorAll('.cal-tem-dado').forEach(el => {
        el.addEventListener('click', async e => {
            e.stopPropagation();
            const data = el.dataset.d;
            darFeedback();

            const snap = await carregarSnapshot(data);
            if (!snap) return;

            fecharCalendario();

            const nEst  = Array.isArray(snap.estoque) ? snap.estoque.length : 0;
            const nLF   = Array.isArray(snap.lfItens)  ? snap.lfItens.length  : 0;
            const nComp = Array.isArray(snap.estoque)  ? snap.estoque.filter(i => i.c).length : 0;

            mostrarConfirmacao(
                `Restaurar backup de ${data}?\n\n` +
                `${nEst} itens no estoque\n` +
                `${nComp} na lista de compras\n` +
                `${nLF} na Lista Fácil`,
                () => {
                    if (callbackRestaurar) callbackRestaurar(snap, data);
                }
            );
        });
    });

    // ── Botão Exportar ────────────────────────────────────────────
    popupEl.querySelector('#cal-btn-export').addEventListener('click', async e => {
        e.stopPropagation();
        darFeedback();
        await _exportarBackup();
    });

    // ── Botão Importar ────────────────────────────────────────────
    popupEl.querySelector('#cal-btn-import').addEventListener('click', e => {
        e.stopPropagation();
        darFeedback();
        _abrirSeletorArquivo();
    });
}

// ── Exportação ────────────────────────────────────────────────────
async function _exportarBackup() {
    let backupObj;
    try {
        backupObj = await exportarTodosSnapshots();
    } catch (err) {
        console.error('[Calendário] Falha ao exportar:', err);
        mostrarToast('Erro ao gerar backup. Tente novamente.');
        return;
    }

    const totalDias = Object.keys(backupObj.snapshots).length;
    if (totalDias === 0) {
        mostrarToast('Nenhum backup salvo para exportar ainda.');
        return;
    }

    const json     = JSON.stringify(backupObj, null, 2);
    const blob     = new Blob([json], { type: 'application/json' });
    const dataHoje = idbFmtDate(new Date()).replace(/\//g, '-');
    const nomeArq  = `stockflow-backup-${dataHoje}.json`;

    // Tenta Web Share API com files (iOS 15+ / Android Chrome 75+).
    const fileParaShare = new File([blob], nomeArq, { type: 'application/json' });
    const podeShare     = typeof navigator.canShare === 'function' &&
                          navigator.canShare({ files: [fileParaShare] });

    if (podeShare) {
        try {
            await navigator.share({
                title: 'StockFlow Pro — Backup',
                text:  `Backup com ${totalDias} dia(s) — ${dataHoje}`,
                files: [fileParaShare],
            });
            mostrarToast(`${totalDias} dia(s) exportado(s) com sucesso!`);
            return;
        } catch (err) {
            // Usuário cancelou ou houve erro — cai para download silenciosamente.
            if (err.name !== 'AbortError') {
                console.warn('[Calendário] Web Share falhou, usando download:', err);
            } else {
                // Cancelamento explícito pelo usuário: não baixa automaticamente.
                return;
            }
        }
    }

    // Fallback: download direto via <a download>.
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href          = url;
    a.download      = nomeArq;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    mostrarToast(`Backup de ${totalDias} dia(s) baixado!`);
}

// ── Importação ────────────────────────────────────────────────────
function _abrirSeletorArquivo() {
    // Remove input antigo (se existir) para evitar listeners duplicados.
    const old = document.getElementById('cal-file-input');
    if (old) old.remove();

    const input    = document.createElement('input');
    input.id       = 'cal-file-input';
    input.type     = 'file';
    input.accept   = '.json,application/json';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.addEventListener('change', async () => {
        const file = input.files?.[0];
        input.remove();
        if (!file) return;

        const texto = await _lerArquivoComoTexto(file).catch(() => null);
        if (!texto) {
            mostrarToast('Não foi possível ler o arquivo.');
            return;
        }

        let backupObj;
        try {
            backupObj = JSON.parse(texto);
        } catch {
            mostrarToast('Arquivo inválido — não é um JSON válido.');
            return;
        }

        // Validação mínima de schema.
        if (!backupObj?.snapshots || typeof backupObj.snapshots !== 'object') {
            mostrarToast('Arquivo inválido — formato de backup não reconhecido.');
            return;
        }

        const totalNoArquivo = Object.keys(backupObj.snapshots).length;

        mostrarConfirmacao(
            `Importar backup?\n\n` +
            `${totalNoArquivo} dia(s) encontrado(s) no arquivo.\n` +
            `Dias já existentes são preservados se forem mais recentes.`,
            async () => {
                try {
                    const { importados, ignorados } = await importarSnapshots(backupObj);

                    // Mescla histórico de preços da Lista Fácil do snapshot mais recente.
                    const snaps = Object.values(backupObj.snapshots)
                        .filter(s => s?.lfHistorico && typeof s.lfHistorico === 'object');
                    if (snaps.length > 0) {
                        const histRecente = snaps.sort((a, b) => (b.ts || 0) - (a.ts || 0))[0].lfHistorico;
                        mesclarHistorico(histRecente);
                    }

                    mostrarToast(`✅ ${importados} dia(s) importado(s), ${ignorados} já existiam.`);
                    // Atualiza o popup para refletir os novos dias no calendário.
                    renderCalendario();
                } catch (err) {
                    console.error('[Calendário] Falha na importação:', err);
                    mostrarToast('Erro ao importar: ' + (err.message || 'desconhecido'));
                }
            }
        );
    });

    input.click();
}

function _lerArquivoComoTexto(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = e => resolve(e.target.result);
        reader.onerror = () => reject(new Error('FileReader falhou'));
        reader.readAsText(file, 'utf-8');
    });
}

// fim de calendario.js