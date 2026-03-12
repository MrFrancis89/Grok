// ft-ui.js — v3.0
// REGRA: abrirModal() é SÍNCRONO na injeção. NUNCA use "await abrirModal()".
// Adicione listeners imediatamente após a chamada.
import { ico } from './ft-icons.js';

export function toast(msg, tipo = 'info') {
    const wrap = document.getElementById('ft-toast');
    if (!wrap) return;
    const el = document.createElement('div');
    el.className = `ft-toast-item ft-toast-${tipo}`;
    const imap = { sucesso: ico.check, erro: ico.warn, aviso: ico.tip, info: ico.info };
    el.innerHTML = `<span class="ft-t-ico">${imap[tipo] || ico.info}</span><span>${msg}</span>`;
    wrap.appendChild(el);
    requestAnimationFrame(() => el.classList.add('on'));
    setTimeout(() => { el.classList.remove('on'); setTimeout(() => el.remove(), 350); }, 3400);
}

export function setLoading(show) {
    const el = document.getElementById('ft-loading');
    if (el) el.style.display = show ? 'flex' : 'none';
}

let _r1 = null;
export function abrirModal(html, { largo = false } = {}) {
    const ov = document.getElementById('ft-modal');
    const bx = document.getElementById('ft-modal-box');
    if (!ov || !bx) return Promise.resolve(null);
    bx.innerHTML = html;
    bx.classList.toggle('largo', largo);
    ov.classList.add('open');
    requestAnimationFrame(() =>
        bx.querySelector('input:not([type=hidden]),select,textarea')?.focus()
    );
    return new Promise(r => { _r1 = r; });
}
export function fecharModal(v = null) {
    document.getElementById('ft-modal')?.classList.remove('open');
    if (_r1) { _r1(v); _r1 = null; }
}

let _r2 = null;
export function abrirModal2(html) {
    const ov = document.getElementById('ft-modal-2');
    const bx = document.getElementById('ft-modal-2-box');
    if (!ov || !bx) return Promise.resolve(null);
    bx.innerHTML = html;
    ov.classList.add('open');
    requestAnimationFrame(() =>
        bx.querySelector('input:not([type=hidden]),select,textarea')?.focus()
    );
    return new Promise(r => { _r2 = r; });
}
export function fecharModal2(v = null) {
    document.getElementById('ft-modal-2')?.classList.remove('open');
    if (_r2) { _r2(v); _r2 = null; }
}

export function confirmar(msg, { labelOK = 'Confirmar', perigo = true } = {}) {
    const html = `
        <div class="ft-mhd">
            <span class="ft-mhd-title">Confirmar ação</span>
        </div>
        <div class="ft-mbody ft-confirm-body">
            <div class="ft-cfm-ico ${perigo ? 'danger' : 'info'}">${perigo ? ico.warn : ico.info}</div>
            <p class="ft-cfm-msg">${msg}</p>
        </div>
        <div class="ft-mft">
            <button class="ft-btn ft-btn-ghost" id="_cfmN">Cancelar</button>
            <button class="ft-btn ${perigo ? 'ft-btn-danger' : 'ft-btn-primary'}" id="_cfmY">${labelOK}</button>
        </div>`;
    const p = abrirModal(html);
    document.getElementById('_cfmY')?.addEventListener('click', () => fecharModal(true),  { once: true });
    document.getElementById('_cfmN')?.addEventListener('click', () => fecharModal(false), { once: true });
    return p;
}

export function renderEmpty(el, icoSvg, titulo, sub = '', acao = null) {
    if (!el) return;
    el.innerHTML = `
        <div class="ft-empty">
            <div class="ft-empty-ico">${icoSvg}</div>
            <div class="ft-empty-title">${titulo}</div>
            ${sub ? `<p class="ft-empty-sub">${sub}</p>` : ''}
            ${acao ? `<button class="ft-btn ft-btn-primary" id="_emptyBtn">
                <span class="ft-bico">${ico.plus}</span><span>${acao.label}</span>
            </button>` : ''}
        </div>`;
    if (acao) document.getElementById('_emptyBtn')?.addEventListener('click', acao.fn, { once: true });
}

export function renderTutorial(secId, chave, icoSvg, titulo, passos) {
    if (localStorage.getItem('ft_tut_' + chave)) return;
    const sec = document.getElementById(secId);
    if (!sec) return;
    const tid = `_tut_${chave}`;
    if (document.getElementById(tid)) return;
    const el = document.createElement('div');
    el.id = tid; el.className = 'ft-tutorial';
    el.innerHTML = `
        <div class="ft-tut-hd">
            <span class="ft-tut-ico">${icoSvg}</span>
            <span class="ft-tut-title">${titulo}</span>
            <button class="ft-tut-close" id="_tc_${chave}" aria-label="Fechar">${ico.close}</button>
        </div>
        <ol class="ft-tut-list">${passos.map(p => `<li>${p}</li>`).join('')}</ol>`;
    sec.insertBefore(el, sec.firstChild);
    document.getElementById(`_tc_${chave}`)?.addEventListener('click', () => {
        el.classList.add('out');
        setTimeout(() => el.remove(), 300);
        localStorage.setItem('ft_tut_' + chave, '1');
    }, { once: true });
}

export function debounce(fn, ms = 260) {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function initModalOverlay() {
    document.getElementById('ft-modal')?.addEventListener('click', e => {
        if (e.target.id === 'ft-modal') fecharModal(null);
    });
    document.getElementById('ft-modal-2')?.addEventListener('click', e => {
        if (e.target.id === 'ft-modal-2') fecharModal2(null);
    });
}
