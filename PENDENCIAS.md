# Loja Livi: o que falta (etapa 4 em diante)

Atualizado em 22/10/2026: partes 4.1, 4.2 e 4.4 (commit `c1443e6`), 4.3 (compra na sacola com frete por região) e 4.5 (abrir as vendas pelo painel).

## Para entregar (lista final, 22/10)

As vendas pelo site já estão ligadas. Falta isto para entregar a loja:

### 1. As peças de verdade no banco

As 70 peças do catálogo da LIVÍ no WhatsApp (26/10) estão em `app/migrations/0009_pecas_reais.sql`, nas coleções Lúmina, Velvet, Carmim, Confiança e nas novas Sinfonia e Brasil. A migration apaga as 16 de exemplo. As fotos ficam em `app/public/img/pecas/<coleção>/<peça>/`. Cada cor do WhatsApp virou uma peça, porque o site guarda as fotos por peça.
- **Yan:** `npm run publicar`, que aplica a migration. Até lá, a loja no ar continua vendendo as peças de exemplo.
- **Livia confirma, no painel (Peças):**
  - o estoque e os tamanhos. As 9 peças com "APENAS 1 NO M" no catálogo entraram só com essa unidade; as outras 61 entraram com 1 por tamanho, do PP ao GG, provisório. Com as vendas ligadas, vale acertar logo depois de publicar.
  - a altura da modelo e o tamanho que ela veste (vazios em todas).
  - os textos das coleções Sinfonia e Brasil (escritos a partir das fotos) e a ordem das coleções.
- **Ainda não tem no site:** o preço "de/por" das peças em promoção. Elas aparecem só com o preço atual.

### 2. Domínio `livibylm.com.br`

1. **Livia:** registrar no Registro.br, no CPF dela (R$ 40 por ano).
2. **Yan:** pôr o domínio na Cloudflare (plano grátis), na mesma conta do Worker. A Cloudflare mostra dois servidores de DNS.
3. **Livia:** no Registro.br, trocar os servidores de DNS do domínio pelos da Cloudflare. A troca leva algumas horas.
4. **Código:**
   - o Worker passa a responder no domínio (`routes` com `custom_domain` em `app/wrangler.jsonc`, com o `www` levando para o endereço sem `www`);
   - `SITE_PUBLICO` vazio: o próprio Worker publica o site, e site, painel e API ficam no mesmo endereço;
   - o GitHub Pages passa a mandar quem chegar por lá para o domínio novo.
5. **Yan:** `npm run publicar`.
6. **Na Cloudflare, depois:** uma regra de limite por IP para `/api/*` (o plano grátis tem uma) e o modo anti-robô.

Quem estiver logado no painel ou numa conta do site precisa entrar de novo no endereço novo. Os pedidos e os links de pagamento antigos continuam funcionando pelo `workers.dev`.

### 3. E-mail a cada venda

O código está pronto (ver "Aviso de venda por e-mail" abaixo) e **não depende do domínio**:
- **sem o domínio:** a conta do Resend criada com o livibylm@gmail.com, e o Yan cadastra a chave (`RESEND_CHAVE`);
- **com o domínio:** verificar o `livibylm.com.br` no Resend (os registros de DNS entram na Cloudflare) e trocar o remetente (`EMAIL_REMETENTE`) para um endereço da loja. É isso que permite, depois, mandar e-mail também para a cliente sem cair no spam.

### 4. Textos do site

- **A criadora** (`app/src/sections/Depois.tsx`): a foto já está no site. Faltam o nome e duas ou três frases de como a marca começou; hoje aparece "[Nome da criadora]".
- **Tamanhos:** a tabela de medidas da Livia (busto, cintura e quadril de cada tamanho, em cm). Ela entra na resposta "Tamanhos" do "Como comprar", que hoje está marcada para confirmar, e num "Guia de medidas" na página da peça.
- **Na página da peça,** a frase "A modelo tem ... e veste ..." aparece sempre marcada como "aguardando confirmação", mesmo com os valores certos. Corrigir junto (`app/src/components/Catalogo.tsx`).
- **Também com espaço reservado:** as fotos da seção de looks (`app/src/sections/Looks.tsx`) e o logo em arquivo (`site.logo` em `app/src/dados/site.ts`; sem ele, aparece o nome escrito).

## O que já está pronto e publicado

- **4.1 Pedidos e reserva.** Tabelas `pedidos`, `pedido_itens` e `pagamentos` (`app/migrations/0003_pedidos.sql`).
  - Uma compra do site segura as peças por 30 minutos.
  - Gatilhos no banco recusam a peça sem disponível e baixam ou devolvem o estoque uma vez só (coluna `estoque_baixado`).
  - O site e a tela da peça no painel descontam as peças reservadas.
- **4.2 Aba Pedidos no painel.**
  - Lista por situação, com o número de pedidos pra enviar na aba.
  - Detalhe do pedido: marcar como pago, enviado (com rastreio), entregue ou cancelado. Ao cancelar, o painel pergunta se as peças voltam pro estoque (já vem desmarcado se o pedido foi enviado).
  - Mensagens prontas no WhatsApp, copiar endereço e folha para imprimir.
  - Registrar venda feita fora do site: já funciona e baixa o estoque na hora.
- **4.4 Pagamento pela InfinitePay** (`app/worker/pedidos.ts` e `app/worker/infinitepay.ts`).
  - `POST /api/pedidos` monta o pedido com os preços do banco e cria o link de pagamento.
  - `POST /api/pagamento/aviso` recebe o aviso (webhook).
  - A página `/pedido/<código>` do site é para onde a cliente volta depois de pagar.
  - O pedido só vira pago depois do `payment_check`, e só no valor exato.
  - Se o aviso chega e o `payment_check` ainda diz que não pagou, o Worker responde 400 para a InfinitePay mandar de novo.
  - Pagamento que chega depois de a reserva vencer, sem a peça, vira "pago sem estoque".

**As compras pelo site só abrem pelo painel**, depois dos passos da parte 4.5. Até lá, `POST /api/pedidos` responde 409 e a sacola segue mandando o pedido pelo WhatsApp.

## Parte 4.3: compra no site (formulário na sacola), feita

**Frete fora de Maceió: tabela fixa** (decidido com a Livia em 21/10). Sem SuperFrete: ela mesma posta nos Correios, vendo o pedido pago no painel com o endereço e o CPF, e marca como enviado com o rastreio.

- **Sacola** (`app/src/components/Compra.tsx`): com as vendas ligadas, "Finalizar compra" abre o formulário ali mesmo (nome, WhatsApp, e-mail, CEP). O CEP traz a rua, o bairro e a cidade pelo ViaCEP e as entregas possíveis com o preço; nos Correios entram a cidade e o CPF. A cliente vai para o pagamento da InfinitePay e volta para `/pedido/<código>`. "Prefiro pelo WhatsApp" continua como opção.
- **Frete** (`app/worker/frete.ts`): o CEP dá o estado e a região (Alagoas fora de Maceió tem linha própria). `GET /api/pedidos/frete?cep=` devolve as opções e os preços, e o `POST /api/pedidos` refaz a conta: o frete e o estado nunca vêm do navegador. Correios exige CPF, e o item do link vai como "Correios PAC" ou "Correios SEDEX".
- **Painel, Ajustes**: tabela com um preço de PAC e um de SEDEX por região. Em branco, a região não tem aquele serviço pelo site, e a cliente vê o aviso para falar pelo WhatsApp.
- **Testes** (`app/test/frete.test.ts`): região pelo CEP, tabela salva no painel, compra pelos Correios cobrando o frete da tabela, CPF obrigatório e as combinações recusadas.

Falta:
1. **A Livia preencher a tabela de frete** em Ajustes. Até lá, fora de Maceió o site manda a cliente para o WhatsApp.
2. **Opcional:** um anti-robô (Cloudflare Turnstile). Já existem limites:
   - 10 pedidos por hora por IP e 3 pedidos esperando pagamento por WhatsApp;
   - 60 consultas de frete por IP e 20 avisos de pagamento por pedido, a cada 15 minutos.

   Esses limites estão no código, então a requisição já chegou ao Worker e conta na cota de 100 mil por dia do plano grátis. A proteção contra enxurrada de acessos vem com o domínio próprio: uma regra de limite por IP na Cloudflare, antes do Worker.

## Parte 4.5: abrir as vendas, feita

A constante `PAGAMENTO_PRONTO` saiu. Quem libera as vendas agora é o painel, em Ajustes, com três passos na tela:

1. **Dados da loja** (nome, CPF ou CNPJ, endereço e e-mail). Aparecem no rodapé do site e nas páginas de trocas e de privacidade, como pede o Decreto 7.962/2013.
   - O CNPJ pode ter letras (o formato novo da Receita, desde julho de 2026): `cnpjValido` em `app/worker/validar.ts`.
   - Enquanto os dados não estão completos, o site não mostra o rodapé com eles nem os links das políticas, e as vendas não ligam (`deLinha` em `app/worker/ajustes.ts` confere de novo).
2. **Compra de teste** (`app/worker/compra-teste.ts`, rotas em `/api/painel/compra-teste`):
   - um pedido de verdade, de R$ 1 a R$ 100, com um item só ("Compra de teste"), sem peça e sem estoque;
   - passa pelo mesmo caminho de uma compra do site: página da InfinitePay, volta para `/pedido/<código>`, `payment_check` e aviso;
   - a tela mostra se foi paga e se o aviso automático chegou (coluna `aviso_em`, `migrations/0005_aviso_do_pagamento.sql`);
   - se a InfinitePay não abrir o pagamento, o painel mostra o motivo que ela deu.
3. **Ligar as vendas.** O interruptor só destrava com os dados completos e a compra de teste paga; o servidor confere de novo ao salvar.

Também entrou:
- **Trocas** em Ajustes: prazo (7 a 90 dias) e quem paga o frete da troca. A desistência (7 dias) e o defeito (90 dias) seguem o Código de Defesa do Consumidor e são sempre por conta da loja.
- **Páginas `/trocas` e `/privacidade`** (`app/src/paginas/Politica.tsx`), com os links no rodapé, no "Como comprar", no formulário de compra e na página do pedido.
- **"Como comprar"** com os passos e as respostas de pagamento, envio e trocas quando as vendas estão ligadas.
- **Comprovante:** se o aviso chega antes da cliente voltar ao site e vem sem o comprovante, a volta dela guarda o dela (só da mesma transação e do domínio da InfinitePay).

Falta:
1. **A Livia preencher os dados dela** em Ajustes (decidir CPF ou MEI antes) e conferir o prazo e o frete da troca.
2. **A compra de teste de verdade**, com o ok da Livia, pelo botão em Ajustes. Depois dela, conferir no banco:
   - qual campo da resposta de `POST /links` trouxe o endereço de pagamento (o código aceita `url`, `link`, `checkout_url` ou `payment_url`);
   - se o aviso chegou (`aviso_em` do pedido de teste) e o domínio do comprovante (`recibo`).
3. **Ligar as vendas** em Ajustes, e cancelar o pedido de teste em Pedidos (o valor volta pelo app da InfinitePay, se ela quiser).
4. **Opcional, a chave de API da InfinitePay.** Ela só entra como segredo: `npx wrangler secret put INFINITEPAY_CHAVE`, e o código já manda no cabeçalho `X-Api-Key` quando existir. Com ela daria para usar `valid_until` e `single_payment` (link que vence junto com a reserva). Não foram usados porque a documentação pública não diz o formato. **A Livia já tem a chave** (o Arthur confirmou em 21/10): falta cadastrar e conferir o formato de `valid_until`.

## Aba "Pedidos" da cliente, feita (22/10)

Sem conta: o aparelho guarda o código de cada compra pelo site (`app/src/lib/meus-pedidos.ts`).
- O pedido entra na lista quando a cliente vai para o pagamento e quando ela abre a página do pedido, inclusive pelo link que a Livia manda no WhatsApp (as mensagens prontas do painel agora levam esse link).
- A aba aparece na gaveta, ao lado de Sacola e Desejos, só depois que o aparelho tem algum pedido. Também tem "Meus pedidos" no rodapé e "Ver todos os meus pedidos" na página do pedido.
- Cada pedido mostra número, data, peças, total e a situação; tocar abre a página do pedido, com tudo detalhado. Pedido não pago pode sair da lista (X).
- "Acompanhar" (a setinha) abre as 4 etapas do pedido, com data e hora, todas automáticas: pedido feito (na compra), pagamento confirmado (InfinitePay), enviado e entregue (quando a Livia marca no painel). Se ela não marcar "entregue", o pedido fica em "Enviado". Sem rastreio automático dos Correios: a API oficial pede contrato no CNPJ.
- O código de rastreio não aparece na aba: a Livia manda pelo WhatsApp, e nos pedidos pelos Correios a aba tem "Pedir o código de rastreio" (abre o WhatsApp com o número do pedido). A página do pedido mostra o código depois que ela marca o pedido como enviado no painel.
- Servidor: `POST /api/pedidos/consulta` com até 30 códigos, só pedidos do site, sem dados pessoais, 120 consultas por IP a cada 15 minutos. Testes em `app/test/meus-pedidos.test.ts`.

## Conta da cliente, feita e publicada (22/10)

Antes de pagar, a sacola pede a conta: "Entrar" (WhatsApp e senha) e, embaixo, "Ainda não tem conta? Criar conta e continuar", que leva aos dados da compra com uma senha. Só compra quem está com a conta aberta.
- Servidor: `app/worker/contas.ts` (`/api/conta`: criar, entrar, sair, dados, pedidos e senha nova), tabelas em `app/migrations/0006_contas.sql`. A sessão vai no cabeçalho `Authorization` (90 dias), guardada só como hash.
- Cada pedido do site fica na conta (`pedidos.cliente_id`), e a aba "Pedidos" mostra os da conta em qualquer aparelho. Nome, WhatsApp e e-mail do pedido vêm da conta; a próxima compra já vem com a última entrega e o CPF.
- Sem SMS: um pedido antigo só entra na conta com o código guardado no aparelho e o mesmo WhatsApp. Vendas do painel e compras de teste nunca aparecem numa conta.
- Limites: 20 contas novas por IP por hora; 5 senhas erradas por número e 20 por IP a cada 15 minutos.
- **Esqueceu a senha:** a cliente chama no WhatsApp. No painel, na página de um pedido dela, "Esqueceu a senha? Gerar link" cria um link de senha nova (24 horas, uma vez só) para mandar pelo WhatsApp da conta. Página `/nova-senha/<link>` no site.
- Testes: `app/test/contas.test.ts` (35, inclusive 6 clientes entrando ao mesmo tempo e a mesma cliente em 6 aparelhos).

## Verificação em duas etapas do painel, feita (22/10)

Depois da senha, o painel pede o código de 6 números de um app autenticador (Google Authenticator, Microsoft Authenticator...). Cada pessoa liga a sua em **Acesso**: confirma a senha, lê o QR code (no celular, "Toque aqui para abrir no app") e digita o código.
- Ao ligar, saem 10 códigos de recuperação (cada um entra uma vez) e os outros aparelhos dessa pessoa saem do painel.
- Perdeu o celular e os códigos: outra pessoa do painel desliga a dela em Acesso ("Desligar duas etapas", com a própria senha).
- O link de senha nova também pede o código de quem ligou.
- Código errado conta como senha errada: 5 em 15 minutos travam o e-mail.
- Servidor: `app/worker/dois-fatores.ts`, tabela em `app/migrations/0007_dois_fatores.sql`. O segredo fica cifrado com uma chave tirada do `SENHA_PEPPER`. Testes em `app/test/dois-fatores.test.ts`.
- Hoje cada pessoa escolhe se liga. Dá para tornar obrigatório para todo mundo.

## Aviso de venda por e-mail, feito (22/10), falta configurar

Quando um pedido do site é pago pela InfinitePay, a loja recebe um e-mail no endereço dos dados da loja (Ajustes): peças, entrega, total, nome e WhatsApp da cliente e o link do pedido no painel.
- Um e-mail por pedido, mesmo quando o aviso da InfinitePay e a volta da cliente aprovam ao mesmo tempo (coluna `venda_avisada_em`, `app/migrations/0008_aviso_de_venda.sql`).
- Pago sem estoque e compra de teste têm assunto próprio. Pedido marcado como pago à mão no painel não manda e-mail.
- Se o Resend falhar, o pagamento aprova igual, e o próximo aviso do pedido tenta mandar de novo.
- Código em `app/worker/aviso-de-venda.ts`, testes em `app/test/aviso-de-venda.test.ts`.

Para ligar (uma vez):
1. Criar uma conta grátis em resend.com **com o e-mail da loja** (livibylm@gmail.com). Sem domínio próprio, o Resend só entrega para o e-mail de quem criou a conta.
2. Em API Keys, criar uma chave com permissão só de envio.
3. Dentro de `app`: `npx wrangler secret put RESEND_CHAVE` e colar a chave quando pedir.
4. Fazer uma compra de teste pelo painel: o e-mail "Compra de teste paga" tem que chegar.

Com o domínio `livibylm.com.br` verificado no Resend, o remetente pode ser da loja: `npx wrangler secret put EMAIL_REMETENTE` com, por exemplo, `Livi <pedidos@livibylm.com.br>`.

## Respostas da Livia

Já respondidas (21/10):
- sem desconto no Pix;
- sem retirada: não há loja física;
- reserva de 30 minutos, como está em `RESERVA_MINUTOS` (`app/worker/pedidos.ts`);
- frete fora de Maceió: tabela fixa por região, com PAC e SEDEX (ver a parte 4.3).

Ainda faltam:
- os preços da tabela de frete (ela mesma preenche em Ajustes, no painel);
- prazo e frete da troca (ela mesma escolhe em Ajustes);
- se mostra o CPF no rodapé ou abre um MEI;
- ok para a compra de teste.

## Outras pendências

- **Domínio próprio:** juntar site e painel no mesmo endereço. Também é o que permite mandar e-mail para a cliente sem cair no spam.
- **Rota antiga:** apagar `/api/catalogo` em `app/worker/index.ts`. O GitHub Pages já usa `/api/loja`.
- **Ideias para depois da abertura:**
  - etiqueta da SuperFrete pelo painel;
  - resumo de vendas;
  - lista de quem não terminou de pagar;
  - cupons cadastrados no painel;
  - tabela de medidas;
  - relatórios;
  - "me avisa quando voltar";
  - lançamento agendado de coleção;
  - a cliente trocar a própria senha e os dados dentro da conta;
  - apagar a conta: hoje a cliente pede pelo WhatsApp (como diz a política de privacidade) e a gente apaga direto no banco; dá para pôr um botão no painel.

## Como testar no PC

Os testes automáticos rodam sozinhos, sem `npm run api`: `npm test` dentro de `app`. Eles usam um banco local novo a cada teste, com as migrations aplicadas, e rodam também no GitHub a cada push (`.github/workflows/testes.yml`). O `npm run publicar` não publica se algum falhar.

O teste completo, com a InfinitePay de mentira:

1. Rodar `npm run api` e `npm run dev` dentro de `app`.
2. Pôr no `app/.dev.vars` (não vai para o git):
   - `TESTE_VENDAS=sim`, que deixa criar pedidos no PC com as vendas desligadas;
   - `INFINITEPAY_API=http://127.0.0.1:8799`, uma InfinitePay de mentira.
3. Rodar `node scripts/testar-pedidos.mjs .` dentro de `app`.
   - O teste sobe a InfinitePay de mentira e testa pedidos, reserva, pagamento, aviso falso, pagamento atrasado, 6 clientes pela mesma peça, painel, venda fora do site e peça apagada (95 conferências). Cada cliente do teste cria a sua conta antes de comprar ("Maria Teste", apagadas no fim).
   - Precisa de um login do painel local em `app/teste-local.env`, com as linhas `PAINEL_TESTE_EMAIL=` e `PAINEL_TESTE_SENHA=`.

Para clicar na compra inteira no navegador (sacola, pagamento e volta ao site), com a mesma configuração do `.dev.vars`:
- rodar `node scripts/infinitepay-falsa.mjs` dentro de `app` (porta 8799; não rode junto com o `testar-pedidos.mjs`, que usa a mesma porta);
- a página de pagamento de mentira tem "Pagar com Pix" (avisa o Worker e volta para o site) e "Desistir";
- só no PC, com `INFINITEPAY_API` no `.dev.vars`, o link de pagamento pode ser `http`; no ar, só `https`.
