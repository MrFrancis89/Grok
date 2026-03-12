// firebase.js — StockFlow Pro v10.0.0
// Módulo Firebase UNIFICADO — usado por main.js (app principal) e ft-app.js (Ficha Técnica)
// Projeto: stockflow-pro-274d7
// ─────────────────────────────────────────────────────────────────────────────
// NOTA DE SEGURANÇA — apiKey e appId visíveis no código-fonte (intencional):
//
//   A apiKey do Firebase Web NÃO é um segredo de servidor. Ela identifica o
//   projeto Firebase para o SDK do cliente, de forma semelhante a um ID de app
//   público. A segurança REAL é garantida pelas Regras do Firestore:
//
//     rules_version = '2';
//     service cloud.firestore {
//       match /databases/{database}/documents {
//         match /users/{userId}/{document=**} {
//           allow read, write: if request.auth != null
//                              && request.auth.uid == userId;
//         }
//       }
//     }
//
//   Com essas regras, apenas o usuário autenticado (auth.uid == userId) pode
//   ler/escrever seus próprios documentos. Um atacante que tiver a apiKey ainda
//   precisaria de autenticação Google válida para acessar qualquer dado.
//
//   Referência oficial: https://firebase.google.com/docs/projects/api-keys
// ─────────────────────────────────────────────────────────────────────────────

const FIREBASE_CONFIG = {
    apiKey:            "AIzaSyCyEkDlF-9zYG6N-QoibYCCeyyNjr7YQ8I",
    authDomain:        "stockflow-pro-274d7.firebaseapp.com",
    projectId:         "stockflow-pro-274d7",
    storageBucket:     "stockflow-pro-274d7.firebasestorage.app",
    messagingSenderId: "1081617701534",
    appId:             "1:1081617701534:web:d2b8a296ddeaacc961f98f"
};

let _db    = null;
let _auth  = null;
let _uid   = null;
let _user  = null;
let _ready = false;
const _readyListeners = [];

// ── Getters de estado ─────────────────────────────────────────────
export function fbIsAvailable() { return _ready && !!_uid; }
export function fbGetUid()      { return _uid; }
export function fbGetUser()     { return _user; }

// ── Inicialização do SDK (não faz login) ──────────────────────────
export async function initFirebase() {
    if (typeof firebase === 'undefined') {
        console.warn('[firebase] SDK não carregado.');
        return false;
    }
    try {
        if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
        _db   = firebase.firestore();
        _auth = firebase.auth();
        return true;
    } catch (e) {
        console.error('[firebase] Erro ao inicializar SDK:', e);
        return false;
    }
}

// ── Auth: verificar sessão existente ─────────────────────────────
export function fbGetCurrentUser() {
    return new Promise(resolve => {
        if (!_auth) { resolve(null); return; }
        const unsub = _auth.onAuthStateChanged(user => {
            unsub();
            if (user) { _uid = user.uid; _user = user; _ready = true; }
            resolve(user || null);
        });
    });
}

// ── Auth: detecção de ambiente ────────────────────────────────────
// Redirect é usado SOMENTE no modo PWA standalone (app instalado na
// tela inicial). Nesse contexto o window.open() é bloqueado pelo SO
// e o popup nunca abre.
//
// Safari browser, Chrome iOS, Android e todos os browsers normais
// usam signInWithPopup — comportamento comprovadamente funcional
// na v1.0 do projeto em todos esses ambientes.
function _deveUsarRedirect() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true;
}

// ── Auth: login Google ────────────────────────────────────────────
export async function fbSignInGoogle() {
    if (!_auth) throw new Error('Firebase não inicializado');
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    if (_deveUsarRedirect()) {
        await _auth.signInWithRedirect(provider);
        return null; // página vai recarregar após o redirect
    }

    // Desktop (Chrome / Firefox): popup funciona normalmente
    const cred = await _auth.signInWithPopup(provider);
    _uid   = cred.user.uid;
    _user  = cred.user;
    _ready = true;
    _readyListeners.forEach(fn => fn(_user));
    console.info(`[firebase] ✓ Login Google (popup). UID: ${_uid}`);
    return cred.user;
}

// ── Auth: capturar resultado do redirect (chamar no boot) ─────────
export async function fbGetRedirectResult() {
    if (!_auth) return null;
    try {
        const cred = await _auth.getRedirectResult();
        if (cred?.user) {
            _uid   = cred.user.uid;
            _user  = cred.user;
            _ready = true;
            _readyListeners.forEach(fn => fn(_user));
            console.info(`[firebase] ✓ Login Google (redirect). UID: ${_uid}`);
            return cred.user;
        }
    } catch (e) {
        console.error('[firebase] getRedirectResult erro:', e);
        throw e;
    }
    return null;
}

// ── Auth: logout ──────────────────────────────────────────────────
export async function fbSignOut() {
    if (!_auth) return;
    await _auth.signOut();
    _uid   = null;
    _user  = null;
    _ready = false;
}

export function onFirebaseReady(cb) { _readyListeners.push(cb); }

// ── CRUD Firestore ────────────────────────────────────────────────
// Estrutura: users/{uid}/{colecao}/{id}

function _colRef(colecao) {
    if (!_db || !_uid) throw new Error('Firebase indisponível');
    return _db.collection('users').doc(_uid).collection(colecao);
}

export async function fbSave(colecao, id, dados) {
    if (!fbIsAvailable()) throw new Error('Firebase indisponível');
    await _colRef(colecao).doc(id).set(dados, { merge: true });
}

export async function fbLoad(colecao) {
    if (!fbIsAvailable()) throw new Error('Firebase indisponível');
    const snap = await _colRef(colecao).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function fbDelete(colecao, id) {
    if (!fbIsAvailable()) throw new Error('Firebase indisponível');
    await _colRef(colecao).doc(id).delete();
}

export function fbWatch(colecao, callback) {
    if (!fbIsAvailable()) return () => {};
    return _colRef(colecao).onSnapshot(snap => {
        callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
}
