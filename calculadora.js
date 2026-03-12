// calculadora.js — StockFlow Pro v10.0.0
// ══════════════════════════════════════════════════════════════════
// CORREÇÕES APLICADAS
// ══════════════════════════════════════════════════════════════════
// BUG #1 — Function() constructor é equivalente a eval()
//   PROBLEMA : _avaliarExpressao usava Function('"use strict"; return (' + expr + ')')()
//              Embora a whitelist de caracteres reduzisse o risco, Function() ainda
//              executa código JS arbitrário e é bloqueado por CSP com
//              'unsafe-eval'. Em PWAs com Content Security Policy rigorosa,
//              isso causa exceção e a calculadora para de funcionar.
//   CORREÇÃO : Parser aritmético recursivo descente puro — sem eval, sem Function,
//              sem dependências. Suporta +, -, *, /, parênteses e decimais.
//
// BUG #2 — .innerText em calc-title e calc-display
//   PROBLEMA : .innerText força reflow de layout para texto simples.
//   CORREÇÃO : .textContent para todos os campos de texto da calculadora.
// ══════════════════════════════════════════════════════════════════

import { darFeedback } from './utils.js';
import { mostrarToast } from './toast.js';
import { salvarDados } from './storage.js';
import { coletarDadosDaTabela } from './tabela.js';
import { verificarAlertas } from './alerta.js';

let inputCalculadoraAtual = null;
let expressaoCalc = '';

export function abrirCalculadora(inputElement) {
    darFeedback();
    inputElement.blur();
    inputCalculadoraAtual = inputElement;

    let titulo = 'Calculadora';
    if (inputElement.id === 'novoQtd') {
        const nomeNovo = document.getElementById('novoProduto')?.value.trim();
        titulo = nomeNovo || 'Novo Item';
    } else {
        const linha = inputElement.closest('tr');
        if (linha) {
            // BUG FIX #2: textContent em vez de innerText.
            titulo = linha.querySelector('.nome-prod')?.textContent.trim() || titulo;
        }
    }

    // BUG FIX #2: textContent em vez de innerText.
    document.getElementById('calc-title').textContent = '🧮 ' + titulo;
    const val = inputElement.value.replace(',', '.').trim();
    expressaoCalc = val || '';
    atualizarDisplayCalc();
    document.getElementById('modal-calc').style.display = 'flex';
}

export function fecharCalculadora() {
    darFeedback();
    document.getElementById('modal-calc').style.display = 'none';
    inputCalculadoraAtual = null;
}

export function calcDigito(digito) {
    darFeedback();
    if (digito === 'C') {
        expressaoCalc = '';
    } else if (digito === 'BACK') {
        expressaoCalc = expressaoCalc.slice(0, -1);
    } else {
        // FIX v10.0.0: '%' é aceito como sufixo de porcentagem (ex: 800 * 15%)
        // A vírgula é convertida para '.' internamente para o parser.
        expressaoCalc += (digito === ',') ? '.' : digito;
    }
    atualizarDisplayCalc();
}

function atualizarDisplayCalc() {
    // BUG FIX #2: textContent em vez de innerText.
    document.getElementById('calc-display').textContent =
        expressaoCalc.replace(/\./g, ',') || '0';
}

// ── BUG FIX #1: Parser aritmético recursivo descente ─────────────
// Gramática:
//   expr    → term   (('+' | '-') term)*
//   term    → factor (('*' | '/') factor)*
//   factor  → NUMBER | '(' expr ')' | '-' factor
//
// Não usa eval nem Function(). Seguro para qualquer CSP.
function _avaliarExpressao(expr) {
    const src = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/\s+/g, '');
    let pos = 0;

    function peek()    { return src[pos]; }
    function consume() { return src[pos++]; }

    function parseNumber() {
        let start = pos;
        if (peek() === '-') consume();
        while (pos < src.length && /[\d.]/.test(src[pos])) consume();
        const token = src.slice(start, pos);
        const n = parseFloat(token);
        if (isNaN(n)) throw new Error('Token inválido: ' + token);
        // FIX v10.0.0: suporte a operador '%' como sufixo de porcentagem.
        // Uso: 800 * 15% → 800 * 0.15 = 120. Útil para cálculos de desconto,
        // overhead e proporções de receita (ex: hidratação 60% do trigo).
        if (peek() === '%') { consume(); return n / 100; }
        return n;
    }

    function parseFactor() {
        if (peek() === '(') {
            consume(); // '('
            const val = parseExpr();
            if (peek() !== ')') throw new Error('Parêntese não fechado');
            consume(); // ')'
            return val;
        }
        // Unário negativo
        if (peek() === '-') {
            consume();
            return -parseFactor();
        }
        return parseNumber();
    }

    function parseTerm() {
        let left = parseFactor();
        while (pos < src.length && (peek() === '*' || peek() === '/')) {
            const op = consume();
            const right = parseFactor();
            if (op === '/' && right === 0) throw new Error('Divisão por zero');
            left = op === '*' ? left * right : left / right;
        }
        return left;
    }

    function parseExpr() {
        let left = parseTerm();
        while (pos < src.length && (peek() === '+' || peek() === '-')) {
            const op = consume();
            const right = parseTerm();
            left = op === '+' ? left + right : left - right;
        }
        return left;
    }

    const result = parseExpr();
    if (pos !== src.length) throw new Error('Expressão inválida');
    return result;
}
// ─────────────────────────────────────────────────────────────────

export function calcSalvar() {
    darFeedback();
    try {
        const expr = expressaoCalc.replace(/×/g, '*').replace(/÷/g, '/');
        if (expr.trim()) {
            let resultado = _avaliarExpressao(expr);
            if (!isFinite(resultado)) throw new Error('Resultado inválido');
            resultado = Math.round(resultado * 100) / 100;
            inputCalculadoraAtual.value = resultado.toString().replace('.', ',');
        } else {
            inputCalculadoraAtual.value = '';
        }
        const dados = coletarDadosDaTabela();
        salvarDados(dados);
        fecharCalculadora();
        mostrarToast('Quantidade salva');
        verificarAlertas();
    } catch (e) {
        // BUG FIX #2: textContent em vez de innerText.
        document.getElementById('calc-display').textContent = 'Erro';
        setTimeout(atualizarDisplayCalc, 1000);
    }
}

export function getInputCalculadoraAtual() {
    return inputCalculadoraAtual;
}