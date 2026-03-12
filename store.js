// store.js — StockFlow Pro Reactive State v9.7.4
// Micro-store com EventTarget. Zero dependências, ~60 linhas.

class Store extends EventTarget {
    #state = {};

    constructor(initialState = {}) {
        super();
        this.#state = { ...initialState };
    }

    /** Lê um valor do estado */
    get(key) {
        return this.#state[key];
    }

    /** Atualiza um ou mais valores e dispara 'change' */
    set(partial) {
        const prev = { ...this.#state };
        this.#state = { ...this.#state, ...partial };

        const changedKeys = Object.keys(partial).filter(k => partial[k] !== prev[k]);
        if (changedKeys.length === 0) return;

        this.dispatchEvent(new CustomEvent('change', {
            detail: { prev, next: this.#state, keys: changedKeys }
        }));

        // Dispatcha evento específico por chave também
        changedKeys.forEach(key => {
            this.dispatchEvent(new CustomEvent(`change:${key}`, {
                detail: { prev: prev[key], next: this.#state[key] }
            }));
        });
    }

    /** Retorna snapshot completo do estado */
    snapshot() {
        return { ...this.#state };
    }

    /** Subscreve a mudanças de uma chave específica */
    on(key, callback) {
        const handler = (e) => callback(e.detail.next, e.detail.prev);
        this.addEventListener(`change:${key}`, handler);
        return () => this.removeEventListener(`change:${key}`, handler); // unsubscribe
    }
}

// Estado global do StockFlow
export const appStore = new Store({
    tema: 'escuro',
    abaAtiva: 'estoque',
    lfItens: [],
    lfOrcamento: 3200.00,
    estoqueItens: [],
    pwaInstalavel: false,
    pwaPrompt: null,
});

export default appStore;