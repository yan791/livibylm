-- O Vestido Letícia preto e as Saias Livia também estão em promoção no catálogo do WhatsApp (conferido em 05/11/2026):
-- de R$ 379,00 por R$ 189,50 e de R$ 308,00 por R$ 154,00. Entraram só com o preço da promoção; agora guardam o
-- preço cheio e o desconto, como as outras peças em promoção (0011), e o valor cobrado continua o mesmo.
-- Só muda a peça que ainda está com o preço da promoção e sem desconto (se a loja já mexeu pelo painel, fica como está).
UPDATE pecas SET preco_centavos = 37900, desconto = 50 WHERE slug = 'vestido-leticia-preto' AND preco_centavos = 18950 AND desconto = 0;
UPDATE pecas SET preco_centavos = 30800, desconto = 50 WHERE slug IN ('saia-livia-vermelho', 'saia-livia-branco') AND preco_centavos = 15400 AND desconto = 0;
