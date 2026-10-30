-- Cupons de desconto (a loja cria no painel; a cliente digita ao fechar a compra) e desconto por peça.

CREATE TABLE cupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- o que a cliente digita: letras e números, guardado em maiúsculas
  codigo TEXT NOT NULL UNIQUE COLLATE NOCASE,
  -- desconto sobre as peças (a entrega não entra)
  percentual INTEGER NOT NULL CHECK (percentual BETWEEN 1 AND 90),
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

-- o cupom usado no pedido, guardado como estava na hora (o painel pode mudar ou apagar o cupom depois).
-- total_centavos = itens_centavos - desconto_centavos + frete_centavos
ALTER TABLE pedidos ADD COLUMN cupom TEXT NOT NULL DEFAULT '';
ALTER TABLE pedidos ADD COLUMN cupom_percentual INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pedidos ADD COLUMN desconto_centavos INTEGER NOT NULL DEFAULT 0;

-- desconto da peça, em %: o site mostra o preço cheio riscado e cobra o preço com desconto
ALTER TABLE pecas ADD COLUMN desconto INTEGER NOT NULL DEFAULT 0 CHECK (desconto BETWEEN 0 AND 90);

-- As peças em promoção no catálogo do WhatsApp (outubro de 2026) entraram com o preço já com desconto.
-- Agora guardam o preço cheio e o desconto, e o valor cobrado continua o mesmo. Só muda a peça que
-- ainda está com o preço da promoção (se a loja já mexeu no preço pelo painel, fica como está).
UPDATE pecas SET preco_centavos = 49800, desconto = 50 WHERE slug IN ('vestido-solar-verde', 'vestido-solar-fucsia', 'vestido-solar-off-white') AND preco_centavos = 24900 AND desconto = 0;
UPDATE pecas SET preco_centavos = 39800, desconto = 50 WHERE slug IN ('vestido-estela-off-white', 'vestido-estela-verde', 'vestido-estela-fucsia') AND preco_centavos = 19900 AND desconto = 0;
UPDATE pecas SET preco_centavos = 46900, desconto = 50 WHERE slug = 'vestido-astra-fucsia' AND preco_centavos = 23450 AND desconto = 0;
UPDATE pecas SET preco_centavos = 33900, desconto = 50 WHERE slug = 'blusa-alda-fucsia' AND preco_centavos = 16950 AND desconto = 0;
UPDATE pecas SET preco_centavos = 32900, desconto = 50 WHERE slug = 'saia-alda-fucsia' AND preco_centavos = 16450 AND desconto = 0;
UPDATE pecas SET preco_centavos = 39800, desconto = 30 WHERE slug IN ('vestido-soneto-vinho', 'vestido-allegro-azul-marinho') AND preco_centavos = 27860 AND desconto = 0;
UPDATE pecas SET preco_centavos = 33800, desconto = 30 WHERE slug IN ('blusa-serenata-bege', 'blusa-melodia-azul-marinho', 'saia-melodia-bege') AND preco_centavos = 23660 AND desconto = 0;
UPDATE pecas SET preco_centavos = 32800, desconto = 30 WHERE slug IN ('saia-brasil-verde', 'saia-brasil-amarelo') AND preco_centavos = 22960 AND desconto = 0;
UPDATE pecas SET preco_centavos = 37900, desconto = 50 WHERE slug = 'vestido-leticia-vermelho' AND preco_centavos = 18950 AND desconto = 0;
