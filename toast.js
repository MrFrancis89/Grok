// toast.js — StockFlow Pro v10.0.0
// CORREÇÃO v9.7.4: innerText → textContent (evita reflow de layout).
// CORREÇÃO v9.7.4: mostrarAlertaElegante removido daqui e movido para confirm.js.
// MELHORIA v10.0.0: parâmetro 'tipo' para distinção visual de alertas.
//   • 'aviso'  → fundo âmbar   (estoque baixo/excessivo)
//   • 'erro'   → fundo vermelho (falhas críticas)
//   • 'sucesso'→ fundo verde    (confirmações positivas)
//   • omitido  → padrão neutro  (notificações informativas)
// Compatível retroativamente: chamadas sem tipo continuam funcionando.

/**
 * Exibe uma notificação não bloqueante no rodapé.
 * @param {string} msg  — texto da mensagem
 * @param {'aviso'|'erro'|'sucesso'|''} [tipo] — tipo visual (opcional)
 */
export function mostrarToast(msg, tipo = '') {
    const container = document.getElementById('toast-container');
    if (!container) { console.warn('[toast] #toast-container não encontrado.'); return; }

    const toast = document.createElement('div');
    toast.className = 'toast' + (tipo ? ' toast--' + tipo : '');
    toast.textContent = msg;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
