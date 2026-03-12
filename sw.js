// sw.js — StockFlow Pro Service Worker v9.8.1
// ══════════════════════════════════════════════════════════════════
// CORREÇÕES APLICADAS (histórico)
// ══════════════════════════════════════════════════════════════════
// BUG #1 — fetch handler sem tratamento de erro de rede
// BUG #2 — Respostas opacas (cross-origin) eram cacheadas
// BUG #3 — install: sem tratamento de falha parcial de cache
// BUG #4 — VERSION inconsistente com o comentário do cabeçalho
//   PROBLEMA : VERSION = '9.7.5' mas o cabeçalho dizia v9.7.6.
//              CACHE_NAME gerado como 'stockflow-v9-7-5' → usuários
//              com SW antigo não recebiam assets atualizados.
//   CORREÇÃO : VERSION alinhada para '9.7.6'.
// BUG #5 — ft-preparo.js ausente da lista de ASSETS
//   PROBLEMA : Novo módulo Preparo Antecipado não era cacheado →
//              funcionalidade offline indisponível.
//   CORREÇÃO : './ft-preparo.js' adicionado à lista ASSETS.
// BUG #6 — Assets v9.8.x ausentes da lista de ASSETS
//   PROBLEMA : bg-upload.js, bg-upload.css e patch-v980.css não
//              eram cacheados → funcionalidades offline quebradas.
//   CORREÇÃO : Três arquivos adicionados à lista ASSETS.
// BUG #7 — Firebase interceptado pelo fallback de rede offline
//   PROBLEMA : .catch() devolvia index.html para qualquer falha,
//              incluindo requisições Firebase cross-origin. O
//              storage.js recebia HTML ao invés de um erro de rede
//              e não conseguia acionar o fallback via IndexedDB.
//   CORREÇÃO : Requisições Firebase são detectadas e deixadas
//              propagar silenciosamente; storage.js assume controle.
// BUG #8 — auth/internal-error no login Google (signInWithPopup)
//   PROBLEMA : O fluxo OAuth usa securetoken.googleapis.com,
//              accounts.google.com, oauth2.googleapis.com e
//              firebaseapp.com para trocar o código pelo token.
//              O SW interceptava essas requisições GET, não as
//              encontrava no cache e devolvia index.html como
//              fallback. O SDK recebia HTML em vez de JSON e
//              lançava auth/internal-error.
//   CORREÇÃO : Todos os domínios do fluxo OAuth/Auth são
//              adicionados ao bypass — o SW deixa o browser
//              lidar diretamente com essas requisições.
// ══════════════════════════════════════════════════════════════════

// BUG FIX #4: VERSION alinhada com o cabeçalho do arquivo (era '9.7.5').
// v9.8.2: bypass gstatic.com para SDK Firebase não bloquear modo offline.
// v10.1.0: gemini.js e gemini.css adicionados ao cache.
// v10.3.1: BUG #8 — bypass completo do fluxo OAuth Google (auth/internal-error).
const VERSION    = '10.3.1';
const CACHE_NAME = 'stockflow-v' + VERSION.replace(/\./g, '-');

const ASSETS = [
    './',
    './index.html',
    './style.css',
    './massa-extra.css',
    './apple-overrides.css',
    './patch-v976.css',
    // BUG FIX #6: assets v9.8.x adicionados — background e patch offline.
    './patch-v980.css',
    './bg-upload.js',
    './bg-upload.css',
    './apple-premium-v10.css',
    './ficha-tecnica.html',
    './manifest.json',
    './icone.png',
    './fundo-pizza.jpg',
    './CHANGELOG.md',
    // FIX v10.0.0: version.js (novo módulo centralizado de versão) adicionado.
    './version.js',
    // FIX v10.0.0: DESIGN-GUIDE-v10.md disponível offline para consulta da equipe.
    './DESIGN-GUIDE-v10.md',
    './main.js',
    './store.js',
    './firebase.js',
    './storage.js',
    './listafacil.js',
    './navegacao.js',
    './ui.js',
    './tabela.js',
    './eventos.js',
    './compras.js',
    './categorias.js',
    './calculadora.js',
    './teclado.js',
    './parser.js',
    './alerta.js',
    './swipe.js',
    './toast.js',
    './confirm.js',
    './utils.js',
    './dropdown.js',
    './produtos.js',
    './calendario.js',
    './massa.js',
    './producao.js',
    './idb.js',
    // ── Ficha Técnica ─────────────────────────────────────────────
    './ft-app.js',
    './ft-icons.js',
    './ft-ingredientes.js',
    './ft-receitas.js',
    './ft-custos.js',
    './ft-dashboard.js',
    './ft-exportacao.js',
    './ft-storage.js',
    './ft-firebase.js',
    './ft-calc.js',
    './ft-format.js',
    './ft-ui.js',
    './ft-style.css',
    // BUG FIX #5: ft-preparo.js adicionado — Preparo Antecipado agora funciona offline.
    './ft-preparo.js',
    // v10.3.0: IA module (Groq)
    './ia.js',
    './ia.css',
];

// BUG FIX #3: install tolerante a falhas parciais.
self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(async cache => {
            const results = await Promise.allSettled(
                ASSETS.map(url =>
                    fetch(url).then(res => {
                        if (!res.ok) throw new Error(`HTTP ${res.status} para ${url}`);
                        return cache.put(url, res);
                    })
                )
            );
            const falhos = results.filter(r => r.status === 'rejected');
            if (falhos.length) {
                console.warn(`[SW] ${falhos.length} asset(s) não cacheados:`,
                    falhos.map(f => f.reason?.message || f.reason));
            }
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;

    // ── Bypass: todas as requisições externas do fluxo Firebase/OAuth ──
    // Qualquer domínio fora da origem do app deve ser tratado pelo browser
    // diretamente. O SW não tem como cachear respostas autenticadas, e
    // devolver index.html como fallback quebra o parsing JSON do SDK.
    //
    // Domínios cobertos:
    //  • firebaseio.com / firestore.googleapis.com  → Firestore CRUD
    //  • firebase.googleapis.com                    → Firebase REST
    //  • identitytoolkit.googleapis.com             → Auth REST API
    //  • securetoken.googleapis.com                 → Troca código OAuth → token
    //  • oauth2.googleapis.com                      → Renovação de tokens
    //  • accounts.google.com                        → Popup Google Sign-In
    //  • firebaseapp.com                            → Handler OAuth de retorno
    //  • gstatic.com/firebasejs                     → SDK compat via CDN
    //  • api.groq.com                               → API Groq IA
    const isExternal = !url.startsWith(self.location.origin);
    if (isExternal) return;

    e.respondWith(
        caches.match(e.request).then(cached => {
            // Cache hit → retorna imediatamente.
            if (cached) return cached;

            // BUG FIX #1 & #2: fetch com fallback robusto.
            return fetch(e.request)
                .then(response => {
                    // BUG FIX #2: só cacheia respostas same-origin bem-sucedidas.
                    if (response && response.status === 200 && response.type === 'basic') {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
                    }
                    return response;
                })
                .catch(() => {
                    // BUG FIX #1: rede falhou e não há cache → fallback para index.html
                    return caches.match('./index.html').then(fallback =>
                        fallback || new Response('Sem conexão e sem cache disponível.', {
                            status: 503,
                            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                        })
                    );
                });
        })
    );
});
