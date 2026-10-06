# Briefing do site Livi (recebido em 2026-10-06)

Resumo do pedido da usuária. O texto completo está na conversa; aqui fica o essencial para não se perder.

## Objetivo
Nos primeiros segundos a visitante pensa: "essa estilista trabalha em outro nível". Mostrar de imediato nível e qualidade das roupas. Comunicação segura e sofisticada, sem arrogância. Venda final pelo WhatsApp.

## Skills e repositórios
- Site de 10K (direção de arte, scroll, animações, padrão premium) + negociacao-copy (textos que levam do encantamento à compra no WhatsApp). Em conflito, vence a sensação de marca sofisticada, sem gatilho agressivo.
- Repositórios: Watermelon UI, three.js, motion-primitives, onde fizer sentido.
- BEM moderno, foco no celular.

## Coleções
LÚMINA, VELVET, CARMIM e CONFIANÇA. Coleção atual: Velvet. Existe também uma linha mãe e filha.

## Identidade (resumo)
- Vinho #4F0F10 (assinatura); bordô #7E101C e vinho profundo #5F0421 (destaque); terracota #9E521F, ferrugem #833A1A; chocolate #360E00; taupe #7D6551 / #AB9280; nude #D6A388; rosé #D4AA97; marinho #26284B (contraponto frio); preto quente #0D0705; fundo off-white quente #F4EFEA; dourado com moderação. 60/30/10.
- Títulos: Didone (Bodoni Moda / Playfair), grandes, caixa alta espaçada. Apoio, menu e botões: Jost leve, pequeno, letter-spacing amplo. Manuscrito só no logo, usando o ARQUIVO do logo (nunca recriar com fonte).
- Fotos: estúdio, fundo liso, tom sobre tom, luz quente lateral, poses editoriais.

## Conceito
Uma experiência contínua de cima a baixo. Nada de site em blocos, banner de promoção ou grade de produtos na abertura. Ritmo lento de editorial.

- Ato 1, abertura (Referência 1): moldura arredondada com contorno vinho de baixa opacidade; logo à esquerda, menu central (Início, Coleções, Ateliê, Sobre, Contato; ativo em vinho, outros taupe claro), "Atendimento pelo WhatsApp ↗" à direita. Modelo recortada no centro, maior que a moldura, passando da borda inferior, brilho radial terracota/taupe atrás. "Coleção" e "Velvet" gigantes em Didone vinho com grão sutil de veludo, fáceis de trocar. Inferior esquerdo: ícone fino, título curto em serifa, 2 ou 3 linhas em Jost. Inferior direito: card arredondado fundo taupe com peça recortada e pílula contorno vinho "Ver coleção ↗" (preenche no hover). Nada de streetwear frio, fonte larga técnica ou inglês.
- Ato 2, os detalhes: hero fixo; moldura expande até tela cheia, palavras saem pelas laterais, câmera aproxima da modelo até os detalhes (drapeado do decote, brilho do cetim, nó da halter, caimento da barra, bracelete dourado), cada um com legenda curta em Jost tipo anotação de ateliê. Fundo acompanha a foto (off-white para terracota, taupe ou chocolate).
- Ato 3, a coleção: câmera se afasta e revela outros looks em sequência tom sobre tom, cada um com mudança de escala, fundo acompanhando a foto. Pode fechar numa foto em dupla ou trio (capa de coleção).
- Ato 4, a arara (Referência 2): looks se recolhem e viram a arara (barra fina chocolate ou dourada), peças recortadas em cabides, título gigante em serifa, frase em caixa alta espaçada entre duas linhas. Cada peça = uma coleção. Hover: balança, cresce, as outras apagam, fundo ganha a cor da coleção, nome aparece. Clique: transição contínua de elemento compartilhado até a página da coleção (View Transitions API ou similar). Abaixo: 4 ícones finos com diferenciais e fechamento "Disponível agora". Sem grunge, código de barras, cinza frio ou tipografia condensada.
- Depois: criadora e ateliê (processo, bastidores), clientes reais usando as peças, como comprar (tamanhos, pagamento, envio, troca), rodapé com WhatsApp e Instagram.

## Página de coleção
Cor e clima da coleção. Palco com a peça em 3D (girar e aproximar). Nome, tecido, cores, seletor de tamanho, link da tabela de medidas (altura e tamanho da modelo), botão "Quero essa peça" que abre o WhatsApp com: "Olá! Tenho interesse na peça [nome], na cor [cor], tamanho [tamanho]." Abaixo, outras peças; clicar troca a peça do palco com transição e atualiza a URL (link compartilhável). Fotos editoriais da peça vestida.

## Mídia 3D (ordem de preferência)
GLB (model-viewer ou three.js) > sequência 360° com arraste > foto recortada com leve parallax. 3D só na página da peça, com prévia enquanto carrega.

## Dados
Um único arquivo com coleções e peças (nome, coleção, cor de fundo, cores, tamanhos, tecido, fotos, mídia 3D/360).

## Tom
Seguro, sofisticado, próximo. Frases curtas em português. Sem urgência. Toda afirmação concreta (tecido, produção, prazos, envio, troca) fica como placeholder até confirmar com a cliente.

## Técnico
Stack do projeto (React + Vite + TS + Tailwind). GSAP + ScrollTrigger e Lenis para o scroll. Cores e fontes em variáveis CSS. Hero e atos em camadas (fundo, brilho, texto grande, modelo, interface). Celular: animações fixas simplificadas, toque no lugar de hover, arara vira carrossel. prefers-reduced-motion com versão estática elegante. WebP, lazy load fora da primeira dobra, animar só transform e opacity. Se faltar imagem recortada, avisar em vez de improvisar.

## Regra de trabalho
Antes de codar: resumo, roteiro de scroll ato por ato e quais imagens vão em cada lugar. Só codar depois da confirmação.
