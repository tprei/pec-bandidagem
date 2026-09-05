# Diretrizes para agentes

Orientações de engenharia, governança de dados e conformidade legal do projeto Voto Secreto.

## Conformidade eleitoral

Toda alteração de código, texto ou interface deve obedecer às seguintes regras de conformidade com a legislação eleitoral brasileira (em especial a Resolução TSE nº 23.610/2019):

1. **Primeira pessoa estrita.** Toda manifestação de voto ou rejeição é em primeira pessoa (`NÃO VOTO`, `VOTO`, `meu voto não vai pro…`). O modo imperativo (`não vote`, `vote em`, `não votem`) é expressamente proibido na interface, nos cartazes gerados, nas legendas, nos textos de compartilhamento e na documentação.
2. **Autoria individual.** O autor de qualquer post é o próprio eleitor, agindo individualmente. A aplicação apenas processa e exibe dados públicos oficiais da Câmara dos Deputados, do Senado Federal e do Tribunal Superior Eleitoral. Devem ser mantidos o banner de atribuição na tela do link e o aviso de anonimato por padrão. Não é permitido criar banco de dados de posts, contadores de apoio ou coleta de identidade de quem compartilha.
3. **Vedação a ofensas.** Rótulos desonrosos ou injuriosos (`inimigo`, `traidor`, `bandido`, `vergonha`, `corrupto`) são proibidos em cópias de produto. Devem ser usadas ações verificáveis extraídas das votações nominais oficiais (`votou pela blindagem`, `no radar`).
4. **Sem impulsionamento.** Não adicionar código para impulsionamento pago, pixels de rastreamento de anúncios ou integrações de disparo em massa.
5. **Aviso do dia da eleição.** Manter o alerta na tela de compartilhamento sobre a vedação legal a disparos e panfletagem digital no dia da votação, momento em que a legislação permite exclusivamente a manifestação individual e silenciosa da preferência do eleitor.
6. **Amparo legal.** A manifestação individual de preferência política do cidadão é assegurada pelo art. 28 da Resolução TSE nº 23.610/2019 e pela jurisprudência eleitoral.

## Dados

1. **Eixos editoriais imutáveis na ordem.** O arquivo `data/curadoria.json` é de inserção exclusiva no final (`append-only`). Novos eixos podem ser adicionados, mas a ordem existente nunca pode ser alterada, pois os links curtos codificam eixos pelos índices posicionais.
2. **Chave única.** O `SQ_CANDIDATO` (`sq`) emitido pelo TSE é a única chave canônica para identificação de candidaturas no projeto.
3. **Perfis de candidatura.** O cálculo de perfil (`novo`, `reeleicao`, `outro`) é processado em tempo de build (`scripts/build-pokedex.mjs`):
   - `reeleicao`: candidatos que votaram na casa correspondente (Câmara ou Senado) na legislatura atual iniciada em 01/02/2023, ou que declararam ocupação `GOVERNADOR` concorrendo ao mesmo cargo.
   - `outro`: candidatos com ficha histórica de votação no Congresso anterior à legislatura atual ou ocupação política prévia declarada.
   - `novo`: estreantes sem histórico no Congresso nem ocupação política prévia.
   - O arquivo do TSE para 2026 não possui coluna `ST_REELEICAO`, o que torna a identificação de reeleição para cargos do Executivo dependente da ocupação declarada.

## Código

1. **Sem framework e sem empacotador.** A aplicação roda diretamente nos navegadores modernos via GitHub Pages usando ES Modules nativos e carregamento direto de dependências vendoreadas.
2. **Renderização de cartazes.** A renderização dos cartazes em imagem (feed, story e adesivos) é unificada em `assets/cartaz.js` via Canvas 2D. Não criar duplicatas em DOM nem usar bibliotecas de captura como `html2canvas`.
3. **Identificadores em português.** Código, funções e variáveis da aplicação devem utilizar nomenclatura clara em língua portuguesa.
4. **Testes automatizados.** A biblioteca do codec de links é testada por meio do executor nativo do Node.js (`node --test 'tests/**/*.test.mjs'`).
