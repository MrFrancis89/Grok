### 📂 Mapa do Projeto: StockFlow Pro (v9.8.x)

#### 🟢 1. Core do Sistema (Raiz)
* `index.html`: Estrutura principal PWA e pontos de montagem das abas e iframe.
* `main.js`: Ponto de entrada. Inicializa todos os módulos e gere eventos globais.
* `version.js`: **Fonte única de verdade** para a versão do app (`VERSION = '10.0.0'`). Importada por `main.js` e `storage.js`. Elimina desincronização de versão entre módulos.
* `store.js`: Micro-store reativa baseada em `EventTarget` para gestão de estado global.
* `storage.js`: Orquestrador de persistência local, Firebase e agendamento de Snapshots.
* `idb.js`: Wrapper de IndexedDB para gerir o histórico pesado de 60 dias (Calendário).
* `ui.js`: Renderização do DOM para a lista de stock e manipulação de linhas.
* `tabela.js`: Coleta e extração de dados brutos lidos diretamente da tabela HTML.
* `eventos.js`: Handlers de interações da tabela (selecionar item, alternar todos).
* `categorias.js`: Lógica de classificação automática de produtos por palavras-chave.
* `dropdown.js`: Filtro dropdown de pesquisa rápida no cabeçalho.
* `produtos.js`: Lista estática de produtos padrão para inicialização.

#### 🛠️ 2. Componentes de UI e UX
* `confirm.js`: Modais de confirmação customizados com `AbortController` (evita cliques duplos).
* `alerta.js`: Gestão de limites de stock mínimo/máximo e alertas.
* `toast.js`: Sistema de notificações efêmeras não bloqueantes no rodapé.
* `swipe.js`: Lógica de gestos nas linhas da tabela (deslizar para remover/alertar).
* `teclado.js`: Ativa o modo de edição focado e exibe o botão da calculadora.
* `utils.js`: Funções utilitárias (feedback háptico/sonoro, formatação de data, clipboard).
* `navegacao.js`: Controlo do roteamento entre abas e lazy load do iframe da Ficha Técnica.

#### 🧪 3. Módulos de Cálculo e Negócios
* `calculadora.js`: Parser aritmético puro (sem `eval`) acoplado aos inputs.
* `parser.js`: Conversor de frações (ex: "1/2") e números mistos para decimais reais.
* `massa.js`: Calculadora "Massa Master" para planeamento proporcional de receitas.
* `producao.js`: Planeamento diário e cálculo de separação de ingredientes por bola.
* `listafacil.js`: Gestão da lista de compras separada, orçamento e histórico de preços.
* `compras.js`: Gera o painel visual e a formatação de texto para partilha no WhatsApp.
* `calendario.js`: Interface para restaurar, exportar e importar backups do IndexedDB.

#### 🍳 4. Módulo Ficha Técnica (Sub-sistema no Iframe)
* `ficha-tecnica.html`: Estrutura HTML exclusiva e isolada deste módulo.
* `ft-app.js`: Inicializador e roteador das abas internas da Ficha Técnica.
* `ft-storage.js`: Sincronização local e Firebase para receitas, ingredientes e preparos.
* `ft-receitas.js`: CRUD para criação e edição das receitas finais.
* `ft-ingredientes.js`: CRUD e histórico de variação de preços de insumos.
* `ft-preparo.js`: Gestão de receitas-base (preparos antecipados como molhos/massas).
* `ft-calc.js`: Motor financeiro: calcula custo por fatia, markup, margem real e perdas.
* `ft-dashboard.js`: Renderiza KPIs, ranking de lucratividade e alertas de margem.
* `ft-exportacao.js`: Geração de PDFs, backups JSON e importação de planilhas CSV.
* `ft-ui.js` / `ft-format.js`: Modais internos e formatadores de moeda/unidades.
* `ft-custos.js`: Motor do Simulador financeiro — cálculo de markup, margem desejada, overhead, mão de obra e custo por fatia. Carrega receitas ativas via `getReceitasAtivas()`. Configuração persistida via `ft-storage.js`.
* `ft-icons.js`: Biblioteca SVG inline (estilo Apple SF Symbols).
* `ft-firebase.js`: Alias para re-exportar métodos do `firebase.js` da raiz.

#### 🎨 5. Design, Estilos e Personalização
* `style.css`: Design System principal contendo as variáveis para os 4 temas.
* `apple-overrides.css`: Refinamentos de UX projetados especificamente para Safari/iOS.
* `patch-v980.css` & `patch-v976.css`: Hotfixes para corrigir bugs de z-index e rolagem no iOS.
* `massa-extra.css`: Estilos dedicados visualmente ao módulo Massa Master.
* `ft-style.css`: Folha de estilos enxuta e isolada do iframe da Ficha Técnica.
* `apple-premium-v10.css`: Overlay CSS Apple HIG Premium (v10.0.0, ~998 linhas). 15 layers: spring physics, glassmorphism, tokens de elevação semântica, z-index hierárquico, micro-interações automáticas. Importado em `index.html` após `style.css`.
* `bg-upload.js` & `bg-upload.css`: Módulo de background personalizado salvo no IndexedDB.

#### ⚙️ 6. Infraestrutura, Nuvem e PWA
* `firebase.js`: Arquivo unificado de configuração do Firebase (Auth e Firestore).
* `manifest.json`: Manifesto PWA (ícones, cores, atalhos).
* `sw.js`: Service Worker (v9.7.6) para cache e funcionamento 100% offline.
* `CHANGELOG.md`: Histórico detalhado de versões, bugs corrigidos e decisões técnicas.
