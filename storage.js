// storage.js — StockFlow Pro v10.0.0
// Firebase integrado: estoque, ocultos, meus, listafacil e histórico de preços.
// Snapshots (60 dias) permanecem no IndexedDB — documentos muito grandes para Firestore.
// Preferências de UI (tema, posição da lupa, etc.) permanecem só no localStorage.
// ─────────────────────────────────────────────────────────────────────────────
// Estratégia de escrita:
//   salvarDados() / salvarOcultos() / salvarMeus() / salvarItensLF() etc. →
//   escrevem no localStorage SINCRONAMENTE (zero latência para a UI) e
//   enfileiram uma gravação no Firebase via fire-and-forget debounced (2 s).
//   Isso preserva 100% da compatibilidade com as chamadas síncronas existentes
//   em main.js sem exigir await em cada salvarDados().
// ─────────────────────────────────────────────────────────────────────────────
import { idbGet, idbSetComPurge, idbKeys, idbFmtDate, migrarSnapshotsLegados } from './idb.js';
import { fbIsAvailable, fbSave, fbLoad }                                        from './firebase.js';
import { VERSION }                                                               from './version.js';

export const STORAGE_KEYS = {
    dados:        'estoqueDados_v4_categorias',
    ocultos:      'itensOcultosPadrao_v4',
    meus:         'meusItensPadrao_v4',
    tema:         'temaEstoque',
    lupaPos:      'lupaPosicao_v1',
    dicaSwipe:    'dicaSwipeMostrada',
    ultimaVersao: 'stockflow_ultima_versao',
    lfItens:      'listaFacil_itens_v1',
    lfOrcamento:  'listaFacil_orcamento_v1',
    lfHistorico:  'listaFacil_historico_v1',
};

// ── Wrappers localStorage ─────────────────────────────────────────
function _setItem(key, value) {
    try { localStorage.setItem(key, value); return true; }
    catch (e) { console.error(`[storage] Falha ao salvar "${key}":`, e); return false; }
}
function _getItem(key, fallback = null) {
    try {
        const raw = localStorage.getItem(key);
        if (raw === null) return fallback;
        return JSON.parse(raw);
    } catch (e) {
        console.error(`[storage] Dado corrompido em "${key}":`, e);
        return fallback;
    }
}

// ── Debounce Firebase sync de dados principais ────────────────────
// Agrupamos estoque + config em dois documentos:
//   users/{uid}/dados/principal  → { estoque, ocultos, meus }
//   users/{uid}/dados/listafacil → { itens, orcamento, historico }
let _syncPrincipalTimer = null;
let _syncLFTimer        = null;

function _agendarSyncPrincipal() {
    clearTimeout(_syncPrincipalTimer);
    _syncPrincipalTimer = setTimeout(_pushPrincipal, 2000);
}
function _agendarSyncLF() {
    clearTimeout(_syncLFTimer);
    _syncLFTimer = setTimeout(_pushListaFacil, 2000);
}

async function _pushPrincipal() {
    if (!fbIsAvailable()) return;
    try {
        await fbSave('dados', 'principal', {
            estoque: _getItem(STORAGE_KEYS.dados,   []) ?? [],
            ocultos: _getItem(STORAGE_KEYS.ocultos, []) ?? [],
            meus:    _getItem(STORAGE_KEYS.meus,    []) ?? [],
            ts:      Date.now(),
        });
    } catch(e) { console.warn('[storage] fbSave dados/principal falhou:', e); }
}

async function _pushListaFacil() {
    if (!fbIsAvailable()) return;
    try {
        await fbSave('dados', 'listafacil', {
            itens:     _getItem(STORAGE_KEYS.lfItens,     null) ?? [],
            orcamento: _getItem(STORAGE_KEYS.lfOrcamento, null) ?? 3200,
            historico: _getItem(STORAGE_KEYS.lfHistorico, {})  ?? {},
            ts:        Date.now(),
        });
    } catch(e) { console.warn('[storage] fbSave dados/listafacil falhou:', e); }
}

// ── Pull Firebase → localStorage (chamado no boot após login) ─────
export async function fbPullPrincipal() {
    if (!fbIsAvailable()) return;
    try {
        const docs = await fbLoad('dados');
        const principal  = docs.find(d => d.id === 'principal');
        const listafacil = docs.find(d => d.id === 'listafacil');

        if (principal) {
            if (Array.isArray(principal.estoque) && principal.estoque.length > 0)
                _setItem(STORAGE_KEYS.dados,   JSON.stringify(principal.estoque));
            if (Array.isArray(principal.ocultos))
                _setItem(STORAGE_KEYS.ocultos, JSON.stringify(principal.ocultos));
            if (Array.isArray(principal.meus))
                _setItem(STORAGE_KEYS.meus,    JSON.stringify(principal.meus));
        }
        if (listafacil) {
            if (Array.isArray(listafacil.itens))
                _setItem(STORAGE_KEYS.lfItens,     JSON.stringify(listafacil.itens));
            if (typeof listafacil.orcamento === 'number')
                _setItem(STORAGE_KEYS.lfOrcamento, String(listafacil.orcamento));
            if (listafacil.historico && typeof listafacil.historico === 'object')
                _setItem(STORAGE_KEYS.lfHistorico, JSON.stringify(listafacil.historico));
        }
        console.info('[storage] Pull Firebase concluído.');
    } catch(e) {
        console.warn('[storage] fbPull falhou, usando localStorage:', e);
    }
}

/** Push imediato de todos os dados locais para o Firebase (pós-login / importação). */
export async function fbPushTudo() {
    await _pushPrincipal();
    await _pushListaFacil();
}

// ── Estoque ───────────────────────────────────────────────────────
export function salvarDados(d) {
    _setItem(STORAGE_KEYS.dados, JSON.stringify(d));
    _agendarSyncPrincipal();
}
export function carregarDados() { return _getItem(STORAGE_KEYS.dados, null); }

// ── Configurações de lista ────────────────────────────────────────
export function salvarOcultos(o) {
    _setItem(STORAGE_KEYS.ocultos, JSON.stringify(o));
    _agendarSyncPrincipal();
}
export function carregarOcultos() { return _getItem(STORAGE_KEYS.ocultos, []); }
export function salvarMeus(m) {
    _setItem(STORAGE_KEYS.meus, JSON.stringify(m));
    _agendarSyncPrincipal();
}
export function carregarMeus() { return _getItem(STORAGE_KEYS.meus, []); }

// ── UI / Tema (local only — preferências por dispositivo) ─────────
export function salvarTema(modo)       { _setItem(STORAGE_KEYS.tema, modo); }
export function carregarTema()         { return localStorage.getItem(STORAGE_KEYS.tema); }
export function salvarPosicaoLupa(p)   { _setItem(STORAGE_KEYS.lupaPos, JSON.stringify(p)); }
export function carregarPosicaoLupa()  { return _getItem(STORAGE_KEYS.lupaPos, null); }
export function marcarDicaSwipeVista() { _setItem(STORAGE_KEYS.dicaSwipe, 'true'); }
export function dicaSwipeFoiVista()    { return !!localStorage.getItem(STORAGE_KEYS.dicaSwipe); }
export function salvarUltimaVersao(v)  { _setItem(STORAGE_KEYS.ultimaVersao, v); }
export function carregarUltimaVersao() { return localStorage.getItem(STORAGE_KEYS.ultimaVersao); }

// ── Lista Fácil ───────────────────────────────────────────────────
export function salvarItensLF(itens) {
    _setItem(STORAGE_KEYS.lfItens, JSON.stringify(itens));
    _agendarSyncLF();
}
export function carregarItensLF()     { return _getItem(STORAGE_KEYS.lfItens, null); }
export function salvarOrcamentoLF(v) {
    _setItem(STORAGE_KEYS.lfOrcamento, String(v));
    _agendarSyncLF();
}
export function carregarOrcamentoLF() {
    try {
        const v = localStorage.getItem(STORAGE_KEYS.lfOrcamento);
        return v ? (parseFloat(v) || 3200) : 3200;
    } catch { return 3200; }
}

// ── Histórico de preços ───────────────────────────────────────────
const MAX_HIST = 10;

export function registrarPrecoHistorico(nomeItem, preco) {
    if (!nomeItem || preco <= 0) return;
    const h = _getItem(STORAGE_KEYS.lfHistorico, {});
    const k = nomeItem.toLowerCase().trim();
    if (!h[k]) h[k] = [];
    const hoje = idbFmtDate(new Date());
    const last = h[k][h[k].length - 1];
    if (last && last.d === hoje && last.v === preco) return;
    h[k].push({ d: hoje, v: preco });
    if (h[k].length > MAX_HIST) h[k] = h[k].slice(-MAX_HIST);
    _setItem(STORAGE_KEYS.lfHistorico, JSON.stringify(h));
    _agendarSyncLF();
}
export function carregarHistoricoItem(nomeItem) {
    const h = _getItem(STORAGE_KEYS.lfHistorico, {});
    return h[nomeItem.toLowerCase().trim()] || [];
}
export function carregarHistoricoCompleto()  { return _getItem(STORAGE_KEYS.lfHistorico, {}); }
export function limparHistoricoItem(nomeItem) {
    const h = _getItem(STORAGE_KEYS.lfHistorico, {});
    delete h[nomeItem.toLowerCase().trim()];
    _setItem(STORAGE_KEYS.lfHistorico, JSON.stringify(h));
    _agendarSyncLF();
}
export function limparTodoHistorico() {
    _setItem(STORAGE_KEYS.lfHistorico, '{}');
    _agendarSyncLF();
}
export function mesclarHistorico(historicoExterno) {
    if (!historicoExterno || typeof historicoExterno !== 'object') return;
    const local  = _getItem(STORAGE_KEYS.lfHistorico, {});
    const toDate = s => { const [d, m, y] = s.split('/'); return new Date(y, m - 1, d); };
    for (const [k, pontos] of Object.entries(historicoExterno)) {
        if (!Array.isArray(pontos)) continue;
        if (!local[k]) {
            local[k] = pontos.slice(-MAX_HIST);
        } else {
            const datasLocais = new Set(local[k].map(p => p.d));
            for (const p of pontos) {
                if (!datasLocais.has(p.d)) { local[k].push(p); datasLocais.add(p.d); }
            }
            local[k].sort((a, b) => toDate(a.d) - toDate(b.d));
            if (local[k].length > MAX_HIST) local[k] = local[k].slice(-MAX_HIST);
        }
    }
    _setItem(STORAGE_KEYS.lfHistorico, JSON.stringify(local));
    _agendarSyncLF();
}

// ══════════════════════════════════════════════════════════════════
// ── Snapshots (IndexedDB) — ASYNC ────────────────────────────────
// Snapshots ficam no IDB — podem ter centenas de KB por dia (60 dias)
// e ultrapassariam o limite de 1 MB por documento do Firestore.
// ══════════════════════════════════════════════════════════════════

const MAX_SNAPSHOTS = 60;

// FIX v10.0.0: migrarSnapshotsLegados() removida do top-level do módulo.
// Anteriormente era disparada no momento do import — antes do DOMContentLoaded,
// antes do Firebase, antes de qualquer init. Se o IDB falhasse aqui, bloqueava
// silenciosamente toda a cadeia de imports.
// Agora é chamada explicitamente por main.js dentro do DOMContentLoaded,
// após os outros módulos estarem inicializados, dentro de try/catch.
export function initStorage() {
    try {
        migrarSnapshotsLegados('stockflow_snapshots_v1');
    } catch (e) {
        console.warn('[storage] migrarSnapshotsLegados falhou (não crítico):', e);
    }
}

export async function salvarSnapshot(payload) {
    // FIX BUG 1: idbFmtDate() garante "dd/mm/yyyy" zero-padded em todos os
    // browsers, eliminando a divergência com fmt() do calendario.js causada
    // por toLocaleDateString('pt-BR') retornar "1/1/2025" no iOS Safari antigo.
    const hoje = idbFmtDate();

    const entrada = {
        ts:          Date.now(),
        estoque:     Array.isArray(payload.estoque)                              ? payload.estoque     : [],
        ocultos:     Array.isArray(payload.ocultos)                              ? payload.ocultos     : [],
        meus:        Array.isArray(payload.meus)                                 ? payload.meus        : [],
        lfItens:     Array.isArray(payload.lfItens)                              ? payload.lfItens     : [],
        lfOrcamento: typeof payload.lfOrcamento === 'number'                     ? payload.lfOrcamento : 3200,
        lfHistorico: payload.lfHistorico && typeof payload.lfHistorico === 'object'
                     ? payload.lfHistorico : {},
    };

    try {
        // FIX BUG 2 + BUG 3: idbSetComPurge executa write + getAllKeys + deletes
        // dentro de uma única transação readwrite — sem race condition entre
        // transações separadas e sem contenção de Promise.all de N idbDel().
        await idbSetComPurge(hoje, entrada, MAX_SNAPSHOTS);
    } catch (e) {
        console.error('[storage] Falha ao salvar snapshot no IDB:', e);
    }
}

export async function carregarSnapshot(dataStr) {
    try { return (await idbGet(dataStr)) ?? null; }
    catch (e) { console.error('[storage] Falha ao carregar snapshot:', e); return null; }
}

export async function listarDatasComSnapshot() {
    try { return await idbKeys(); }
    catch (e) { console.error('[storage] Falha ao listar snapshots:', e); return []; }
}

export async function exportarTodosSnapshots() {
    const chaves = await idbKeys();
    const snapshots = {};
    await Promise.all(chaves.map(async k => {
        try { const s = await idbGet(k); if (s) snapshots[k] = s; } catch {}
    }));
    return { versao: VERSION, exportadoEm: new Date().toISOString(), snapshots };
}

export async function importarSnapshots(backupObj) {
    if (!backupObj?.snapshots || typeof backupObj.snapshots !== 'object')
        throw new Error('Arquivo de backup inválido ou corrompido.');
    const entradas = Object.entries(backupObj.snapshots);
    let importados = 0, ignorados = 0;
    for (const [data, payload] of entradas) {
        try {
            const existente = await idbGet(data);
            if (!existente || (payload.ts && payload.ts > (existente.ts || 0))) {
                await idbSetComPurge(data, payload, MAX_SNAPSHOTS); importados++;
            } else { ignorados++; }
        } catch { ignorados++; }
    }
    return { importados, ignorados };
}
