// ft-storage.js — Ficha Técnica v1.2
// v1.2: usa firebase.js unificado; preparos adicionado à sincronização.
import { fbSave, fbLoad, fbDelete, fbIsAvailable } from './firebase.js';

const LS_PREFIX = 'ft_';

function lsKey(col)        { return LS_PREFIX + col; }
function lsGetAll(col)     { try { return JSON.parse(localStorage.getItem(lsKey(col)) || '{}'); } catch { return {}; } }
function lsSetAll(col, d)  { try { localStorage.setItem(lsKey(col), JSON.stringify(d)); } catch(e) { console.warn('[ft-storage] LS cheio:', e); } }

export async function salvar(colecao, id, dados) {
    const item = { ...dados, id };
    const local = lsGetAll(colecao);
    local[id] = item;
    lsSetAll(colecao, local);
    if (fbIsAvailable()) {
        try { await fbSave(colecao, id, item); }
        catch(e) { console.warn(`[ft-storage] fbSave falhou (${colecao}/${id}):`, e); }
    }
}

export async function carregar(colecao) {
    if (fbIsAvailable()) {
        try {
            const fbDados = await fbLoad(colecao);
            const mapa = {};
            fbDados.forEach(d => { mapa[d.id] = d; });
            lsSetAll(colecao, mapa);
            return fbDados;
        } catch(e) {
            console.warn(`[ft-storage] fbLoad falhou (${colecao}), usando LS:`, e);
        }
    }
    return Object.values(lsGetAll(colecao));
}

export async function remover(colecao, id) {
    const local = lsGetAll(colecao);
    delete local[id];
    lsSetAll(colecao, local);
    if (fbIsAvailable()) {
        try { await fbDelete(colecao, id); }
        catch(e) { console.warn(`[ft-storage] fbDelete falhou (${colecao}/${id}):`, e); }
    }
}

export async function salvarConfig(dados) {
    try { localStorage.setItem(LS_PREFIX + 'config', JSON.stringify(dados)); } catch {}
    if (fbIsAvailable()) {
        try { await fbSave('configuracoes', 'default', dados); } catch {}
    }
}

export async function carregarConfig() {
    if (fbIsAvailable()) {
        try {
            const lista = await fbLoad('configuracoes');
            const cfg = lista.find(d => d.id === 'default');
            if (cfg) return cfg;
        } catch {}
    }
    try { return JSON.parse(localStorage.getItem(LS_PREFIX + 'config') || 'null'); }
    catch { return null; }
}

/** Push local → Firebase (após login ou sync manual). Inclui preparos. */
export async function sincronizarLocalParaFirebase() {
    if (!fbIsAvailable()) return;
    for (const col of ['ingredientes', 'receitas', 'preparos']) {
        const local = lsGetAll(col);
        for (const [id, item] of Object.entries(local)) {
            try { await fbSave(col, id, item); }
            catch(e) { console.warn('[ft-storage] sync falhou:', e); }
        }
    }
}
