// main.js — StockFlow Pro v10.0.0
// Firebase integrado: login Google + sync estoque/LF na nuvem.

import { configurarListenersConfirm, mostrarConfirmacao } from './confirm.js';
import { iniciarNavegacao }     from './navegacao.js';
import { iniciarCalendario, agendarSnapshot, fecharCalendario } from './calendario.js';
import { iniciarMassa }         from './massa.js';
import { iniciarProducao }      from './producao.js';
import { iniciarListaFacil }    from './listafacil.js';
import { initSwipe }            from './swipe.js';
import { atualizarDropdown }    from './dropdown.js';
import { renderizarListaCompleta, inserirLinhaNoDOM, salvarEAtualizar, atualizarStatusSave } from './ui.js';
import { atualizarPainelCompras, gerarTextoCompras } from './compras.js';
import { coletarDadosDaTabela } from './tabela.js';
import { verificarAlertas, abrirModalAlerta, fecharModalAlerta, salvarAlerta } from './alerta.js';
import { abrirCalculadora, fecharCalculadora, calcDigito, calcSalvar, getInputCalculadoraAtual } from './calculadora.js';
import { parseFractionToDecimal, parseAndUpdateQuantity } from './parser.js';
import { alternarCheck, alternarTodos } from './eventos.js';
import { ativarModoTeclado }    from './teclado.js';
import { copiarParaClipboard, darFeedback } from './utils.js';
import { mostrarToast }         from './toast.js';
import {
    carregarDados, salvarDados, carregarOcultos, salvarOcultos,
    carregarMeus, salvarMeus, carregarTema, salvarTema,
    carregarPosicaoLupa, salvarPosicaoLupa, marcarDicaSwipeVista, dicaSwipeFoiVista,
    carregarUltimaVersao, salvarUltimaVersao,
    carregarItensLF, salvarItensLF, carregarOrcamentoLF, salvarOrcamentoLF,
    registrarPrecoHistorico, carregarHistoricoItem, carregarHistoricoCompleto,
    limparHistoricoItem, limparTodoHistorico, mesclarHistorico,
    carregarSnapshot, listarDatasComSnapshot, salvarSnapshot,
    fbPullPrincipal, fbPushTudo,
    STORAGE_KEYS,
    initStorage,
} from './storage.js';
import { initFirebase, fbGetCurrentUser, fbSignInGoogle,
         fbGetRedirectResult, fbSignOut, fbIsAvailable, fbGetUser } from './firebase.js';
import { produtosPadrao }       from './produtos.js';
import { VERSION }              from './version.js';
import appStore                 from './store.js';
import { initBgUpload }         from './bg-upload.js';
import { iniciarGemini }        from './ia.js';

// FIX v10.0.0: VERSAO_ATUAL lida de version.js (fonte única de verdade).
const VERSAO_ATUAL = VERSION;

// ── Debounce alertas ──────────────────────────────────────────────
let _alertaDebounceTimer = null;
function verificarAlertasDebounced() {
    clearTimeout(_alertaDebounceTimer);
    _alertaDebounceTimer = setTimeout(verificarAlertas, 600);
}

// ── Temas ─────────────────────────────────────────────────────────
const TEMAS   = ['escuro', 'midnight', 'arctic', 'forest'];
const TEMA_CSS = { midnight: 'theme-midnight', arctic: 'theme-arctic', forest: 'theme-forest' };

function aplicarTema(tema) {
    const body = document.body, html = document.documentElement;
    ['theme-midnight','theme-arctic','theme-forest','light-mode'].forEach(c => {
        body.classList.remove(c); html.classList.remove(c);
    });
    if (TEMA_CSS[tema]) {
        body.classList.add(TEMA_CSS[tema]);
        if (tema === 'arctic') body.classList.add('light-mode');
    }
    html.className = html.className.replace(/theme-\S+|light-mode/g, '').trim();
    salvarTema(tema);
    appStore.set({ tema });
    const btn = document.getElementById('btn-tema');
    if (btn) {
        const label = btn.querySelector('.btn-theme-label');
        const text  = { escuro:'DARK', midnight:'OLED', arctic:'LIGHT', forest:'🌿' }[tema] || 'DARK';
        if (label) label.textContent = text; else btn.textContent = text;
    }
}
function ciclarTema() {
    darFeedback();
    const atual = appStore.get('tema') || carregarTema() || 'escuro';
    aplicarTema(TEMAS[(TEMAS.indexOf(atual) + 1) % TEMAS.length]);
}

// ── Login screen (app principal) ──────────────────────────────────
function _mostrarLoginApp(erro = '') {
    const ov = document.getElementById('app-login-overlay');
    if (!ov) return;
    ov.querySelector('.app-login-erro').innerHTML = erro;
    ov.style.display = 'flex';
    requestAnimationFrame(() => ov.classList.add('visible'));
}
function _ocultarLoginApp() {
    const ov = document.getElementById('app-login-overlay');
    if (!ov) return;
    ov.classList.remove('visible');
    setTimeout(() => { ov.style.display = 'none'; }, 300);
}

// Avatar no header (barra utilitária)
function _atualizarHeaderUser(user) {
    const btn = document.getElementById('btn-usuario');
    if (!btn) return;
    const foto = user.photoURL;
    const nome = user.displayName || user.email || 'Usuário';
    const avatarHtml = foto
        ? `<img src="${foto}" alt="${nome}" style="width:22px;height:22px;border-radius:50%;border:2px solid var(--accent,#FF9500);object-fit:cover;display:block;flex-shrink:0;">`
        : `<span style="width:22px;height:22px;border-radius:50%;background:var(--accent,#FF9500);color:#000;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${nome.charAt(0).toUpperCase()}</span>`;
    // Sempre reescreve para evitar duplicação em chamadas repetidas
    btn.innerHTML = avatarHtml;
    btn.title = nome;
    btn.style.display = 'flex';
}

// ── Firebase boot ─────────────────────────────────────────────────
async function _initFirebaseApp() {
    const sdkOk = await Promise.race([
        initFirebase(),
        new Promise(r => setTimeout(() => r(false), 3000)),
    ]);
    if (!sdkOk) return false; // sem SDK → modo offline

    // 1. Capturar resultado de redirect OAuth — SEMPRE, sem condição.
    //    O Firebase SDK resolve em <1ms com null se não houver redirect pendente.
    //    NÃO usar flag sessionStorage: signInWithRedirect navega para outro domínio
    //    (accounts.google.com → firebaseapp.com → app), e o iOS/PWA limpa o
    //    sessionStorage nessa travessia. A flag sumia e getRedirectResult() nunca
    //    era chamado, causando o loop de login.
    try {
        const redirectUser = await fbGetRedirectResult();
        if (redirectUser) {
            _atualizarHeaderUser(redirectUser);
            await fbPullPrincipal();
            return true;
        }
    } catch (e) {
        // Sem resultado de redirect ou erro → continua para verificar sessão existente
        console.warn('[main] getRedirectResult:', e.code || e.message);
    }

    // 2. Verificar sessão existente (token já persistido pelo SDK)
    const user = await fbGetCurrentUser();
    if (user) {
        _atualizarHeaderUser(user);
        await fbPullPrincipal();
        return true;
    }

    // 3. Não logado → mostrar tela de login e aguardar clique
    return new Promise(resolve => {
        _mostrarLoginApp();

        function _anexarBotaoLogin() {
            const btn = document.getElementById('app-btn-google');
            if (!btn) return;
            btn.addEventListener('click', async () => {
                btn.disabled = true;
                btn.querySelector('span').textContent = 'Aguarde…';
                try {
                    const u = await fbSignInGoogle();
                    // u === null → PWA standalone disparou redirect → página vai recarregar
                    if (!u) {
                        btn.querySelector('span').textContent = 'Redirecionando…';
                        return;
                    }
                    _ocultarLoginApp();
                    _atualizarHeaderUser(u);
                    await fbPullPrincipal();
                    resolve(true);
                } catch (e) {
                    console.error('[main] fbSignInGoogle erro:', e.code, e.message);
                    let msg;
                    if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') {
                        msg = 'Popup fechado antes de concluir. Tente novamente.';
                    } else if (e.code === 'auth/popup-blocked') {
                        msg = 'Popup bloqueado pelo browser. Permita popups para este site e tente novamente.';
                    } else if (e.code === 'auth/network-request-failed') {
                        msg = 'Sem conexão. Verifique a internet e tente novamente.';
                    } else if (e.code === 'auth/unauthorized-domain') {
                        msg = 'Domínio não autorizado. Adicione mrfrancis89.github.io em Firebase Console → Authentication → Authorized domains.';
                    } else if (e.code === 'auth/operation-not-allowed') {
                        msg = 'Login Google não está ativado no Firebase Console.';
                    } else if (e.code === 'auth/internal-error') {
                        msg = 'Erro interno do Firebase. Verifique se mrfrancis89.github.io está nos Authorized domains do Firebase Console.';
                    } else {
                        msg = `Erro: ${e.code || e.message || 'desconhecido'}. Tente novamente.`;
                    }
                    _mostrarLoginApp(msg);
                    // Re-habilita o botão e re-anexa o listener para nova tentativa
                    btn.disabled = false;
                    btn.querySelector('span').textContent = 'Entrar com Google';
                    _anexarBotaoLogin();
                }
            }, { once: true });
        }

        _anexarBotaoLogin();
    });
}

// ── Lupa flutuante ────────────────────────────────────────────────
function iniciarLupa() {
    const lupa    = document.getElementById('assistive-touch');
    const cluster = document.getElementById('float-cluster');
    const overlay = document.getElementById('search-overlay');
    const input   = document.getElementById('filtroBusca');
    if (!lupa || !cluster || !overlay) return;
    const pos = carregarPosicaoLupa();
    if (pos) {
        cluster.style.bottom = 'auto';
        cluster.style.right  = 'auto';
        cluster.style.left   = pos.x + 'px';
        cluster.style.top    = pos.y + 'px';
    }
    function abrirBusca()  { darFeedback(); overlay.classList.add('search-open'); if (input) { setTimeout(() => input.focus(), 80); aplicarFiltro(); } }
    function fecharBusca() { overlay.classList.remove('search-open'); if (input) input.blur(); }
    function toggleBusca() { overlay.classList.contains('search-open') ? fecharBusca() : abrirBusca(); }
    let isDragging = false, startX, startY, elX, elY, touchMoved = false;
    lupa.addEventListener('touchstart', e => {
        isDragging = false; touchMoved = false;
        startX = e.touches[0].clientX; startY = e.touches[0].clientY;
        const rect = cluster.getBoundingClientRect(); elX = rect.left; elY = rect.top;
    }, { passive: true });
    lupa.addEventListener('touchmove', e => {
        const dx = e.touches[0].clientX - startX, dy = e.touches[0].clientY - startY;
        if (!isDragging && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) { isDragging = true; touchMoved = true; }
        if (isDragging) {
            cluster.style.bottom = 'auto';
            cluster.style.right  = 'auto';
            cluster.style.left   = Math.max(0, Math.min(window.innerWidth  - 56, elX + dx)) + 'px';
            cluster.style.top    = Math.max(0, Math.min(window.innerHeight - 56, elY + dy)) + 'px';
        }
    }, { passive: true });
    lupa.addEventListener('touchend', e => {
        e.preventDefault();
        if (!touchMoved) toggleBusca();
        else { const rect = cluster.getBoundingClientRect(); salvarPosicaoLupa({ x: rect.left, y: rect.top }); }
        isDragging = false;
    });
    lupa.addEventListener('click', toggleBusca);
    document.addEventListener('pointerdown', e => {
        if (overlay.classList.contains('search-open') && !overlay.contains(e.target) && !lupa.contains(e.target)) fecharBusca();
    }, true);
}
// ── Filtro / busca ────────────────────────────────────────────────
// FIX v10.0.0 — PERFORMANCE: cache de NodeList para evitar querySelectorAll
// a cada tecla digitada. Com 100+ itens, o loop sem cache gerava jank visível
// em mobile. O cache é invalidado em invalidarCacheFiltro(), chamada após
// renderizarListaCompleta() e inserirLinhaNoDOM().
let _cachedRows = null;
let _cachedHeaders = null;

export function invalidarCacheFiltro() {
    _cachedRows    = null;
    _cachedHeaders = null;
}

function aplicarFiltro() {
    const busca = (document.getElementById('filtroBusca')?.value || '').toLowerCase().trim();
    const sel   = document.getElementById('filtroSelect')?.value || '';

    // Usa cache ou popula na primeira chamada após invalidação.
    if (!_cachedRows) {
        _cachedRows    = [...document.querySelectorAll('#lista-itens-container tr')];
        _cachedHeaders = _cachedRows.filter(r => r.classList.contains('categoria-header-row'));
    }

    _cachedRows.forEach(tr => {
        if (tr.classList.contains('categoria-header-row')) { tr.style.display = ''; return; }
        const nome = tr.querySelector('.nome-prod')?.textContent.toLowerCase() || '';
        tr.style.display = ((!busca || nome.includes(busca)) && (!sel || nome.trim() === sel.toLowerCase().trim())) ? '' : 'none';
    });
    _cachedHeaders.forEach(hdr => {
        let next = hdr.nextElementSibling, temVisivel = false;
        while (next && !next.classList.contains('categoria-header-row')) {
            if (next.style.display !== 'none') { temVisivel = true; break; }
            next = next.nextElementSibling;
        }
        hdr.style.display = temVisivel ? '' : 'none';
    });
}

// ── Microfone ─────────────────────────────────────────────────────
function iniciarMic(inputId, btnId) {
    const btn = document.getElementById(btnId);
    if (!btn || !('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR(); rec.lang = 'pt-BR'; rec.interimResults = false; rec.maxAlternatives = 1;
    btn.addEventListener('click', () => { darFeedback(); try { rec.start(); } catch(e){} });
    rec.onresult = e => {
        const inp = document.getElementById(inputId);
        if (inp) { inp.value = e.results[0][0].transcript; inp.dispatchEvent(new Event('input')); }
    };
}

function iniciarScrollBtns() {
    document.getElementById('btn-scroll-top')?.addEventListener('click', () => { darFeedback(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    document.getElementById('btn-scroll-bottom')?.addEventListener('click', () => { darFeedback(); window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); });
}

// ── Exportar / Importar JSON ──────────────────────────────────────
function exportarJSON() {
    darFeedback();
    const payload = {
        v: VERSAO_ATUAL,
        estoque:     carregarDados()             || [],
        ocultos:     carregarOcultos()           || [],
        meus:        carregarMeus()              || [],
        lfItens:     carregarItensLF()           || [],
        lfOrcamento: carregarOrcamentoLF()       || 3200,
        lfHistorico: carregarHistoricoCompleto() || {},
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `stockflow_${new Date().toLocaleDateString('pt-BR').replace(/\//g,'-')}.json`;
    a.style.display = 'none'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    mostrarToast('Lista salva!');
}

function importarJSON(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const d = JSON.parse(e.target.result);
            mostrarConfirmacao('Carregar lista do arquivo? Os dados atuais serão substituídos.', async () => {
                if (Array.isArray(d.estoque)) salvarDados(d.estoque);
                if (Array.isArray(d.ocultos)) salvarOcultos(d.ocultos);
                if (Array.isArray(d.meus))    salvarMeus(d.meus);
                if (Array.isArray(d.lfItens)) salvarItensLF(d.lfItens);
                if (d.lfOrcamento)            salvarOrcamentoLF(d.lfOrcamento);
                if (d.lfHistorico)            mesclarHistorico(d.lfHistorico);
                // Após importar: push imediato para Firebase (não espera o debounce)
                await fbPushTudo();
                location.reload();
            });
        } catch { mostrarToast('Arquivo inválido.'); }
    };
    reader.readAsText(file);
}

// ── Lista padrão ──────────────────────────────────────────────────
let itensOcultos = [], meusItens = [];
function carregarListaPadrao() { itensOcultos = carregarOcultos(); meusItens = carregarMeus(); }
function buildDadosPadrao() {
    const dados = [], ocultoSet = new Set(itensOcultos.map(n => n.toLowerCase()));
    produtosPadrao.forEach(linha => {
        const [n, u] = linha.split('|');
        if (!ocultoSet.has(n.toLowerCase())) dados.push({ n, q: '', u: u || 'uni', c: false, min: null, max: null });
    });
    meusItens.forEach(item => {
        if (!dados.find(d => d.n.toLowerCase() === item.n.toLowerCase()))
            dados.push({ n: item.n, q: '', u: item.u || 'uni', c: false, min: null, max: null });
    });
    return dados;
}
function restaurarListaPadrao() {
    mostrarConfirmacao('Restaurar lista padrão? Os dados atuais serão perdidos.', () => {
        salvarDados(buildDadosPadrao()); location.reload();
    });
}

function novoDia() {
    mostrarConfirmacao('Zerar todas as quantidades? Esta ação não pode ser desfeita.', () => {
        const dados = coletarDadosDaTabela().map(d => ({ ...d, q: '', c: false }));
        salvarDados(dados);
        renderizarListaCompleta(dados);
        invalidarCacheFiltro();
        atualizarDropdown(); atualizarPainelCompras();
        mostrarToast('Quantidades zeradas!'); agendarSnapshot();
    });
}

function adicionarItem() {
    const nomEl = document.getElementById('novoProduto');
    const qtdEl = document.getElementById('novoQtd');
    const undEl = document.getElementById('novoUnidade');
    const nome  = nomEl?.value.trim();
    if (!nome) { mostrarToast('Digite o nome do produto.'); return; }
    const dados = coletarDadosDaTabela();
    if (dados.find(d => d.n.toLowerCase() === nome.toLowerCase())) { mostrarToast('Produto já existe na lista.'); return; }
    darFeedback();
    inserirLinhaNoDOM(nome, qtdEl?.value || '', undEl?.value || 'uni', false, null, null);
    salvarDados(coletarDadosDaTabela());
    invalidarCacheFiltro();
    atualizarDropdown(); atualizarStatusSave();
    if (nomEl) nomEl.value = '';
    if (qtdEl) qtdEl.value = '';
    agendarSnapshot(); initSwipe();
}

function adicionarFavorito() {
    const nomEl = document.getElementById('novoProduto'), nome = nomEl?.value.trim();
    if (!nome) { mostrarToast('Digite o nome do produto.'); return; }
    mostrarConfirmacao('Adicionar "' + nome + '" à lista padrão?', () => {
        const u = document.getElementById('novoUnidade')?.value || 'uni';
        meusItens = meusItens.filter(i => i.n.toLowerCase() !== nome.toLowerCase());
        meusItens.push({ n: nome, u });
        salvarMeus(meusItens);
        const jaExiste = !!coletarDadosDaTabela().find(d => d.n.toLowerCase() === nome.toLowerCase());
        adicionarItem();
        if (!jaExiste) mostrarToast('"' + nome + '" adicionado aos favoritos!');
    });
}

function removerDoPadrao() {
    const nomEl = document.getElementById('novoProduto'), nome = nomEl?.value.trim();
    if (!nome) { mostrarToast('Digite o nome do produto.'); return; }
    mostrarConfirmacao('Remover "' + nome + '" da lista padrão?', () => {
        const nLower = nome.toLowerCase();
        meusItens    = meusItens.filter(i => i.n.toLowerCase() !== nLower);
        itensOcultos = itensOcultos.filter(n => n.toLowerCase() !== nLower);
        if (produtosPadrao.some(p => p.split('|')[0].toLowerCase() === nLower)) itensOcultos.push(nome);
        salvarMeus(meusItens); salvarOcultos(itensOcultos);
        mostrarToast('"' + nome + '" removido do padrão.');
    });
}

function gerarTextoEstoque() {
    const dados = coletarDadosDaTabela();
    const hoje  = new Date().toLocaleDateString('pt-BR');
    const itens = [...dados]
        .sort((a, b) => a.n.localeCompare(b.n, 'pt-BR', { sensitivity: 'base' }))
        .map(d => d.n + (d.q ? ' — ' + d.q + ' ' + d.u : ''));
    return `*ESTOQUE*\n*${hoje}*\n\n` + itens.join('\n') + '\n';
}

function compartilharEstoque() {
    darFeedback();
    const texto = gerarTextoEstoque();
    if (navigator.share) navigator.share({ text: texto }); else copiarParaClipboard(texto);
}

function restaurarSnapshot(snap, data) {
    if (!snap) return;
    if (Array.isArray(snap.estoque) && snap.estoque.length > 0) salvarDados(snap.estoque);
    if (Array.isArray(snap.ocultos))  salvarOcultos(snap.ocultos);
    if (Array.isArray(snap.meus))     salvarMeus(snap.meus);
    if (Array.isArray(snap.lfItens))  salvarItensLF(snap.lfItens);
    if (snap.lfOrcamento)             salvarOrcamentoLF(snap.lfOrcamento);
    if (snap.lfHistorico)             mesclarHistorico(snap.lfHistorico);
    mostrarToast('Backup de ' + data + ' restaurado!');
    setTimeout(() => location.reload(), 800);
}

// FIX v10.0.0: mini-parser Markdown para exibir o CHANGELOG com formatação legível.
// ## Título → <h3>, **negrito** → <strong>, - item → bullet, código → <code>.
// Sem dependências externas — ~30 linhas de lógica simples.
function _parseMarkdownSimples(md) {
    const frag = document.createDocumentFragment();
    const linhas = md.split('\n').slice(0, 60);
    linhas.forEach(linha => {
        let el;
        if (/^###\s/.test(linha)) {
            el = document.createElement('h4');
            el.textContent = linha.replace(/^###\s/, '');
            el.style.cssText = 'margin:10px 0 4px;font-size:13px;color:var(--accent,#FF9500);font-weight:700;';
        } else if (/^##\s/.test(linha)) {
            el = document.createElement('h3');
            el.textContent = linha.replace(/^##\s/, '');
            el.style.cssText = 'margin:14px 0 6px;font-size:15px;color:var(--text,#F5F5F7);font-weight:700;border-bottom:1px solid var(--border,#333);padding-bottom:4px;';
        } else if (/^#\s/.test(linha)) {
            el = document.createElement('h2');
            el.textContent = linha.replace(/^#\s/, '');
            el.style.cssText = 'margin:0 0 8px;font-size:17px;color:var(--accent,#FF9500);font-weight:800;';
        } else if (/^[-*]\s/.test(linha)) {
            el = document.createElement('p');
            el.style.cssText = 'margin:2px 0 2px 12px;font-size:12px;color:var(--text-2,#AAA);';
            // Inline: **negrito** e `code`
            const texto = linha.replace(/^[-*]\s/, '• ');
            el.innerHTML = texto
                .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                .replace(/`(.+?)`/g, '<code style="background:rgba(255,255,255,0.08);padding:1px 4px;border-radius:3px;font-size:11px;">$1</code>');
        } else if (linha.trim() === '') {
            el = document.createElement('div');
            el.style.height = '4px';
        } else {
            el = document.createElement('p');
            el.style.cssText = 'margin:2px 0;font-size:12px;color:var(--text-2,#888);';
            el.innerHTML = linha
                .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                .replace(/`(.+?)`/g, '<code style="background:rgba(255,255,255,0.08);padding:1px 4px;border-radius:3px;font-size:11px;">$1</code>');
        }
        frag.appendChild(el);
    });
    return frag;
}

function mostrarNovidades() {
    const ultima = carregarUltimaVersao();
    if (ultima === VERSAO_ATUAL) return;
    fetch('./CHANGELOG.md').then(r => r.text()).then(md => {
        const div = document.getElementById('whatsnew-content');
        if (div) {
            div.innerHTML = '';
            div.appendChild(_parseMarkdownSimples(md));
        }
        document.getElementById('modal-whatsnew').style.display = 'flex';
        salvarUltimaVersao(VERSAO_ATUAL);
    }).catch(() => salvarUltimaVersao(VERSAO_ATUAL));
}

// ════════════════════════════════════════════════════════════════════
// INICIALIZAÇÃO PRINCIPAL — async para aguardar login Firebase
// ════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
// FIX v10.0.0 — PERFORMANCE: wrap global try/catch no DOMContentLoaded.
// Se qualquer módulo importado lançar erro não tratado, a tela não fica em
// branco sem feedback — o usuário vê um toast de erro com instrução de recarga.
try {

    // 1. Tema (antes do Firebase — sem necessidade de auth)
    aplicarTema(carregarTema() || 'escuro');
    document.getElementById('btn-tema')?.addEventListener('click', ciclarTema);

    // 2. Firebase: login + pull de dados
    await _initFirebaseApp();

    // 3. Logout button
    document.getElementById('btn-usuario')?.addEventListener('click', async () => {
        const user = fbGetUser();
        if (!user) return;
        const nome = user.displayName || user.email || 'Usuário';
        mostrarConfirmacao(`Sair da conta ${nome}?`, async () => {
            await fbSignOut();
            location.reload();
        });
    });

    // 4. Confirm modal
    configurarListenersConfirm();

    // 5. Navegação entre abas
    iniciarNavegacao();

    // 6. Calendário / backup
    iniciarCalendario(restaurarSnapshot);

    // 6.1 Background personalizado
    await initBgUpload();

    // 6.2 FIX v10.0.0: initStorage() chamado aqui (dentro do DOMContentLoaded)
    // em vez de no top-level de storage.js. Garante que o IDB esteja disponível
    // e que falhas de migração não bloqueiem o carregamento silenciosamente.
    initStorage();

    // 7. Carregar e renderizar dados de estoque
    carregarListaPadrao();
    let dados = carregarDados();
    if (!dados || !Array.isArray(dados) || dados.length === 0) {
        dados = buildDadosPadrao();
        salvarDados(dados);
    }
    renderizarListaCompleta(dados);
    invalidarCacheFiltro();
    atualizarDropdown();
    atualizarPainelCompras();
    verificarAlertas();

    // 8. Swipe
    initSwipe();

    // 9. Módulo Massa
    iniciarMassa();

    // 10. Produção
    iniciarProducao();

    // 11. Lista Fácil
    iniciarListaFacil();

    // 12. Lupa
    iniciarLupa();

    // 13. Microfone
    iniciarMic('filtroBusca', 'btn-mic-busca');
    iniciarMic('novoProduto', 'btn-mic-prod');

    // 14. Scroll
    iniciarScrollBtns();

    // 15. Novidades
    mostrarNovidades();

    // 16. Gemini IA — inicializa o módulo de assistente
    // O DOM da seção (#gemini-section) já existe em index.html.
    // iniciarGemini() injeta o layout internamente e não bloqueia
    // o carregamento (sem await — módulo é 100% síncrono no init).
    iniciarGemini();

    // ── Listeners ──────────────────────────────────────────────────

    document.getElementById('filtroBusca')?.addEventListener('input', aplicarFiltro);
    document.getElementById('filtroSelect')?.addEventListener('change', aplicarFiltro);
    document.querySelectorAll('[data-limpar]').forEach(btn => {
        btn.addEventListener('click', () => {
            const el = document.getElementById(btn.dataset.limpar);
            if (el) { el.value = ''; el.dispatchEvent(new Event('input')); }
        });
    });

    document.getElementById('btn-novo-dia')?.addEventListener('click', novoDia);
    document.getElementById('btn-exportar')?.addEventListener('click', exportarJSON);
    document.getElementById('btn-importar')?.addEventListener('click', () => { darFeedback(); document.getElementById('input-arquivo')?.click(); });
    document.getElementById('input-arquivo')?.addEventListener('change', e => { importarJSON(e.target.files[0]); e.target.value = ''; });
    document.getElementById('btn-reset')?.addEventListener('click', restaurarListaPadrao);

    document.getElementById('btn-compartilhar-estoque')?.addEventListener('click', compartilharEstoque);
    document.getElementById('btn-copiar-estoque')?.addEventListener('click', () => {
        darFeedback();
        copiarParaClipboard(gerarTextoEstoque());
    });
    document.getElementById('btn-compartilhar-compras')?.addEventListener('click', () => {
        darFeedback();
        if (navigator.share) navigator.share({ text: gerarTextoCompras() }); else copiarParaClipboard(gerarTextoCompras());
    });
    document.getElementById('btn-copiar-compras')?.addEventListener('click', () => { darFeedback(); copiarParaClipboard(gerarTextoCompras()); });

    document.getElementById('add-btn')?.addEventListener('click', adicionarItem);
    document.getElementById('add-star-btn')?.addEventListener('click', adicionarFavorito);
    document.getElementById('remove-star-btn')?.addEventListener('click', removerDoPadrao);
    document.getElementById('novoProduto')?.addEventListener('keydown', e => { if (e.key === 'Enter') adicionarItem(); });

    document.getElementById('modal-calc')?.addEventListener('click', e => { if (e.target === e.currentTarget) fecharCalculadora(); });
    document.querySelector('.calc-close')?.addEventListener('click', fecharCalculadora);
    document.getElementById('novoQtd')?.addEventListener('click', () => { abrirCalculadora(document.getElementById('novoQtd')); });
    document.getElementById('calc-btn-teclado')?.addEventListener('click', () => { const inp = getInputCalculadoraAtual(); fecharCalculadora(); if (inp) ativarModoTeclado(inp); });
    document.querySelectorAll('[data-calc]').forEach(btn => {
        btn.addEventListener('click', () => { const v = btn.dataset.calc; if (v === 'OK') calcSalvar(); else calcDigito(v); });
    });

    document.getElementById('lista-itens-container')?.addEventListener('change', e => {
        const chk = e.target.closest("input[type='checkbox']");
        if (chk) { alternarCheck(chk); agendarSnapshot(); return; }
        const sel = e.target.closest('select');
        if (sel) { salvarDados(coletarDadosDaTabela()); agendarSnapshot(); atualizarStatusSave(); }
    });
    document.getElementById('lista-itens-container')?.addEventListener('input', e => {
        const inp = e.target.closest('.input-qtd-tabela');
        if (inp) { salvarDados(coletarDadosDaTabela()); agendarSnapshot(); atualizarStatusSave(); verificarAlertasDebounced(); }
    });
    document.getElementById('lista-itens-container')?.addEventListener('blur', e => {
        const nome = e.target.closest('.nome-prod');
        if (nome) { salvarEAtualizar(); invalidarCacheFiltro(); agendarSnapshot(); return; }
        const inp = e.target.closest('.input-qtd-tabela');
        if (inp && !inp.hasAttribute('readonly')) parseAndUpdateQuantity(inp);
    }, true);
    document.getElementById('lista-itens-container')?.addEventListener('dblclick', e => {
        const inp = e.target.closest('.input-qtd-tabela'); if (inp) abrirCalculadora(inp);
    });

    let longPressTimer = null;
    document.getElementById('lista-itens-container')?.addEventListener('touchstart', e => {
        const inp = e.target.closest('.input-qtd-tabela');
        if (!inp || !inp.hasAttribute('readonly')) return;
        longPressTimer = setTimeout(() => abrirCalculadora(inp), 400);
    }, { passive: true });
    document.getElementById('lista-itens-container')?.addEventListener('touchend', () => { clearTimeout(longPressTimer); }, { passive: true });

    document.getElementById('check-todos')?.addEventListener('change', e => { alternarTodos(e.target); });
    document.getElementById('filtroSelect')?.addEventListener('touchstart', () => {}, { passive: true });

    document.getElementById('salvar-alerta')?.addEventListener('click', () => { salvarAlerta(); agendarSnapshot(); });
    document.querySelectorAll('.fechar-modal-alerta').forEach(b => b.addEventListener('click', fecharModalAlerta));
    document.querySelectorAll('.fechar-whatsnew').forEach(b => b.addEventListener('click', () => {
        document.getElementById('modal-whatsnew').style.display = 'none';
    }));

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') { fecharCalendario(); fecharCalculadora(); return; }
        const modalCalc = document.getElementById('modal-calc');
        if (!modalCalc || modalCalc.style.display === 'none') return;
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        const KEY_MAP = {
            '0':'0','1':'1','2':'2','3':'3','4':'4','5':'5','6':'6','7':'7','8':'8','9':'9',
            ',':',','.':',','+':'+','-':'-','*':'×','x':'×','X':'×','/':'÷','%':'%',
            'Backspace':'BACK','Delete':'C','c':'C','C':'C','Enter':'OK',
        };
        const acao = KEY_MAP[e.key];
        if (!acao) return;
        e.preventDefault();
        if (acao === 'OK') calcSalvar(); else calcDigito(acao);
    });

    window.addEventListener('beforeunload', () => { salvarDados(coletarDadosDaTabela()); });

} catch (e) {
    // FIX v10.0.0: safety-net — qualquer erro não tratado no boot exibe
    // uma notificação em vez de deixar a tela em branco silenciosamente.
    console.error('[main] Erro crítico na inicialização:', e);
    mostrarToast('Erro ao inicializar o app. Recarregue a página.', 'erro');
}
});
