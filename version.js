// version.js — StockFlow Pro
// ══════════════════════════════════════════════════════════════════
// Fonte única de verdade para a versão do aplicativo.
//
// PROBLEMA ANTERIOR (v9.8.0 → v10.0.0):
//   VERSAO_ATUAL estava hardcoded em main.js como '9.8.0' enquanto
//   sw.js já usava '10.0.0'. exportarTodosSnapshots() em storage.js
//   também tinha '9.8.0' literal. Toda release exigia atualização manual
//   em 4+ lugares, causando desincronização silenciosa documentada no CHANGELOG.
//
// SOLUÇÃO:
//   Esta constante é o único lugar a ser editado a cada release.
//   Importada por main.js e storage.js. sw.js mantém VERSION própria
//   (Service Workers clássicos não suportam ES modules nativamente),
//   mas deve ser mantida em sincronia manualmente — apenas 1 edição necessária.
// ══════════════════════════════════════════════════════════════════

export const VERSION = '10.3.1';
