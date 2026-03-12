// bg-upload.js — StockFlow Pro v10.0.1
// ══════════════════════════════════════════════════════════════════
// Módulo de personalização de background.
//
// Por que IDB e não localStorage?
//   Uma imagem em Base64 ocupa 1–3 MB. O localStorage compartilha
//   ~5 MB com estoque, lista fácil e histórico de preços. Salvar
//   a imagem lá causaria QuotaExceededError e derrubaria
//   salvarDados() silenciosamente.
//
// Fluxo:
//   1. Usuário seleciona imagem → createObjectURL → aplica no body
//      imediatamente (zero latência, sem bloquear a UI).
//   2. Em paralelo: FileReader converte para ArrayBuffer → salva
//      no IDB como blob binário (sem overhead de Base64).
//   3. No boot (initBgUpload): lê o ArrayBuffer do IDB →
//      reconstrói o Blob → createObjectURL → aplica no body.
//   4. ObjectURL anterior é revogado antes de criar um novo
//      para evitar memory leak.
//
// API pública:
//   initBgUpload()   → chame uma vez em main.js no boot
//   removeBg()       → limpa background e apaga do IDB
// ══════════════════════════════════════════════════════════════════

// ── IDB isolado para background ───────────────────────────────────
// Store separada do 'snapshots' para não misturar responsabilidades.
const _BG_DB_NAME    = 'stockflow-bg';
const _BG_STORE_NAME = 'background';
const _BG_DB_VERSION = 1;
const _BG_KEY        = 'current';

let _bgDbPromise  = null;
let _currentObjUrl = null; // referência para revoke posterior

function _openBgDB() {
    if (_bgDbPromise) return _bgDbPromise;
    _bgDbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(_BG_DB_NAME, _BG_DB_VERSION);
        req.onupgradeneeded = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(_BG_STORE_NAME)) {
                db.createObjectStore(_BG_STORE_NAME);
            }
        };
        req.onsuccess = e => resolve(e.target.result);
        req.onerror   = e => {
            console.error('[bg-upload] Falha ao abrir IDB:', e.target.error);
            reject(e.target.error);
        };
    });
    return _bgDbPromise;
}

function _bgTx(mode) {
    return _openBgDB().then(db => {
        const tx    = db.transaction(_BG_STORE_NAME, mode);
        const store = tx.objectStore(_BG_STORE_NAME);
        return { tx, store };
    });
}

function _idbReq(req) {
    return new Promise((res, rej) => {
        req.onsuccess = e => res(e.target.result);
        req.onerror   = e => rej(e.target.error);
    });
}

async function _bgSave(blob) {
    const buf = await blob.arrayBuffer();
    const { store } = await _bgTx('readwrite');
    return _idbReq(store.put({ buf, type: blob.type }, _BG_KEY));
}

async function _bgLoad() {
    try {
        const { store } = await _bgTx('readonly');
        return await _idbReq(store.get(_BG_KEY)); // { buf, type } | undefined
    } catch {
        return null;
    }
}

async function _bgDelete() {
    const { store } = await _bgTx('readwrite');
    return _idbReq(store.delete(_BG_KEY));
}

// ── Aplicação no DOM ──────────────────────────────────────────────
function _ensureOverlay() {
    // Overlay de escurecimento como div real (não ::before) para não
    // criar stacking context implícito que quebra calendário e modais.
    if (document.getElementById('bg-overlay')) return;
    const ov = document.createElement('div');
    ov.id = 'bg-overlay';
    document.body.insertBefore(ov, document.body.firstChild);
}

function _applyBg(objectUrl) {
    if (_currentObjUrl) {
        URL.revokeObjectURL(_currentObjUrl); // evita memory leak
    }
    _currentObjUrl = objectUrl;
    _ensureOverlay();

    // FIX v10.0.1: aplica no #bg-fixed em vez do body.style.backgroundImage.
    //
    // Causa raiz do zoom/rolagem em mobile:
    //   body.style.backgroundImage + background-attachment:fixed é ignorado
    //   ou implementado incorretamente em TODOS os browsers móbile (Safari iOS,
    //   Chrome Android, Firefox Android). O body pode ter altura > viewport,
    //   fazendo a imagem ser recalculada a cada frame de scroll → zoom visível.
    //
    // Solução: #bg-fixed já é position:fixed + translateZ(0) + will-change:transform,
    //   criando um layer GPU fixo que não se move nem reescala ao rolar.
    //   É exatamente o mesmo mecanismo que fixa o fundo-pizza.jpg padrão.
    const bgDiv = document.getElementById('bg-fixed');
    if (bgDiv) {
        bgDiv.style.backgroundImage = `url("${objectUrl}")`;
    }
    document.body.classList.add('has-custom-bg');
}

function _clearBg() {
    if (_currentObjUrl) {
        URL.revokeObjectURL(_currentObjUrl);
        _currentObjUrl = null;
    }

    // FIX v10.0.1: restaura backgroundImage original no #bg-fixed
    // em vez de limpar body.style (que agora não é mais usado).
    const bgDiv = document.getElementById('bg-fixed');
    if (bgDiv) {
        bgDiv.style.backgroundImage = '';  // volta ao valor definido no CSS (fundo-pizza.jpg)
    }
    document.body.classList.remove('has-custom-bg');
    const ov = document.getElementById('bg-overlay');
    if (ov) ov.remove();
}

// ── Handler de seleção de arquivo ─────────────────────────────────
async function _onFileSelected(file) {
    if (!file || !file.type.startsWith('image/')) return;

    // Aplica preview imediatamente via ObjectURL (sem esperar IDB).
    const previewUrl = URL.createObjectURL(file);
    _applyBg(previewUrl);

    // Persiste no IDB em background.
    try {
        await _bgSave(file);
    } catch (e) {
        console.error('[bg-upload] Falha ao salvar imagem no IDB:', e);
    }
}

// ── Wiring do botão #btn-fundo (barra utilitária) ────────────────
function _injectUI() {
    const btn   = document.getElementById('btn-fundo');
    const input = document.getElementById('bg-upload');
    if (!btn || !input) return;

    input.addEventListener('change', e => {
        const file = e.target.files?.[0];
        if (file) _onFileSelected(file);
        e.target.value = '';
    });

    btn.addEventListener('click', () => input.click());

    // Oculta o botão na aba Ficha Técnica
    document.addEventListener('tabChanged', e => {
        btn.style.display = e.detail?.tab === 'fichatecnica' ? 'none' : 'flex';
    });
}

// ── API pública ───────────────────────────────────────────────────

/**
 * Inicializa o módulo: injeta o botão no DOM e restaura o
 * background salvo (se existir). Chame uma vez em main.js no boot.
 */
export async function initBgUpload() {
    _injectUI();

    try {
        const stored = await _bgLoad();
        if (!stored?.buf) return;

        const blob      = new Blob([stored.buf], { type: stored.type || 'image/jpeg' });
        const objectUrl = URL.createObjectURL(blob);
        _applyBg(objectUrl);
    } catch (e) {
        console.warn('[bg-upload] Falha ao restaurar background:', e);
    }
}

/**
 * Remove o background atual e apaga do IDB.
 * Pode ser chamado externamente (ex: botão de reset de tema).
 */
export async function removeBg() {
    _clearBg();
    try {
        await _bgDelete();
    } catch (e) {
        console.warn('[bg-upload] Falha ao apagar background do IDB:', e);
    }
}
