# Loja Livi: o que falta (etapa 4 em diante)

Atualizado em 21/10/2026: partes 4.1, 4.2 e 4.4 (commit `c1443e6`) e 4.3 (compra na sacola com frete por região).

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

**As compras pelo site continuam travadas.** `PAGAMENTO_PRONTO = false` em `app/worker/ajustes.ts`. Até isso mudar, `POST /api/pedidos` responde 409 e a sacola segue mandando o pedido pelo WhatsApp.

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

## Parte 4.5: abrir as vendas

1. **Páginas e rodapé:**
   - política de troca (a cliente tem 7 dias para desistir da compra);
   - política de privacidade (o site pede CPF);
   - rodapé com nome, CPF ou CNPJ e contato. A Livia vende no CPF: confirmar se ela topa mostrar o CPF ou se vai abrir um MEI.
2. **Compra de teste de verdade**, com o ok da Livia: uma peça barata paga no Pix e devolvida depois pelo app da InfinitePay. O código segue a documentação pública, mas a InfinitePay real nunca foi chamada. Conferir:
   - qual campo da resposta de `POST /links` traz o endereço de pagamento (o código aceita `url`, `link`, `checkout_url` ou `payment_url`);
   - se o aviso chega em `https://livi.yanyago2529.workers.dev/api/pagamento/aviso`;
   - o domínio do recibo: só são guardados recibos de `infinitepay.io` ou `cloudwalk.io` (`reciboValido` em `pedidos.ts`).
3. **Ligar as vendas:**
   - trocar `PAGAMENTO_PRONTO` para `true` (`app/worker/ajustes.ts`);
   - publicar (`npm run publicar` dentro de `app`);
   - a Livia liga "Vender pelo site" em Ajustes no painel.
4. **Opcional, a chave de API da InfinitePay.** Ela só entra como segredo: `npx wrangler secret put INFINITEPAY_CHAVE`, e o código já manda no cabeçalho `X-Api-Key` quando existir. Com ela daria para usar `valid_until` e `single_payment` (link que vence junto com a reserva). Não foram usados porque a documentação pública não diz o formato. **A Livia já tem a chave** (o Arthur confirmou em 21/10): falta cadastrar e conferir o formato de `valid_until` na compra de teste.

## Respostas da Livia

Já respondidas (21/10):
- sem desconto no Pix;
- sem retirada: não há loja física;
- reserva de 30 minutos, como está em `RESERVA_MINUTOS` (`app/worker/pedidos.ts`);
- frete fora de Maceió: tabela fixa por região, com PAC e SEDEX (ver a parte 4.3).

Ainda faltam:
- os preços da tabela de frete (ela mesma preenche em Ajustes, no painel);
- política de troca;
- se mostra o CPF no rodapé ou abre um MEI;
- ok para a compra de teste.

## Outras pendências

- **Domínio próprio:** juntar site e painel no mesmo endereço. Também é o que permite mandar e-mail para a cliente sem cair no spam.
- **Rota antiga:** apagar `/api/catalogo` em `app/worker/index.ts`. O GitHub Pages já usa `/api/loja`.
- **Ideias para depois da abertura:**
  - aviso de venda no celular;
  - etiqueta da SuperFrete pelo painel;
  - resumo de vendas;
  - lista de quem não terminou de pagar;
  - cupons cadastrados no painel;
  - tabela de medidas;
  - relatórios;
  - "me avisa quando voltar";
  - lançamento agendado de coleção;
  - acompanhar pedido pelo site.

## Como testar no PC

Os testes automáticos rodam sozinhos, sem `npm run api`: `npm test` dentro de `app`. Eles usam um banco local novo a cada teste, com as migrations aplicadas, e rodam também no GitHub a cada push (`.github/workflows/testes.yml`). O `npm run publicar` não publica se algum falhar.

O teste completo, com a InfinitePay de mentira:

1. Rodar `npm run api` e `npm run dev` dentro de `app`.
2. Pôr no `app/.dev.vars` (não vai para o git):
   - `TESTE_VENDAS=sim`, que deixa criar pedidos no PC com as vendas desligadas;
   - `INFINITEPAY_API=http://127.0.0.1:8799`, uma InfinitePay de mentira.
3. Rodar `node scripts/testar-pedidos.mjs .` dentro de `app`.
   - O teste sobe a InfinitePay de mentira e testa pedidos, reserva, pagamento, aviso falso, pagamento atrasado, 6 clientes pela mesma peça, painel e venda fora do site.
   - Precisa de um login do painel local em `app/teste-local.env`, com as linhas `PAINEL_TESTE_EMAIL=` e `PAINEL_TESTE_SENHA=`.
