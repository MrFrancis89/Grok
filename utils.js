// utils.js — StockFlow Pro v9.7.4
// Dependências: apenas toast.js (sem circulares)
// copiarFallback comunica com confirm.js via evento DOM desacoplado.

import { mostrarToast } from './toast.js';

export function darFeedback() {
    if (navigator.vibrate) { navigator.vibrate(15); }
    try {
        if (!window.audioCtx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            window.audioCtx = new AudioContext();
        }
        if (window.audioCtx.state === 'suspended') { window.audioCtx.resume(); }
        const osc  = window.audioCtx.createOscillator();
        const gain = window.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, window.audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, window.audioCtx.currentTime + 0.02);
        gain.gain.setValueAtTime(0.15, window.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, window.audioCtx.currentTime + 0.02);
        osc.connect(gain);
        gain.connect(window.audioCtx.destination);
        osc.start(window.audioCtx.currentTime);
        osc.stop(window.audioCtx.currentTime + 0.03);
    } catch (e) {}
}

export function obterDataAtual()  { return new Date().toLocaleDateString('pt-BR'); }

export function obterDataAmanha() {
    const hoje   = new Date();
    const amanha = new Date(hoje);
    amanha.setDate(hoje.getDate() + 1);
    return amanha.toLocaleDateString('pt-BR');
}

export function copiarParaClipboard(texto) {
    darFeedback();
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(texto)
            .then(() => mostrarToast('Copiado com sucesso!'))
            .catch(() => copiarFallback(texto));
    } else {
        copiarFallback(texto);
    }
}

// Fallback para contextos sem Clipboard API (ex: Safari legado).
// Usa evento DOM para sinalizar confirm.js sem criar dependência direta (evita circular).
function copiarFallback(texto) {
    const ta = document.createElement('textarea');
    ta.value = texto;
    ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
        document.execCommand('copy');
        mostrarToast('Copiado com sucesso!');
    } catch (err) {
        // Abre modal de alerta via evento desacoplado (confirm.js ouve 'modal:alert')
        document.dispatchEvent(new CustomEvent('modal:alert', {
            detail: { msg: 'Erro ao copiar. Selecione o texto manualmente.' }
        }));
    }
    document.body.removeChild(ta);
}
/**
 * Escapa entidades HTML para uso seguro em template literals.
 * Centralizado aqui para eliminar esc() duplicada em massa.js e listafacil.js.
 */
export function esc(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
