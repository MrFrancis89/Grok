// ft-calc.js — v3.0
export function calcCustoUnitario(precoCompra, qtdEmbalagem) {
    if (!qtdEmbalagem || qtdEmbalagem <= 0) return 0;
    return precoCompra / qtdEmbalagem;
}
export function calcCustoIngrediente(quantidade, custoUnitario) {
    return quantidade * custoUnitario;
}
export function calcCustoReceita(ingredientes) {
    if (!Array.isArray(ingredientes)) return 0;
    return ingredientes.reduce((s, i) => s + (i.custo || 0), 0);
}
// feat 9: overhead (%) + mão de obra (R$ fixo/pizza)
export function calcCustoEfetivo(custoIng, overheadPct = 0, maoDeObra = 0) {
    return custoIng * (1 + Math.max(0, overheadPct) / 100) + Math.max(0, maoDeObra);
}
// feat 4: custo por fatia
export function calcCustoPorcao(custoTotal, porcoes) {
    if (!porcoes || porcoes <= 0) return 0;
    return custoTotal / porcoes;
}
export function calcPrecoMarkup(custo, markupPercent) {
    return custo * (1 + markupPercent / 100);
}
export function calcPrecoMargem(custo, margemPercent) {
    const m = margemPercent / 100;
    if (m >= 1) return 0;
    return custo / (1 - m);
}
export function calcLucro(preco, custo) { return preco - custo; }
export function calcMargemReal(preco, custo) {
    if (!preco || preco <= 0) return 0;
    return ((preco - custo) / preco) * 100;
}
export function calcMarkupImplicito(preco, custo) {
    if (!custo || custo <= 0) return 0;
    return ((preco - custo) / custo) * 100;
}
export function calcRendimento(qtdEmbalagem, qtdPorPizza) {
    if (!qtdPorPizza || qtdPorPizza <= 0) return 0;
    return qtdEmbalagem / qtdPorPizza;
}
// feat 2: variação de preço para histórico
export function calcVariacaoPreco(precoAtual, precoAnterior) {
    if (!precoAnterior || precoAnterior <= 0) return 0;
    return ((precoAtual - precoAnterior) / precoAnterior) * 100;
}
