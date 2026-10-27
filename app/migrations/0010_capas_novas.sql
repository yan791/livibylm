-- Capas novas das coleções, com as fotos do catálogo em 1600 px (as antigas estavam muito comprimidas).
-- O arquivo da capa é o mesmo; muda só a proporção (largura / altura). Capa trocada pelo painel fica como está.

UPDATE colecoes SET capa_proporcao = 0.6663, atualizado_em = datetime('now') WHERE slug = 'lumina' AND capa = '/img/colecoes/lumina.webp';
UPDATE colecoes SET capa_proporcao = 0.6663, atualizado_em = datetime('now') WHERE slug = 'velvet' AND capa = '/img/colecoes/velvet.webp';
UPDATE colecoes SET capa_proporcao = 0.6663, atualizado_em = datetime('now') WHERE slug = 'carmim' AND capa = '/img/colecoes/carmim.webp';
UPDATE colecoes SET capa_proporcao = 0.6669, atualizado_em = datetime('now') WHERE slug = 'confianca' AND capa = '/img/colecoes/confianca.webp';
UPDATE colecoes SET capa_proporcao = 0.6663, atualizado_em = datetime('now') WHERE slug = 'sinfonia' AND capa = '/img/colecoes/sinfonia.webp';
UPDATE colecoes SET capa_proporcao = 0.6663, atualizado_em = datetime('now') WHERE slug = 'brasil' AND capa = '/img/colecoes/brasil.webp';
