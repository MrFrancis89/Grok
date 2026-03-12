// gemini.js — StockFlow Pro v10.3.0 (Groq / Llama 3.3)
import { mostrarToast }              from './toast.js';
import { darFeedback }               from './utils.js';
import { carregarDados, salvarDados } from './storage.js';
import { coletarDadosDaTabela }      from './tabela.js';
import { renderizarListaCompleta }   from './ui.js';
import { atualizarDropdown }         from './dropdown.js';
import { atualizarPainelCompras }    from './compras.js';
import {
    iaAdicionarItemLF,
    iaRemoverItemLF,
    iaDefinirOrcamentoLF,
    iaAdicionarVariosItensLF,
    iaObterItensLF,
    iaObterOrcamentoLF,
} from './listafacil.js';

// ── Constantes ────────────────────────────────────────────────────
const LS_KEY          = 'stockflow_groq_key';
const MODEL           = 'llama-3.3-70b-versatile';
const ENDPOINT        = 'https://api.groq.com/openai/v1/chat/completions';
const MAX_TURNS       = 40;
const MAX_TOOL_ROUNDS = 3;
const SHEET_DRAG_THRESHOLD = 100;
const MIN_REQ_GAP     = 2000;   // 2s entre requisições — Groq: 30 RPM grátis

// ── Tools (formato OpenAI) ────────────────────────────────────────
const TOOLS = [
    {
        type: 'function',
        function: {
            name: 'adicionar_item_estoque',
            description: 'Adiciona um novo item ao estoque da pizzaria.',
            parameters: {
                type: 'object',
                properties: {
                    nome:       { type: 'string', description: 'Nome do produto' },
                    quantidade: { type: 'string', description: 'Quantidade inicial. Use "0" se não especificado.' },
                    unidade:    { type: 'string', enum: ['kg','g','uni','pct','cx','bld','crt'], description: 'Unidade de medida' },
                },
                required: ['nome', 'unidade'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'atualizar_quantidade',
            description: 'Atualiza a quantidade de um item existente no estoque.',
            parameters: {
                type: 'object',
                properties: {
                    nome:       { type: 'string', description: 'Nome ou parte do nome do item' },
                    quantidade: { type: 'string', description: 'Nova quantidade' },
                },
                required: ['nome', 'quantidade'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'marcar_itens_compra',
            description: 'Marca itens do estoque para compra (ativa o checkbox).',
            parameters: {
                type: 'object',
                properties: {
                    nomes: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Nomes dos itens a marcar',
                    },
                },
                required: ['nomes'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'definir_alerta',
            description: 'Define limite mínimo e/ou máximo de estoque para um item.',
            parameters: {
                type: 'object',
                properties: {
                    nome: { type: 'string', description: 'Nome ou parte do nome do item' },
                    min:  { type: 'number', description: 'Quantidade mínima. Omitir para não alterar.' },
                    max:  { type: 'number', description: 'Quantidade máxima. Omitir para não alterar.' },
                },
                required: ['nome'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'remover_item_estoque',
            description: 'Remove permanentemente um item do estoque.',
            parameters: {
                type: 'object',
                properties: {
                    nome: { type: 'string', description: 'Nome exato ou parcial do item' },
                },
                required: ['nome'],
            },
        },
    },

    // ── NOVAS: Lista de Compras ───────────────────────────────────
    {
        type: 'function',
        function: {
            name: 'adicionar_item_lista',
            description: 'Adiciona um item à Lista Fácil (lista de compras). Use quando o usuário quiser comprar algo que ainda não está no estoque ou precisar registrar um item na lista.',
            parameters: {
                type: 'object',
                properties: {
                    nome:       { type: 'string',  description: 'Nome do produto a comprar' },
                    quantidade: { type: 'number',  description: 'Quantidade desejada. Padrão: 1.' },
                    preco:      { type: 'number',  description: 'Preço unitário estimado em R$. Padrão: 0.' },
                },
                required: ['nome'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'remover_item_lista',
            description: 'Remove um item da Lista Fácil (lista de compras).',
            parameters: {
                type: 'object',
                properties: {
                    nome: { type: 'string', description: 'Nome ou parte do nome do item a remover da lista' },
                },
                required: ['nome'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'definir_orcamento_lista',
            description: 'Define o orçamento total da Lista Fácil em reais.',
            parameters: {
                type: 'object',
                properties: {
                    valor: { type: 'number', description: 'Valor do orçamento em R$ (ex: 500)' },
                },
                required: ['valor'],
            },
        },
    },

    // ── NOVA: Transferir Estoque → Lista ─────────────────────────
    {
        type: 'function',
        function: {
            name: 'transferir_marcados_para_lista',
            description: 'Transfere todos os itens marcados para compra (checkbox ativo) do estoque para a Lista Fácil automaticamente. Use quando o usuário pedir para "mover os marcados para a lista" ou "preparar a lista de compras com o que falta".',
            parameters: {
                type: 'object',
                properties: {
                    incluir_nao_marcados: {
                        type: 'boolean',
                        description: 'Se true, inclui TODOS os itens do estoque, não só os marcados. Padrão: false.',
                    },
                },
                required: [],
            },
        },
    },

    // ── NOVA: Calcular Produção ───────────────────────────────────
    {
        type: 'function',
        function: {
            name: 'calcular_producao',
            description: 'Calcula quantas bolas de massa uma receita rende e lista os insumos necessários. Use quando o usuário informar quantos kg de farinha vai usar ou quantas pizzas quer produzir.',
            parameters: {
                type: 'object',
                properties: {
                    receita_nome: {
                        type: 'string',
                        description: 'Nome ou parte do nome da receita de massa. Se omitido, usa a primeira disponível.',
                    },
                    trigo_kg: {
                        type: 'number',
                        description: 'Quantidade de farinha de trigo em kg. Obrigatório se pizzas não for informado.',
                    },
                    pizzas: {
                        type: 'number',
                        description: 'Quantidade de pizzas/bolas desejada. A IA calcula o trigo necessário automaticamente.',
                    },
                    peso_bola_g: {
                        type: 'number',
                        description: 'Peso de cada bola de massa em gramas. Padrão: 250 g.',
                    },
                },
                required: [],
            },
        },
    },

    // ── NOVA: Analisar Margens ────────────────────────────────────
    {
        type: 'function',
        function: {
            name: 'analisar_margens',
            description: 'Analisa a lucratividade das receitas da Ficha Técnica: custo, preço sugerido por markup, margem real e ranking de rentabilidade. Não requer parâmetros.',
            parameters: {
                type: 'object',
                properties: {
                    markup_pct: {
                        type: 'number',
                        description: 'Markup percentual para calcular preço sugerido (ex: 200 = 200%). Se omitido, usa a configuração salva do Simulador.',
                    },
                    porcoes: {
                        type: 'number',
                        description: 'Número de porções/fatias para calcular custo por fatia. Se omitido, usa a configuração salva.',
                    },
                },
                required: [],
            },
        },
    },
];

// ── Estado privado ────────────────────────────────────────────────
let _history       = [];   // array de {role, content} no formato OpenAI
let _streaming     = false;
let _abort         = null;
let _briefingShown = false;
let _gradSeq       = 0;
let _lastReqTs     = 0;

// ── API key ───────────────────────────────────────────────────────
const _getKey  = ()  => (localStorage.getItem(LS_KEY) || '').trim();
const _hasKey  = ()  => _getKey().length > 10;
const _saveKey = k   => localStorage.setItem(LS_KEY, k.trim());
const _delKey  = ()  => localStorage.removeItem(LS_KEY);

// ── Sanitização ───────────────────────────────────────────────────
function _esc(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// ── Markdown simples → HTML ───────────────────────────────────────
function _md(text) {
    const lines = text.split('\n');
    const out   = [];
    let ul = false;
    for (const raw of lines) {
        let ln = _esc(raw);
        ln = ln.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        ln = ln.replace(/`(.+?)`/g,       '<code class="gem-code">$1</code>');
        ln = ln.replace(/\*(.+?)\*/g,     '<em>$1</em>');
        if (/^[-•–]\s/.test(raw)) {
            if (!ul) { out.push('<ul class="gem-list">'); ul = true; }
            out.push(`<li>${ln.replace(/^[-•–]\s/, '')}</li>`);
            continue;
        }
        if (ul) { out.push('</ul>'); ul = false; }
        if (ln.trim() === '') { out.push('<div class="gem-spacer"></div>'); }
        else                  { out.push(`<p class="gem-p">${ln}</p>`); }
    }
    if (ul) out.push('</ul>');
    return out.join('');
}

// ── Fonte de dados unificada ──────────────────────────────────────
function _getDados() {
    try {
        const dom = coletarDadosDaTabela();
        if (dom && dom.length) return dom;
    } catch { /* DOM indisponível */ }
    return carregarDados() || [];
}

// ── Contexto: estoque ─────────────────────────────────────────────
function _stockCtx() {
    try {
        const list = _getDados();
        if (!list.length) return 'Estoque vazio.';
        const criticos = list.filter(d => d.min != null && parseFloat(d.q) < parseFloat(d.min));
        let ctx = list.map(d => {
            const qtd  = d.q != null ? `${d.q} ${d.u || ''}`.trim() : '—';
            const alrt = (d.min != null || d.max != null)
                ? ` [min:${d.min ?? '—'} max:${d.max ?? '—'}]` : '';
            const flag = (d.min != null && parseFloat(d.q) < parseFloat(d.min)) ? ' 🔴' : '';
            const chk  = d.c ? ' ✓compra' : '';
            return `• ${d.n}: ${qtd}${alrt}${flag}${chk}`;
        }).join('\n');
        if (criticos.length) ctx += `\n\n🚨 CRÍTICOS (${criticos.length}): ${criticos.map(d=>d.n).join(', ')}`;
        return ctx;
    } catch { return 'Estoque indisponível.'; }
}

// ── Contexto: Lista de Compras ────────────────────────────────────
function _listaCtx() {
    try {
        const itens = iaObterItensLF();
        const orc   = iaObterOrcamentoLF();
        if (!itens.length) return '\nLISTA DE COMPRAS: vazia.';
        const total = itens.reduce((s, it) => s + (Number(it.q) || 0) * (Number(it.p) || 0), 0);
        const linhas = itens.map(it => {
            const sub = (Number(it.q) || 0) * (Number(it.p) || 0);
            return `• ${it.n}: ${it.q}x${it.p ? ` R$${Number(it.p).toFixed(2)} = R$${sub.toFixed(2)}` : ''}`;
        }).join('\n');
        const saldo = orc - total;
        return `\nLISTA DE COMPRAS (${itens.length} item(s)):\n${linhas}\nTotal: R$${total.toFixed(2)} | Orçamento: R$${orc.toFixed(2)} | Saldo: R$${saldo.toFixed(2)}${saldo < 0 ? ' 🔴 ESTOURADO' : ''}`;
    } catch { return ''; }
}

// ── Contexto: Produção (receitas disponíveis) ─────────────────────
function _producaoCtx() {
    try {
        const raw = localStorage.getItem('massaMasterReceitas_v1');
        if (!raw) return '';
        const estado  = JSON.parse(raw);
        const receitas = Array.isArray(estado) ? estado : (estado?.receitas || []);
        if (!receitas.length) return '';
        const nomes = receitas.map(r => `"${r.nome}"`).join(', ');
        return `\nRECEITAS DE MASSA (Produção): ${nomes}. Use calcular_producao para simular quantidades.`;
    } catch { return ''; }
}

// ── Contexto: Ficha Técnica ───────────────────────────────────────
function _ftCtx() {
    try {
        const ings = Object.values(JSON.parse(localStorage.getItem('ft_ingredientes') || '{}'));
        const recs = Object.values(JSON.parse(localStorage.getItem('ft_receitas') || '{}'))
            .filter(r => r.ativo !== false);
        if (!ings.length && !recs.length) return '';
        let ctx = '\nFICHA TÉCNICA:\n';
        if (ings.length) {
            ctx += `Ingredientes (${ings.length}): `;
            ctx += ings.map(i => `${i.nome} (${i.unidade}, R$${(i.custo_unitario||0).toFixed(3)}/${i.unidade})`).join(' | ');
        }
        if (recs.length) {
            ctx += `\nReceitas ativas (${recs.length}):\n`;
            ctx += recs.map(r => {
                const custo = (r.custo_total || 0).toFixed(2);
                const nomes = (r.ingredientes || []).map(i => i.nome).join(', ');
                return `  • ${r.nome} ${r.tamanho || ''} — custo R$${custo} — ingredientes: ${nomes}`;
            }).join('\n');
        }
        return ctx;
    } catch { return ''; }
}

// ── System prompt ─────────────────────────────────────────────────
function _sysPrompt() {
    return `Você é o assistente de IA do StockFlow Pro, sistema de gestão de pizzaria.

ESTOQUE ATUAL:
${_stockCtx()}
${_listaCtx()}
${_producaoCtx()}
${_ftCtx()}

CAPACIDADES (use as ferramentas quando o usuário pedir ações concretas):
Estoque: adicionar_item_estoque, atualizar_quantidade, marcar_itens_compra, definir_alerta, remover_item_estoque
Lista de Compras: adicionar_item_lista, remover_item_lista, definir_orcamento_lista
Automação: transferir_marcados_para_lista
Produção: calcular_producao
Análise: analisar_margens

INSTRUÇÕES:
- Responda em português brasileiro, direto e objetivo
- Itens 🔴: destaque com urgência
- Use as mesmas unidades do estoque
- Para ações concretas: execute a ferramenta E confirme textualmente
- Data/hora: ${new Date().toLocaleString('pt-BR')}`;
}

// ── Sugestões contextuais ─────────────────────────────────────────
function _suggestions() {
    const extra = [];
    try {
        const dados    = _getDados();
        const baixos   = dados.filter(d => d.min != null && d.q != null && parseFloat(d.q) < parseFloat(d.min));
        const marcados = dados.filter(d => d.c);
        const semAlerta = dados.filter(d => d.min == null && d.max == null).length;
        if (baixos.length)    extra.push({ e: '🔴', t: `Marcar ${baixos.slice(0,2).map(d=>d.n).join(' e ')} para compra` });
        if (marcados.length)  extra.push({ e: '🔁', t: `Transferir ${marcados.length} marcado(s) para a lista de compras` });
        if (semAlerta > 3)    extra.push({ e: '🔔', t: 'Sugerir alertas para meu estoque' });
        const recs = Object.values(JSON.parse(localStorage.getItem('ft_receitas') || '{}')).filter(r => r.ativo !== false);
        if (recs.length)      extra.push({ e: '📊', t: 'Analisar margens das minhas receitas' });
        const rawProd = localStorage.getItem('massaMasterReceitas_v1');
        if (rawProd) {
            const estado = JSON.parse(rawProd);
            const receitas = Array.isArray(estado) ? estado : (estado?.receitas || []);
            if (receitas.length) extra.push({ e: '⚖️', t: `Calcular produção: ${receitas[0].nome}` });
        }
        const listaItens = iaObterItensLF();
        if (listaItens.length) extra.push({ e: '🛒', t: `Ver resumo da lista (${listaItens.length} item(s))` });
    } catch { /* */ }
    const base = [
        { e: '📊', t: 'Briefing: itens críticos e o que comprar hoje' },
        { e: '🛒', t: 'O que preciso comprar hoje?' },
        { e: '🍕', t: 'Sugerir receita com ingredientes disponíveis' },
        { e: '💡', t: 'Como reduzir desperdício?' },
    ];
    return [...extra, ...base].slice(0, 4);
}

// ══════════════════════════════════════════════════════════════════
// FERRAMENTAS
// ══════════════════════════════════════════════════════════════════
function _findItem(dados, nome) {
    const q = nome.toLowerCase().trim();
    let idx = dados.findIndex(d => d.n.toLowerCase() === q);
    if (idx >= 0) return idx;
    return dados.findIndex(d => d.n.toLowerCase().includes(q) || q.includes(d.n.toLowerCase()));
}
function _rerender(dados) {
    salvarDados(dados);
    renderizarListaCompleta(dados);
    atualizarDropdown();
    atualizarPainelCompras();
}
function _toolAdicionarItem({ nome, quantidade = '0', unidade = 'uni' }) {
    if (!nome) return { ok: false, erro: 'Nome não informado.' };
    const dados = _getDados();
    if (_findItem(dados, nome) >= 0) return { ok: false, erro: `"${nome}" já existe.` };
    dados.push({ n: nome.trim(), q: String(quantidade), u: unidade, c: false, min: null, max: null });
    _rerender(dados);
    return { ok: true, msg: `"${nome}" adicionado com ${quantidade} ${unidade}.` };
}
function _toolAtualizarQtd({ nome, quantidade }) {
    if (!nome || !quantidade) return { ok: false, erro: 'Nome ou quantidade não informado.' };
    const dados = _getDados();
    const idx   = _findItem(dados, nome);
    if (idx < 0) return { ok: false, erro: `"${nome}" não encontrado.` };
    const anterior = dados[idx].q;
    dados[idx].q   = String(quantidade);
    _rerender(dados);
    return { ok: true, msg: `"${dados[idx].n}" atualizado de ${anterior} para ${quantidade} ${dados[idx].u}.` };
}
function _toolMarcarCompra({ nomes }) {
    if (!nomes || !nomes.length) return { ok: false, erro: 'Nenhum nome informado.' };
    const dados = _getDados();
    const marcados = [], naoAchados = [];
    for (const nome of nomes) {
        const idx = _findItem(dados, nome);
        if (idx >= 0) { dados[idx].c = true; marcados.push(dados[idx].n); }
        else           naoAchados.push(nome);
    }
    if (marcados.length) _rerender(dados);
    return {
        ok: marcados.length > 0,
        msg: marcados.length
            ? `Marcado: ${marcados.join(', ')}.${naoAchados.length ? ` Não encontrado: ${naoAchados.join(', ')}.` : ''}`
            : `Nenhum encontrado: ${naoAchados.join(', ')}.`,
    };
}
function _toolDefinirAlerta({ nome, min, max }) {
    if (!nome) return { ok: false, erro: 'Nome não informado.' };
    const dados = _getDados();
    const idx   = _findItem(dados, nome);
    if (idx < 0) return { ok: false, erro: `"${nome}" não encontrado.` };
    if (min != null) dados[idx].min = min;
    if (max != null) dados[idx].max = max;
    _rerender(dados);
    return { ok: true, msg: `Alerta de "${dados[idx].n}": mín ${dados[idx].min ?? '—'}, máx ${dados[idx].max ?? '—'}.` };
}
function _toolRemoverItem({ nome }) {
    if (!nome) return { ok: false, erro: 'Nome não informado.' };
    const dados = _getDados();
    const idx   = _findItem(dados, nome);
    if (idx < 0) return { ok: false, erro: `"${nome}" não encontrado.` };
    const removido = dados[idx].n;
    dados.splice(idx, 1);
    _rerender(dados);
    return { ok: true, msg: `"${removido}" removido.` };
}

// ── Ferramentas: Lista de Compras ─────────────────────────────────
function _toolAdicionarItemLista({ nome, quantidade = 1, preco = 0 }) {
    return iaAdicionarItemLF(nome, quantidade, preco);
}

function _toolRemoverItemLista({ nome }) {
    return iaRemoverItemLF(nome);
}

function _toolDefinirOrcamentoLista({ valor }) {
    return iaDefinirOrcamentoLF(valor);
}

// ── Ferramenta: Transferir Estoque → Lista ────────────────────────
function _toolTransferirMarcadosParaLista({ incluir_nao_marcados = false }) {
    const dados = _getDados();
    const fonte = incluir_nao_marcados ? dados : dados.filter(d => d.c);
    if (!fonte.length) {
        return { ok: false, erro: incluir_nao_marcados
            ? 'Estoque vazio.'
            : 'Nenhum item marcado para compra no estoque. Marque itens antes de transferir.' };
    }
    const itensParaLista = fonte.map(d => ({
        nome:       d.n,
        quantidade: parseFloat(d.q) || 1,
        preco:      0,
    }));
    return iaAdicionarVariosItensLF(itensParaLista);
}

// ── Ferramenta: Calcular Produção ─────────────────────────────────
function _normParaGramas(valor, unidade) {
    const v = parseFloat(valor) || 0;
    const u = (unidade || '').toLowerCase().trim();
    if (u === 'kg') return v * 1000;
    if (u === 'l')  return v * 1000;
    return v;
}

function _toolCalcularProducao({ receita_nome, trigo_kg, pizzas, peso_bola_g = 250 }) {
    try {
        const raw = localStorage.getItem('massaMasterReceitas_v1');
        if (!raw) return { ok: false, erro: 'Nenhuma receita de massa cadastrada na aba Produção.' };

        const estado   = JSON.parse(raw);
        const receitas = Array.isArray(estado) ? estado : (estado?.receitas || []);
        if (!receitas.length) return { ok: false, erro: 'Nenhuma receita de massa encontrada.' };

        // Encontrar receita
        let receita = receitas[0];
        if (receita_nome) {
            const q = receita_nome.toLowerCase().trim();
            const found = receitas.find(r =>
                r.nome.toLowerCase().includes(q) || q.includes(r.nome.toLowerCase())
            );
            if (found) receita = found;
        }

        const pesoBola = Number(peso_bola_g) || 250;

        // Se usuário informou quantidade de pizzas, calcular trigo necessário
        let trigoKg = Number(trigo_kg) || 0;
        if (!trigoKg && pizzas) {
            // Calcular massa por bola = (1000 + soma_ingredientes_por_kg_trigo) g por kg de trigo
            const somaIngG = (receita.ingredientes || [])
                .reduce((acc, ing) => acc + _normParaGramas(parseFloat(ing.valor) || 0, ing.unidade), 0);
            const massaPorKgTrigo = 1000 + somaIngG; // gramas de massa por 1 kg de trigo
            // bolas por kg trigo = massaPorKgTrigo / pesoBola
            const bolasPorKg = massaPorKgTrigo / pesoBola;
            trigoKg = Math.ceil((Number(pizzas) / bolasPorKg) * 100) / 100;
        }

        if (!trigoKg || trigoKg <= 0)
            return { ok: false, erro: 'Informe a quantidade de farinha (trigo_kg) ou o número de pizzas desejado.' };

        // Calcular massa total
        const somaIngG = (receita.ingredientes || [])
            .reduce((acc, ing) => acc + _normParaGramas(parseFloat(ing.valor) || 0, ing.unidade), 0);
        const massaTotalG = trigoKg * (1000 + somaIngG);
        const bolas       = Math.floor(massaTotalG / pesoBola);

        // Montar lista de insumos
        const insumos = [{ nome: 'Farinha de Trigo', quantidade: `${trigoKg} kg` }];
        for (const ing of (receita.ingredientes || [])) {
            const totalG = trigoKg * _normParaGramas(parseFloat(ing.valor) || 0, ing.unidade);
            const u = (ing.unidade || '').toLowerCase();
            let display;
            if ((u === 'g' || u === 'kg') && totalG >= 1000) {
                display = `${(totalG / 1000).toFixed(2).replace('.', ',')} kg`;
            } else if ((u === 'ml' || u === 'l') && totalG >= 1000) {
                display = `${(totalG / 1000).toFixed(2).replace('.', ',')} l`;
            } else {
                display = `${totalG.toFixed(0)} ${u === 'kg' ? 'g' : u === 'l' ? 'ml' : ing.unidade || 'g'}`;
            }
            insumos.push({ nome: ing.nome, quantidade: display });
        }

        const resumoInsumos = insumos.map(i => `• ${i.nome}: ${i.quantidade}`).join('\n');
        return {
            ok:      true,
            receita: receita.nome,
            trigo_kg:      trigoKg,
            massa_total_kg: (massaTotalG / 1000).toFixed(2),
            bolas,
            peso_bola_g:   pesoBola,
            msg: `Receita: ${receita.nome}\nFarinha: ${trigoKg} kg → ${bolas} bolas de ${pesoBola}g (${(massaTotalG/1000).toFixed(2)} kg de massa)\n\nINSUMOS:\n${resumoInsumos}`,
        };
    } catch (e) {
        return { ok: false, erro: `Erro ao calcular produção: ${e.message}` };
    }
}

// ── Ferramenta: Analisar Margens ──────────────────────────────────
function _toolAnalisarMargens({ markup_pct, porcoes }) {
    try {
        const recs = Object.values(JSON.parse(localStorage.getItem('ft_receitas') || '{}'))
            .filter(r => r.ativo !== false && r.custo_total > 0);
        if (!recs.length) return { ok: false, erro: 'Nenhuma receita ativa com custo definido na Ficha Técnica.' };

        // Tentar carregar config do simulador
        let cfgMarkup = markup_pct || 200;
        let cfgPorcoes = porcoes || 0;
        try {
            const cfg = JSON.parse(localStorage.getItem('ft_config') || 'null');
            if (cfg) {
                if (!markup_pct)  cfgMarkup  = cfg.markup_padrao    ?? 200;
                if (!porcoes)     cfgPorcoes  = cfg.porcoes_padrao   ?? 0;
            }
        } catch { /* usa defaults */ }

        const calcPreco  = (custo, mk) => custo * (1 + mk / 100);
        const calcMargem = (preco, custo) => preco > 0 ? ((preco - custo) / preco) * 100 : 0;

        // Ordenar por margem real (maior primeiro)
        const analise = recs.map(r => {
            const custo  = Number(r.custo_total) || 0;
            const preco  = calcPreco(custo, cfgMarkup);
            const margem = calcMargem(preco, custo);
            const lucro  = preco - custo;
            const custoPorcao = cfgPorcoes > 0 ? custo / cfgPorcoes : null;
            return { nome: r.nome || 'Sem nome', tamanho: r.tamanho || '', custo, preco, margem, lucro, custoPorcao };
        }).sort((a, b) => b.margem - a.margem);

        const linhas = analise.map((r, i) => {
            const emoji  = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
            const tag    = r.tamanho ? ` (${r.tamanho})` : '';
            const porcao = r.custoPorcao != null ? ` | R$${r.custoPorcao.toFixed(2)}/fatia` : '';
            return `${emoji} ${r.nome}${tag}: custo R$${r.custo.toFixed(2)} → preço R$${r.preco.toFixed(2)} | margem ${r.margem.toFixed(1)}% | lucro R$${r.lucro.toFixed(2)}${porcao}`;
        });

        const melhor = analise[0];
        const pior   = analise[analise.length - 1];
        const diffMargem = melhor.margem - pior.margem;

        return {
            ok: true,
            total_receitas: recs.length,
            markup_usado:   cfgMarkup,
            msg: [
                `📊 ANÁLISE DE MARGENS (markup ${cfgMarkup}%)`,
                '',
                ...linhas,
                '',
                `Melhor margem: ${melhor.nome} (${melhor.margem.toFixed(1)}%)`,
                diffMargem > 5 ? `⚠ Diferença de ${diffMargem.toFixed(1)}% entre melhor e pior — revise o cardápio.` : '✅ Margens equilibradas.',
            ].join('\n'),
        };
    } catch (e) {
        return { ok: false, erro: `Erro ao analisar margens: ${e.message}` };
    }
}
function _execTool(name, args) {
    switch (name) {
        case 'adicionar_item_estoque':        return _toolAdicionarItem(args);
        case 'atualizar_quantidade':          return _toolAtualizarQtd(args);
        case 'marcar_itens_compra':           return _toolMarcarCompra(args);
        case 'definir_alerta':                return _toolDefinirAlerta(args);
        case 'remover_item_estoque':          return _toolRemoverItem(args);
        case 'adicionar_item_lista':          return _toolAdicionarItemLista(args);
        case 'remover_item_lista':            return _toolRemoverItemLista(args);
        case 'definir_orcamento_lista':       return _toolDefinirOrcamentoLista(args);
        case 'transferir_marcados_para_lista':return _toolTransferirMarcadosParaLista(args);
        case 'calcular_producao':             return _toolCalcularProducao(args);
        case 'analisar_margens':              return _toolAnalisarMargens(args);
        default: return { ok: false, erro: `Ferramenta desconhecida: ${name}` };
    }
}
const _toolLabel = {
    adicionar_item_estoque:         'Adicionando ao estoque',
    atualizar_quantidade:           'Atualizando quantidade',
    marcar_itens_compra:            'Marcando para compra',
    definir_alerta:                 'Configurando alerta',
    remover_item_estoque:           'Removendo do estoque',
    adicionar_item_lista:           'Adicionando à lista de compras',
    remover_item_lista:             'Removendo da lista de compras',
    definir_orcamento_lista:        'Definindo orçamento',
    transferir_marcados_para_lista: 'Transferindo para lista de compras',
    calcular_producao:              'Calculando produção',
    analisar_margens:               'Analisando margens',
};

// ══════════════════════════════════════════════════════════════════
// STREAMING GROQ (formato OpenAI SSE)
// ══════════════════════════════════════════════════════════════════
async function _fetchOneRound(messages, onChunk, onRetry) {
    // Rate limiter client-side
    const now  = Date.now();
    const wait = MIN_REQ_GAP - (now - _lastReqTs);
    if (wait > 0) {
        await new Promise(r => setTimeout(r, wait));
        if (_abort?.signal.aborted) return { aborted: true };
    }
    _lastReqTs = Date.now();

    _abort = new AbortController();
    let res;
    try {
        res = await fetch(ENDPOINT, {
            method:  'POST',
            headers: {
                'Content-Type':  'application/json',
                'Authorization': `Bearer ${_getKey()}`,
            },
            body: JSON.stringify({
                model:       MODEL,
                messages,
                tools:       TOOLS,
                tool_choice: 'auto',
                stream:      true,
                temperature: 0.7,
                max_tokens:  1536,
            }),
            signal: _abort.signal,
        });
    } catch (e) {
        if (e.name === 'AbortError') return { aborted: true };
        // TypeError de rede pode ser: sem internet OU bloqueio CSP/CORS.
        // Distinguir pelo tipo de erro para mensagem mais útil.
        const msg = e instanceof TypeError
            ? 'Erro de conexão com a API Groq. Verifique: internet ativa, chave válida e HTTPS no servidor.'
            : `Erro inesperado: ${e.message}`;
        throw new Error(msg);
    }

    if (!res.ok) {
        let msg = `Erro ${res.status}`;
        const status = res.status;
        try {
            const j = await res.json();
            msg = j?.error?.message || msg;
        } catch { /* */ }
        if (status === 429) {
            // Lê Retry-After; fallback 15s (Groq reseta em janelas de 1 min)
            const retryAfter = parseInt(res.headers.get('Retry-After') || '0', 10);
            const waitSecs   = retryAfter > 0 ? retryAfter + 2 : 15;
            onRetry?.(`⏳ Aguardando ${waitSecs}s (limite atingido)…`);
            for (let s = waitSecs - 1; s >= 0; s--) {
                await new Promise(r => setTimeout(r, 1000));
                if (_abort?.signal.aborted) return { aborted: true };
                if (s > 0) onRetry?.(`⏳ Aguardando ${s}s (limite atingido)…`);
            }
            onRetry?.(null);
            return _fetchOneRound(messages, onChunk, onRetry);
        }
        if (status === 401) throw new Error('Chave inválida. Verifique a API Key do Groq.');
        if (status === 403) throw new Error(`API: ${msg}`);
        throw new Error(`Erro ${status}: ${msg}`);
    }

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '', fullText = '';
    // Acumula tool calls que chegam em chunks
    const toolCallsAcc = {};

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split('\n');
            buf = lines.pop() ?? '';
            for (const ln of lines) {
                if (!ln.startsWith('data: ')) continue;
                const raw = ln.slice(6).trim();
                if (raw === '[DONE]') continue;
                try {
                    const parsed = JSON.parse(raw);
                    const delta  = parsed?.choices?.[0]?.delta;
                    const finish = parsed?.choices?.[0]?.finish_reason;
                    if (!delta) continue;

                    // Texto normal
                    if (delta.content) {
                        fullText += delta.content;
                        onChunk(delta.content);
                    }

                    // Tool calls chegam em chunks — acumular por index
                    if (delta.tool_calls) {
                        for (const tc of delta.tool_calls) {
                            const idx = tc.index ?? 0;
                            if (!toolCallsAcc[idx]) {
                                toolCallsAcc[idx] = { id: '', name: '', args: '' };
                            }
                            if (tc.id)                         toolCallsAcc[idx].id   += tc.id;
                            if (tc.function?.name)             toolCallsAcc[idx].name += tc.function.name;
                            if (tc.function?.arguments != null) toolCallsAcc[idx].args += tc.function.arguments;
                        }
                    }
                } catch { /* linha malformada */ }
            }
        }
    } catch (e) {
        if (e.name === 'AbortError') return { aborted: true };
        throw new Error('Conexão interrompida.');
    }

    // Montar tool calls finais
    const toolCalls = Object.values(toolCallsAcc).filter(tc => tc.name);

    return { text: fullText, toolCalls, assistantMsg: { role: 'assistant', content: fullText || null, tool_calls: toolCalls.length ? toolCalls.map(tc => ({
        id:       tc.id || `call_${Date.now()}`,
        type:     'function',
        function: { name: tc.name, arguments: tc.args },
    })) : undefined } };
}

async function _streamWithTools(userMsg, onChunk, onDone, onError, onToolCall, onRetry) {
    if (_history.length > MAX_TURNS * 2) _history = _history.slice(-(MAX_TURNS * 2));

    const messages = [
        { role: 'system', content: _sysPrompt() },
        ..._history,
        { role: 'user', content: userMsg },
    ];

    let finalText = '';

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        let result;
        try {
            result = await _fetchOneRound(messages, onChunk, onRetry);
        } catch (e) {
            onError(e.message); return;
        }
        if (result.aborted) { onDone(''); return; }

        const { text, toolCalls, assistantMsg } = result;
        finalText += text;

        if (!toolCalls.length) {
            // Resposta final — salvar no histórico
            _history.push({ role: 'user', content: userMsg });
            _history.push({ role: 'assistant', content: finalText });
            onDone(finalText);
            return;
        }

        // Adiciona turno do assistant com tool_calls ao contexto
        messages.push(assistantMsg);

        // Executar cada tool call e adicionar respostas
        for (const tc of toolCalls) {
            let args = {};
            try { args = JSON.parse(tc.args || '{}'); } catch { /* */ }
            const toolResult = _execTool(tc.name, args);
            onToolCall(tc.name, args, toolResult);
            messages.push({
                role:         'tool',
                tool_call_id: tc.id || `call_${Date.now()}`,
                content:      JSON.stringify(toolResult),
            });
        }
    }
    onError('Limite de execuções de ferramentas atingido.');
}

// ══════════════════════════════════════════════════════════════════
// SVGs
// ══════════════════════════════════════════════════════════════════
const _svg = {
    gem: () => {
        const id = `gGrad${++_gradSeq}`;
        return `<svg class="gem-ico-gem" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
            <linearGradient id="${id}" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
                <stop offset="0%"   stop-color="#F55036"/>
                <stop offset="50%"  stop-color="#FF8C00"/>
                <stop offset="100%" stop-color="#F5A623"/>
            </linearGradient>
        </defs>
        <path d="M14 2C14 2 17 9.5 22.5 14C17 18.5 14 26 14 26C14 26 11 18.5 5.5 14C11 9.5 14 2 14 2Z" fill="url(#${id})"/>
    </svg>`;
    },
    gear: () => `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"
         stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true">
        <circle cx="10" cy="10" r="2.6"/>
        <path d="M10 2v1.4M10 16.6V18M2 10h1.4M16.6 10H18M4.05 4.05l1 1M14.95 14.95l1 1M4.05 15.95l1-1M14.95 5.05l1-1"/>
    </svg>`,
    send: () => `<svg viewBox="0 0 20 20" fill="currentColor" width="17" height="17" aria-hidden="true">
        <path d="M2 18L20 10 2 2v6.5l13 1.5-13 1.5V18z"/>
    </svg>`,
    eye: () => `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"
         stroke-linecap="round" stroke-linejoin="round" width="17" height="17" aria-hidden="true">
        <path d="M1 10s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7z"/>
        <circle cx="10" cy="10" r="2.5"/>
    </svg>`,
};

// ══════════════════════════════════════════════════════════════════
// RENDER
// ══════════════════════════════════════════════════════════════════
function _render() {
    const sec = document.getElementById('gemini-section');
    if (!sec) return;
    const ok = _hasKey();

    sec.innerHTML = `
<div class="gem-root">

    <div class="gem-topbar">
        <div class="gem-brand">
            <div class="gem-logo-wrap" aria-hidden="true">${_svg.gem()}</div>
            <div>
                <div class="gem-brand-name">Assistente IA</div>
                <div class="gem-brand-sub">Groq · Llama 3.3 70B</div>
            </div>
        </div>
        <button class="gem-icon-btn" id="gem-cfg-btn"
                aria-label="Configurações" title="Configurações">
            ${_svg.gear()}
        </button>
    </div>

    <div class="gem-chat" id="gem-chat" role="log" aria-live="polite" aria-label="Conversa com IA">
        ${ok ? _htmlWelcome() : _htmlOnboard()}
    </div>

    <div class="gem-chips" id="gem-chips" ${!ok ? 'hidden' : ''}>
        ${_suggestions().map(s =>
            `<button class="gem-chip" data-p="${_esc(s.t)}">
                <span aria-hidden="true">${s.e}</span>
                <span>${_esc(s.t)}</span>
            </button>`
        ).join('')}
    </div>

    <div class="gem-input-bar" ${!ok ? 'hidden' : ''}>
        <div class="gem-input-wrap" id="gem-input-wrap">
            <textarea id="gem-ta" class="gem-ta"
                placeholder="Pergunte sobre seu estoque…"
                rows="1" maxlength="2000"
                autocomplete="off" autocorrect="off"
                autocapitalize="sentences" spellcheck="false"
                aria-label="Mensagem para o assistente"
            ></textarea>
        </div>
        <button class="gem-send-btn" id="gem-send-btn" aria-label="Enviar mensagem" disabled>
            ${_svg.send()}
        </button>
    </div>

    <div class="gem-sheet-overlay hidden" id="gem-overlay"
         role="dialog" aria-modal="true" aria-label="Configurar IA">
        <div class="gem-sheet" id="gem-sheet">
            <div class="gem-sheet-handle" aria-hidden="true"></div>
            <div class="gem-sheet-header">
                <span class="gem-sheet-title">${_svg.gear()} Configurar IA</span>
                <button class="gem-icon-btn" id="gem-sheet-close" aria-label="Fechar">✕</button>
            </div>
            <div class="gem-sheet-body">
                <p class="gem-sheet-hint">
                    Crie sua chave gratuita em
                    <a href="https://console.groq.com/keys"
                       target="_blank" rel="noopener" class="gem-link">console.groq.com/keys</a>
                    e cole abaixo. A chave fica salva <strong>só neste dispositivo</strong>.
                </p>
                <div class="gem-key-row">
                    <input type="password" id="gem-key-inp" class="gem-key-inp"
                        placeholder="gsk_…" autocomplete="off" spellcheck="false"
                        aria-label="API Key do Groq"
                        value="${_esc(_getKey())}">
                    <button class="gem-icon-btn" id="gem-key-eye" aria-label="Mostrar/ocultar chave">
                        ${_svg.eye()}
                    </button>
                </div>
                <div class="gem-sheet-actions">
                    <button class="gem-btn-ghost" id="gem-key-cancel">Cancelar</button>
                    ${ok ? `<button class="gem-btn-danger" id="gem-key-del">Remover</button>` : ''}
                    <button class="gem-btn-primary" id="gem-key-save">Salvar</button>
                </div>
                ${ok ? `<button class="gem-btn-ghost gem-hist-btn" id="gem-hist-clear">
                    Limpar histórico da conversa
                </button>` : ''}
            </div>
        </div>
    </div>

</div>`;

    _bind();
}

function _htmlWelcome() {
    return `<div class="gem-welcome" id="gem-welcome">
        <div class="gem-hero-ico" aria-hidden="true">${_svg.gem()}</div>
        <h2 class="gem-welcome-h">Como posso ajudar?</h2>
        <p class="gem-welcome-p">Analiso seu estoque, executo ações no app, calculo receitas e sugiro compras.</p>
    </div>`;
}
function _htmlOnboard() {
    return `<div class="gem-onboard" id="gem-onboard">
        <div class="gem-hero-ico" aria-hidden="true">${_svg.gem()}</div>
        <h2 class="gem-onboard-h">IA para sua pizzaria</h2>
        <ul class="gem-onboard-list">
            <li><span aria-hidden="true">📊</span><span>Análise do estoque em tempo real</span></li>
            <li><span aria-hidden="true">⚡</span><span>Executa ações diretamente no app</span></li>
            <li><span aria-hidden="true">🍕</span><span>Sugere receitas e calcula proporções</span></li>
            <li><span aria-hidden="true">💡</span><span>Análise de margens e previsão de compras</span></li>
        </ul>
        <p class="gem-onboard-cta">Configure sua API Key gratuita do Groq para começar.</p>
        <button class="gem-btn-primary" id="gem-onboard-cfg"
            style="margin-top:8px;width:100%;max-width:280px;height:48px;border-radius:13px;font-size:16px;font-weight:700;border:none;cursor:pointer;background:var(--accent-primary);color:#fff;">
            Configurar API Key
        </button>
    </div>`;
}

// ══════════════════════════════════════════════════════════════════
// BIND
// ══════════════════════════════════════════════════════════════════
function _bind() {
    const ta      = document.getElementById('gem-ta');
    const sendBtn = document.getElementById('gem-send-btn');

    ta?.addEventListener('input', () => {
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
        if (sendBtn) sendBtn.disabled = !ta.value.trim() || _streaming;
    });
    ta?.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _send(); }
    });
    sendBtn?.addEventListener('click', _send);

    document.querySelectorAll('.gem-chip').forEach(c =>
        c.addEventListener('click', () => {
            darFeedback();
            if (ta) { ta.value = c.dataset.p; ta.dispatchEvent(new Event('input')); }
            _send();
        })
    );

    document.getElementById('gem-cfg-btn')?.addEventListener('click',     () => { darFeedback(); _openSheet(); });
    document.getElementById('gem-onboard-cfg')?.addEventListener('click', () => { darFeedback(); _openSheet(); });
    document.getElementById('gem-sheet-close')?.addEventListener('click', _closeSheet);
    document.getElementById('gem-overlay')?.addEventListener('click', e => {
        if (e.target === document.getElementById('gem-overlay')) _closeSheet();
    });
    _swipeSheet();

    let _keyVisible = false;
    document.getElementById('gem-key-eye')?.addEventListener('click', () => {
        const inp = document.getElementById('gem-key-inp');
        if (!inp) return;
        _keyVisible = !_keyVisible;
        inp.type = _keyVisible ? 'text' : 'password';
    });

    document.getElementById('gem-key-save')?.addEventListener('click', () => {
        const v = document.getElementById('gem-key-inp')?.value.trim();
        if (!v || v.length < 10) { mostrarToast('Chave inválida.', 'erro'); return; }
        _saveKey(v);
        mostrarToast('Chave salva!', 'sucesso');
        darFeedback();
        _closeSheet();
        setTimeout(_render, 360);
    });

    document.getElementById('gem-key-del')?.addEventListener('click', () => {
        _delKey();
        _history = [];
        mostrarToast('Chave removida.', 'aviso');
        _closeSheet();
        setTimeout(_render, 360);
    });

    document.getElementById('gem-key-cancel')?.addEventListener('click', _closeSheet);

    document.getElementById('gem-hist-clear')?.addEventListener('click', () => {
        _history = [];
        mostrarToast('Conversa limpa.', 'aviso');
        darFeedback();
        if (_streaming) { _abort?.abort(); _streaming = false; }
        _closeSheet();
        setTimeout(_render, 360);
    });
}

function _openSheet() {
    const ov = document.getElementById('gem-overlay');
    if (!ov) return;
    ov.classList.remove('hidden');
    requestAnimationFrame(() => requestAnimationFrame(() => ov.classList.add('open')));
    setTimeout(() => document.getElementById('gem-key-inp')?.focus(), 380);
}
function _closeSheet() {
    const ov = document.getElementById('gem-overlay');
    if (!ov) return;
    ov.classList.remove('open');
    setTimeout(() => ov.classList.add('hidden'), 360);
}
function _swipeSheet() {
    const sheet = document.getElementById('gem-sheet');
    if (!sheet) return;
    let y0 = 0;
    sheet.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; }, { passive: true });
    sheet.addEventListener('touchmove',  e => {
        const dy = e.touches[0].clientY - y0;
        if (dy > 0) sheet.style.transform = `translateY(${dy}px)`;
    }, { passive: true });
    sheet.addEventListener('touchend', e => {
        sheet.style.transform = '';
        if (e.changedTouches[0].clientY - y0 > SHEET_DRAG_THRESHOLD) _closeSheet();
    });
}

// ══════════════════════════════════════════════════════════════════
// SEND
// ══════════════════════════════════════════════════════════════════
function _send() {
    const ta  = document.getElementById('gem-ta');
    const msg = ta?.value.trim();
    if (!msg || _streaming) return;
    _sendMsg(msg, true);
}

function _sendMsg(msg, showUser = true) {
    if (_streaming) return;
    darFeedback();

    const ta = document.getElementById('gem-ta');
    if (ta) { ta.value = ''; ta.style.height = 'auto'; }

    const btn = document.getElementById('gem-send-btn');
    if (btn) btn.disabled = true;

    document.getElementById('gem-welcome')?.remove();
    document.getElementById('gem-onboard')?.remove();

    const chips = document.getElementById('gem-chips');
    if (chips) chips.style.opacity = '0.35';

    if (showUser) _appendUser(msg);
    const bid = `gem-bot-${Date.now()}`;
    _appendBot(bid);

    _streaming = true;

    _streamWithTools(
        msg,
        chunk => {
            const el = document.getElementById(`${bid}-txt`);
            if (!el) return;
            el.dataset.raw = (el.dataset.raw || '') + chunk;
            el.innerHTML   = _md(el.dataset.raw);
            _scroll();
        },
        () => {
            _streaming = false;
            _doneBot(bid);
            const b = document.getElementById('gem-send-btn');
            const t = document.getElementById('gem-ta');
            if (b) b.disabled = !(t?.value.trim());
            const ch = document.getElementById('gem-chips');
            if (ch) ch.style.opacity = '1';
            _scroll();
        },
        err => {
            _streaming = false;
            _errBot(bid, err);
            const b = document.getElementById('gem-send-btn');
            const t = document.getElementById('gem-ta');
            if (b) b.disabled = !(t?.value.trim());
            const ch = document.getElementById('gem-chips');
            if (ch) ch.style.opacity = '1';
        },
        (toolName, toolArgs, toolResult) => {
            _appendToolFeedback(bid, toolName, toolArgs, toolResult);
        },
        retryMsg => {
            const el = document.getElementById(`${bid}-retry`);
            if (!el) return;
            if (retryMsg === null) { el.style.display = 'none'; el.textContent = ''; }
            else                   { el.style.display = 'block'; el.textContent = retryMsg; }
            _scroll();
        },
    );
}

// ── Chat DOM helpers ──────────────────────────────────────────────
function _appendUser(text) {
    const chat = document.getElementById('gem-chat');
    if (!chat) return;
    const d = document.createElement('div');
    d.className = 'gem-msg gem-msg-user';
    d.innerHTML = `<div class="gem-bubble gem-bubble-user">${_esc(text)}</div>`;
    chat.appendChild(d);
    _scroll();
}

function _appendBot(id) {
    const chat = document.getElementById('gem-chat');
    if (!chat) return;
    const d = document.createElement('div');
    d.className = 'gem-msg gem-msg-bot';
    d.id        = id;
    d.innerHTML = `
        <div class="gem-bubble gem-bubble-bot">
            <div class="gem-tool-list" id="${id}-tools"></div>
            <div class="gem-bot-txt" id="${id}-txt" data-raw=""></div>
            <div class="gem-retry-msg" id="${id}-retry" style="display:none"></div>
            <div class="gem-typing" id="${id}-spin" aria-label="Digitando">
                <span></span><span></span><span></span>
            </div>
            <div class="gem-stop-row" id="${id}-stop">
                <button class="gem-stop-btn" id="${id}-stop-btn" aria-label="Parar geração">
                    ⏹ Parar
                </button>
            </div>
        </div>`;
    chat.appendChild(d);
    document.getElementById(`${id}-stop-btn`)?.addEventListener('click', () => {
        _abort?.abort(); darFeedback();
    });
    _scroll();
}

function _appendToolFeedback(bid, name, args, result) {
    const wrap = document.getElementById(`${bid}-tools`);
    if (!wrap) return;
    const chip = document.createElement('div');
    const ok   = result.ok !== false;
    chip.className  = `gem-tool-chip ${ok ? 'gem-tool-ok' : 'gem-tool-err'}`;
    chip.innerHTML  = `<span>${ok ? '⚡' : '⚠'} ${_esc(_toolLabel[name] || name)}</span>`;
    chip.innerHTML += `<span class="gem-tool-result">${_esc(result.msg || result.erro || '')}</span>`;
    wrap.appendChild(chip);
    _scroll();
}

function _doneBot(id) {
    document.getElementById(`${id}-spin`)?.remove();
    document.getElementById(`${id}-stop`)?.remove();
    const bubble = document.querySelector(`#${id} .gem-bubble-bot`);
    if (!bubble) return;
    const txt = document.getElementById(`${id}-txt`)?.dataset.raw || '';
    if (!txt) return;
    const btn = document.createElement('button');
    btn.className   = 'gem-copy-btn';
    btn.textContent = 'Copiar';
    btn.setAttribute('aria-label', 'Copiar resposta');
    btn.addEventListener('click', () => {
        navigator.clipboard?.writeText(txt)
            .then(() => { btn.textContent = '✓ Copiado'; setTimeout(() => btn.textContent = 'Copiar', 2200); })
            .catch(() => mostrarToast('Não foi possível copiar.', 'aviso'));
        darFeedback();
    });
    bubble.appendChild(btn);
}

function _errBot(id, msg) {
    const el = document.getElementById(`${id}-txt`);
    if (el) el.innerHTML = `<span class="gem-err-txt">⚠ ${_esc(msg)}</span>`;
    document.getElementById(`${id}-spin`)?.remove();
    document.getElementById(`${id}-stop`)?.remove();
}

function _scroll() {
    const c = document.getElementById('gem-chat');
    if (c) requestAnimationFrame(() => { c.scrollTop = c.scrollHeight; });
}

// ── Ajuste de altura ──────────────────────────────────────────────
function _ajustarAltura() {
    const sec = document.getElementById('gemini-section');
    if (!sec) return;
    const nav = document.getElementById('nav-tabs-panel');
    const navBottom  = nav ? Math.max(0, nav.getBoundingClientRect().bottom) : 188;
    const safeBottom = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue('--sab') || '0'
    ) || 0;
    sec.style.height = Math.max(300, window.innerHeight - navBottom - safeBottom) + 'px';
}

// ══════════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════════
export function iniciarGemini() {
    _render();

    document.addEventListener('tabChanged', e => {
        if (e.detail?.tab !== 'gemini') return;
        requestAnimationFrame(_ajustarAltura);
        if (!_briefingShown) _briefingShown = true;
    });

    const _onResize = () => {
        if (document.getElementById('gemini-section')?.classList.contains('active')) {
            requestAnimationFrame(_ajustarAltura);
        }
    };
    window.addEventListener('resize',            _onResize, { passive: true });
    window.addEventListener('orientationchange', _onResize, { passive: true });
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', _onResize, { passive: true });
    }
}
