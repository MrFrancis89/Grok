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
// ══════════════════════════════════════════════════════════════════

// BUG FIX #4: VERSION alinhada com o cabeçalho do arquivo (era '9.7.5').
// v9.8.2: bypass gstatic.com para SDK Firebase não bloquear modo offline.
// v10.1.0: gemini.js e gemini.css adicionados ao cache.
const VERSION    = '10.3.0';
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

    // BUG FIX #7: Requisições Firebase (cross-origin) não devem ser interceptadas.
    // Se falhar por falta de rede, o erro propaga para storage.js acionar o
    // fallback via IndexedDB. Devolver index.html aqui quebraria esse fluxo.
    const url = e.request.url;
    // BUG FIX #7 (ampliado): inclui gstatic.com onde o SDK compat é servido.
    // Sem este bypass, o SW intercepta os <script> do Firebase em ficha-tecnica.html,
    // não os encontra no cache, devolve index.html como fallback e o browser
    // falha ao executar HTML como JS (erro de MIME), deixando a tela branca.
    const isFirebase = url.includes('firebaseio.com') ||
                       url.includes('firestore.googleapis.com') ||
                       url.includes('firebase.googleapis.com') ||
                       url.includes('identitytoolkit.googleapis.com') ||
                       url.includes('gstatic.com/firebasejs');
    if (isFirebase) return;

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
