# Loja Livi: o que falta (etapa 4 em diante)

Atualizado em 21/10/2026, depois do commit `c1443e6` (partes 4.1, 4.2 e 4.4).

## O que já está pronto e publicado

- **4.1 Pedidos e reserva.** Tabelas `pedidos`, `pedido_itens` e `pagamentos` (`app/migrations/0003_pedidos.sql`).
  - Uma compra do site segura as peças por 30 minutos.
  - Gatilhos no banco recusam a peça sem disponível e baixam ou devolvem o estoque uma vez só (coluna `estoque_baixado`).
  - O site e a tela da peça no painel descontam as peças reservadas.
- **4.2 Aba Pedidos no painel.**
  - Lista por situação, com o número de pedidos pra enviar na aba.
  - Detalhe do pedido: marcar como pago, enviado (com rastreio), entregue ou cancelado (as peças voltam pro estoque).
  - Mensagens prontas no WhatsApp, copiar endereço e folha para imprimir.
  - Registrar venda feita fora do site: já funciona e baixa o estoque na hora.
- **4.4 Pagamento pela InfinitePay** (`app/worker/pedidos.ts` e `app/worker/infinitepay.ts`).
  - `POST /api/pedidos` monta o pedido com os preços do banco e cria o link de pagamento.
  - `POST /api/pagamento/aviso` recebe o aviso (webhook).
  - A página `/pedido/<código>` do site é para onde a cliente volta depois de pagar.
  - O pedido só vira pago depois do `payment_check`, e só no valor exato.
  - Pagamento que chega depois de a reserva vencer, sem a peça, vira "pago sem estoque".

**As compras pelo site continuam travadas.** `PAGAMENTO_PRONTO = false` em `app/worker/ajustes.ts`. Até isso mudar, `POST /api/pedidos` responde 409 e a sacola segue mandando o pedido pelo WhatsApp.

## Parte 4.3: compra no site (formulário na sacola)

Depende de uma decisão: **como cobrar o frete fora de Maceió.**
- **Tabela fixa:** a Livia cadastra no painel um preço de PAC e SEDEX por região. Está dentro do orçamento.
- **SuperFrete:** preço exato pelo CEP e etiqueta pelo painel. A SuperFrete não cobra mensalidade, mas é trabalho a mais, fora do orçamento.

A cliente nunca espera ninguém confirmar o frete: nos dois casos o valor aparece na hora.

O que fazer:
1. **Formulário na sacola** (`app/src/components/Sacola.tsx`):
   - campos: nome, WhatsApp, e-mail, CPF, CEP (o endereço pode vir do ViaCEP), rua, número, complemento e bairro, mais a escolha da entrega;
   - mandar `POST {API}/api/pedidos` com este corpo:
     ```json
     {
       "itens": [{ "peca": "<slug>", "cor": "<nome da cor>", "tamanho": "M", "qtd": 1 }],
       "cliente": { "nome": "", "whatsapp": "", "email": "", "cpf": "" },
       "entrega": { "tipo": "maceio", "cep": "", "rua": "", "numero": "", "complemento": "", "bairro": "" }
     }
     ```
   - a resposta traz `{ codigo, pagar }`: é só mandar a cliente para `pagar`;
   - os erros vêm em `{ erro }`, com uma mensagem pronta para mostrar (peça esgotou, CEP fora de Maceió...);
   - a sacola esvazia sozinha quando a página do pedido vê o pagamento (`tirarCompradas` em `app/src/lib/sacola.ts`).
2. **Mostrar o botão "Finalizar compra" só com as vendas ligadas.** Hoje o site não sabe se as vendas estão ligadas: incluir `vendasOnline` em `ajustesPublicos` (`app/worker/ajustes.ts`) e ler em `app/src/dados/colecoes.ts`.
3. **Correios no servidor.** `lerEntrega` em `app/worker/pedidos.ts` só aceita `maceio`. Para PAC e SEDEX:
   - calcular o frete no servidor;
   - exigir o CPF (a declaração de conteúdo dos Correios pede);
   - trocar a descrição do item de frete que vai para a InfinitePay (hoje é "Entrega em Maceió").
4. **Opcional:** um anti-robô (Cloudflare Turnstile). Já existem limites: 10 pedidos por hora por IP e 3 pedidos esperando pagamento por WhatsApp.

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
4. **Opcional, a chave de API da InfinitePay.** Ela só entra como segredo: `npx wrangler secret put INFINITEPAY_CHAVE`, e o código já manda no cabeçalho `X-Api-Key` quando existir. Com ela daria para usar `valid_until` e `single_payment` (link que vence junto com a reserva). Não foram usados porque a documentação pública não diz o formato.

## Respostas que faltam da Livia

- política de troca;
- se mostra o CPF no rodapé ou abre um MEI;
- desconto no Pix (sim ou não, e quanto);
- retirada no ateliê (sim ou não);
- tempo de reserva: hoje são 30 minutos, em `RESERVA_MINUTOS` (`app/worker/pedidos.ts`);
- frete fora de Maceió: tabela fixa (e os preços) ou SuperFrete (com conta no CPF dela, token e peso e medidas das embalagens);
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

1. Rodar `npm run api` e `npm run dev` dentro de `app`.
2. Pôr no `app/.dev.vars` (não vai para o git):
   - `TESTE_VENDAS=sim`, que deixa criar pedidos no PC com as vendas desligadas;
   - `INFINITEPAY_API=http://127.0.0.1:8799`, uma InfinitePay de mentira.
3. Rodar `node scripts/testar-pedidos.mjs .` dentro de `app`.
   - O teste sobe a InfinitePay de mentira e testa pedidos, reserva, pagamento, aviso falso, pagamento atrasado, 6 clientes pela mesma peça, painel e venda fora do site.
   - Precisa de um login do painel local em `app/teste-local.env`, com as linhas `PAINEL_TESTE_EMAIL=` e `PAINEL_TESTE_SENHA=`.
