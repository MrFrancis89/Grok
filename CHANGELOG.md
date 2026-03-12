## v10.0.0 — 10/03/2026 — Apple HIG Premium Overlay

### Novo arquivo: apple-premium-v10.css (998 linhas · 15 layers)

Overlay CSS puro adicionado **após** todos os arquivos existentes.
Não altera nenhum token existente — apenas estende com especificidade mínima.
Compatível com todos os 4 temas (Dark Premium, Midnight OLED, Arctic Silver, Deep Forest).

**Novos Design Tokens**
- 4 curvas spring physics: `--spring-snappy`, `--spring-gentle`, `--spring-bounce`, `--ease-decel`
- 5 durações semânticas: `--dur-instant` (80ms) a `--dur-reveal` (540ms)
- 6 níveis de elevação: `--elev-0` a `--elev-5` (sombras calibradas por tema)
- Z-index semântico: `--z-base`, `--z-raised`, `--z-overlay`, `--z-sheet`, `--z-modal`, `--z-top`
- Gradientes: `--grad-accent`, `--grad-danger`, `--grad-success`, `--grad-gold`
- Vibrancy: `--vibrancy-bg`, `--vibrancy-border` (adaptados por tema)

**Componentes novos (classes `.ap-*`)**
- `.ap-seg-ctrl` — Segmented Control com thumb CSS deslizante (iOS nativo simulado)
- `.ap-sheet-overlay` + `.ap-sheet` — Bottom Sheet com glassmorphism, handle, safe area
- `.ap-pill-*` — 5 variantes de status pill com dot colorido
- `.ap-badge` — Badge numérico com pop animation
- `.ap-progress` + `.ap-progress-fill` — Progress bar com 3 variantes de cor
- `.ap-skeleton` — Shimmer loading state
- `.ap-inset-group` — Grouped UITableView style
- `.ap-disclosure-row` — Settings.app disclosure row

**Micro-interações automáticas (sem JS)**
- Checkboxes da tabela: spring bounce + animação do checkmark
- Linhas da tabela: entrada staggerada (até 12 filhos) + hover lift desktop
- Headers de categoria: slide-in da esquerda
- Linha marcada: gradiente lateral azul + borda accent
- Modais existentes: `modalEnter` spring (sem alterar o HTML)
- Modais Ficha Técnica: bottom sheet `sheetEnter`
- Tabs nav: indicador de linha no topo com glow
- FAB + btn-novo-dia: glow pulsante 3s loop
- Toast: `toastIn` spring

**Acessibilidade**
- `@media (prefers-reduced-motion)` completo — desativa todas as animações

### Arquivos modificados
- `index.html` — `<link>` para `apple-premium-v10.css` adicionado; título → v10.0.0
- `ficha-tecnica.html` — `<link>` para `apple-premium-v10.css` adicionado
- `sw.js` — `apple-premium-v10.css` adicionado a `ASSETS`; VERSION → `10.0.0`; CACHE → `stockflow-v10-0-0`
- `manifest.json` — version → `10.0.0`; description atualizada

### Novo arquivo de documentação
- `DESIGN-GUIDE-v10.md` — Guia completo de cores, tipografia, motion, componentes HTML e checklist Apple HIG

### Versão: v9.8.2 → v10.0.0

---

## v9.7.4 — 03/03/2026 — Correcoes de Bugs e Consistencia de Versao

### Bugs corrigidos

**exportarJSON e agendarSnapshot**: substituidos localStorage direto por funcoes de storage.js com fallback.
**Listeners blur duplicados**: unificados em handler unico em main.js.
**Versoes inconsistentes**: todos os arquivos alinhados para v9.7.4, cache SW atualizado.
**Melhorias**: null-guard documentado em listafacil.js, dataset documentado em producao.js.

### Versao: v9.7.3 -> v9.7.4

---

## v9.7.3 — 02/03/2026 — Produção, Lista Fácil e Compatibilidade Safari

### 1. Aba Produção — Identificação da receita em "Configurar Produção"
- O card de cada receita agora exibe o **nome em destaque** (badge verde) acima dos campos Trigo/Bola.
- Layout reestruturado: vertical (nome → inputs) em vez de grid horizontal de 3 colunas — muito mais legível em telas pequenas.
- Labels renomeados para "Trigo (kg)" e "Peso bola (g)" para maior clareza.
- CSS: `.prod-config-row--card` com `border-radius`, fundo diferenciado, `.prod-config-nome-badge` com borda accent.

### 2. Lista Fácil — Nomes e preços não truncados
- `table-layout` trocado de `fixed` para `auto`: o navegador distribui as colunas de acordo com o conteúdo.
- Coluna de nome: `word-break: break-word; white-space: normal` — nomes longos quebram linha.
- Colunas numéricas com `min-width` garantido (preço 68px, qtd 40px, total 64px, delete 36px).
- `font-size: 16px` nos inputs de preço e quantidade (evita zoom + melhora legibilidade).

### 3. Remoção da aba Histórico da Lista Fácil
- Aba "📈 Histórico" removida da Lista Fácil por solicitação.
- Imports de `carregarHistoricoCompleto`, `limparHistoricoItem` e `limparTodoHistorico` removidos de `listafacil.js` (função `registrarPrecoHistorico` mantida — histórico ainda é gravado e pode ser restaurado futuramente).
- Funções `configurarHistorico()`, `renderHistorico()` e `sparklineSVG()` removidas.

### 4. Compatibilidade total com Safari iOS
**Prevenção de zoom em inputs** (Safari faz zoom em qualquer input < 16px):
- `.lf-preco-input`: 13px → 16px
- `.lf-qtd-input`: 14px → 16px
- `.modal-input`: 15px → 16px
- `.select-tabela`: 15px → 16px
- `.lf-hist-busca`: 14px → 16px
- `.prod-input` (massa-extra.css): 15px → 16px
- Guard universal `@supports (-webkit-touch-callout: none)` → `font-size: max(16px, 1em)` em todos os inputs restantes.

**Prevenção de rolagem/bounce indesejados:**
- `html, body { overscroll-behavior: none }` — elimina o bounce vertical do iOS.
- Containers internos (`#app-root`, `.tab-content`) com `overscroll-behavior-y: contain` — scroll interno sem propagar para body.
- `-webkit-overflow-scrolling: touch` nos containers de lista para scroll fluido com momentum.

**Outros fixes Safari:**
- `body.modal-open { position: fixed }` — bloqueia scroll de fundo quando modal está aberto.
- Elementos `position: fixed` (lupa, FAB, setas) com `translateZ(0)` para evitar desaparecimento ao rolar no Safari.
- Safe area (`env(safe-area-inset-bottom)`) para notch e home indicator do iPhone.
- `-webkit-user-select: none` no container de swipe (evita seleção acidental ao arrastar).

### Versão
- v9.7.2 → v9.7.3 (todos os arquivos JS, massa-extra.css, style.css, sw.js, manifest.json)

---

## v9.7.2 — 02/03/2026 — Correções de Bugs e Consistência de Versão

### Bugs corrigidos

**[BUG] `listafacil.js` — `avaliarExpr.parseFactor` consumia `)` sem validar**
- `parseFactor` chamava `consume()` cegamente ao fechar parêntese.
  Uma expressão como `(1+2` consumiria o próximo caractere silenciosamente, produzindo resultado incorreto.
- Fix: guard `if (peek() !== ')') throw new Error('parêntese não fechado')` adicionado antes do consume.
  Idêntico ao fix já aplicado em `calculadora.js` v9.4.0.

**[BUG] `listafacil.js` + `massa.js` — imports duplicados do mesmo módulo**
- `darFeedback` e `copiarParaClipboard` eram importados em dois `import` separados de `./utils.js`.
- Fix: unificados em `import { darFeedback, copiarParaClipboard } from './utils.js'`.

**[BUG] `listafacil.js` — `.slice()` redundante em `renderHistorico`**
- `keys` já é um novo array produzido por `.filter()`. O `.slice()` criava cópia desnecessária.
- Fix: `keys.sort().forEach(...)` — sem `.slice()`.

**[BUG] Inconsistências de versão em todo o projeto**
- `listafacil.js` declarava `v9.9.0` (versão futura inexistente).
- `massa.js`, `idb.js`, `storage.js` declaravam `v9.8.0` (idem).
- `sw.js` usava `CACHE_NAME = 'stockflow-v9-7-1'` — usuários com SW antigo não recebiam cache atualizado.
- `storage.js` embutia `versao: '9.7.1'` nos backups exportados.
- `manifest.json` campo `description` ainda dizia `v9.7.1`.
- Fix: todos os arquivos alinhados para `v9.7.2`; cache bumpeado para `stockflow-v9-7-2`.

### Versão
- v9.7.1 → v9.7.2 (todos os arquivos JS, sw.js, manifest.json)

---

# Changelog — StockFlow Pro

## v9.7.0 — 02/03/2026 — Destaque de Elementos Flutuantes + Fix Lupa

### Correções
- **FIX CRÍTICO:** Lupa de busca parou de funcionar — classe `.search-open` não tinha regra CSS correspondente. Adicionada a regra faltante + overlay trocado de `position:absolute` para `position:fixed` (desaparecia com scroll).
- **FIX:** Lupa não respondia a click no desktop — adicionado listener `click` + `pointerdown` para fechar ao tocar fora.
- Reescrita da função `iniciarLupa()` com lógica de toggle robusta (`abrirBusca` / `fecharBusca` / `toggleBusca`).

### Melhorias Visuais
- **Lupa, setas (↑↓) e FAB:** Trocado `var(--glass-bg)` (quase transparente no dark) por `var(--surface-2)` com borda `rgba(255,255,255,0.20)` — visíveis em todos os temas sem perder estética Apple.
- Sombra dos flutuantes reforçada: `0 6px 24px rgba(0,0,0,0.60)`.
- Overrides por tema: Arctic usa fundo branco + borda escura; Forest usa tinge verde.
- FAB da Lista Fácil: sombra extra `0 4px 16px rgba(0,0,0,0.45)` para destacar sobre fundo verde escuro.

### Versão
- Versão: v9.6.0 → v9.7.0 (style.css, index.html, manifest.json, sw.js, main.js)

## v9.6.0 — 28/02/2026 — Histórico Global de Preços

### Nova funcionalidade — Aba Histórico (Lista Fácil v2.6.0)
- **Aba "📈 Histórico"** adicionada à Lista Fácil, entre as abas Lista e Comparador.
- Painel completo com um card por produto que já teve preço registrado.
- Cada card exibe: nome do produto, último preço, mínimo e máximo históricos, tendência em %, sparkline expandida (120px) e chips de data com o valor de cada registro.
- **Busca em tempo real** por nome de produto dentro do histórico.
- **Limpar por produto** — botão ✕ em cada card abre confirmação antes de apagar.
- **Limpar tudo** — botão visível apenas quando há dados; abre confirmação antes de apagar.

### storage.js
- `carregarHistoricoCompleto()` — retorna o objeto completo `{ chave: [{d,v},...] }`.
- `limparHistoricoItem(nomeItem)` — remove o histórico de um produto específico.
- `limparTodoHistorico()` — apaga todo o histórico de preços.
- `mesclarHistorico(historicoExterno)` — mescla histórico importado com o local, deduplicando por data e respeitando o limite de pontos. Útil para restauração de snapshots.
- Limite de pontos por produto aumentado de 6 para 10 (`MAX_HIST`).

### Outros
- sw.js: cache atualizado para `stockflow-v9-6`.
- manifest.json: versão atualizada para v9.6.0.
- Versão: v9.5.0 → v9.6.0

---

## v9.4.0 — 28/02/2026 — Correcoes de Bugs

### Bugs criticos corrigidos

**[CRITICO] mostrarAlertaElegante disparava callback destrutivo anterior**
- toast.js usava window.acaoConfirmacao = null, que nao afetava a variavel de escopo de modulo privada em confirm.js.
- Fix: mostrarAlertaElegante migrada para confirm.js. toast.js simplificado.

**[CRITICO] Dependencia circular utils -> toast -> utils -> confirm resolvida**
- utils.js agora importa mostrarAlertaElegante de confirm.js, nao de toast.js.

**[MAJOR] FOUC — flash do tema escuro ao carregar com tema salvo**
- Script inline no head aplica classe ao html antes do primeiro render.
- aplicarTema() limpa as classes do html apos aplica-las ao body.

**[MAJOR] Trocas de aba nao faziam scroll para o topo — corrigido em navegacao.js**

### Melhorias de tema
- Arctic Silver: btn-star escurecido para #C07000 (contraste 4.6:1 sobre branco).
- Modal inputs: classe .modal-input com tokens de tema corretos.
- 18 inline styles migrados para classes CSS puras.

### Aba Massa
- Migracao automatica da chave de storage legada massaMasterBase -> massaMasterBase_v1.

### Outros
- sw.js: cache stockflow-v9-4.
- confirm.js: botoes usam className (.perigo/.sucesso/.alerta) nao style.backgroundColor.

---

## v9.3.0 — 28/02/2026
### Novas funcionalidades
- **Aba Massa Master** — calculadora proporcional de receita de pizza.
  - Receita base editável (açúcar, sal, fermento, óleo, água) por 1 kg de trigo.
  - Resultados em tempo real ao digitar a quantidade de trigo.
  - Botão "Copiar Receita" envia o texto formatado para o clipboard.
  - Botão "Padrão" restaura os valores de fábrica.
  - Base salva automaticamente no localStorage (chave `massaMasterBase_v1`).
- Atalho PWA "Massa Master" adicionado ao manifest.json.

### Correções de bugs
- **Bug crítico de temas** — `TEMA_ALIAS` mapeava `'escuro': ''`, fazendo `findIndex` retornar `-1` e o ciclo de 4 temas nunca avançar. Removida a entrada desnecessária.
- **dropdown.js** — primeiro option exibia "ITENS" (inconsistente com o HTML que usa "Todos").
- **eventos.js** — `alternarTodos()` adicionou null-guard para o elemento checkbox antes de acessar `.checked`.
- **inline styles** — todos os `style="..."` nos botões dos modais foram migrados para classes CSS puras, permitindo adaptação correta a todos os 4 temas.
- **sw.js** — cache atualizado para `stockflow-v9-3`, `massa.js` adicionado à lista de assets para uso offline.

---

## v9.2.0 — Apple Edition
- Design System com 4 temas: Dark Premium, Midnight OLED, Arctic Silver, Deep Forest.
- CSS Design Tokens completos via Custom Properties.
- Inner Glows, glassmorphism, Inter font, border radius system.
- Backup completo com 6 campos (estoque, ocultos, meus, lfItens, lfOrcamento, lfHistorico).
- Chip visual animado a cada backup automático.

## v9.1.0
- Auto Save com debounce de 2,5s.
- Snapshots diários com histórico de 60 dias.
- Popup calendário para restauração de backups por data.
- Correções: alerta.js null-guard, swipe, modal.

## v9.0.0
- Glass morphism, Gauge circular SVG, Sparklines.
- visualViewport API para iOS.
- Spring physics no swipe.
- Compartilhamento nativo + PWA completo.