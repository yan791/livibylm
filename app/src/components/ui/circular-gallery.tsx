/*
  Galeria circular 3D (adaptada do CircularGallery do 21st.dev).
  Os cartões ficam num anel: o da frente aparece no tamanho natural e os
  outros recuam em perspectiva. Gira arrastando (mouse ou dedo), pela
  rodinha de lado do trackpad, pelo teclado, por fora (next/prev/goTo) ou
  sozinho, e sempre para com um cartão de frente.
  Diferente do original, girar não passa pelo estado do React: cada quadro
  mexe direto no DOM, e o laço de animação só roda enquanto há movimento.
*/
import React, { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { cn } from '../../lib/cn';

export type GalleryItem = {
  id: string;
  src: string;
  alt: string;
  /** largura / altura da foto */
  aspect?: number;
  /** object-position da foto */
  pos?: string;
  href?: string;
};

export type CircularGalleryHandle = {
  next: () => void;
  prev: () => void;
  goTo: (index: number, o?: { instant?: boolean }) => void;
  /** 0 = só o cartão da frente; 1 = o anel inteiro (para uma entrada comandada por fora) */
  reveal: (t: number) => void;
  /** foto do cartão que está de frente */
  frontImage: () => HTMLImageElement | null;
};

type CircularGalleryProps = {
  items: GalleryItem[];
  /** o anel repete os itens até ter pelo menos esse número de cartões */
  minSlots?: number;
  /** intervalo do giro automático, em ms (false desliga) */
  autoplay?: number | false;
  /** pausa o giro automático (ex.: com outra tela aberta por cima) */
  paused?: boolean;
  /** espaço entre cartões vizinhos, em px */
  gap?: number;
  onActiveChange?: (index: number) => void;
  /** toque no cartão da frente (um toque num cartão do lado só o traz para a frente) */
  onItemClick?: (index: number, img: HTMLImageElement) => void;
  className?: string;
  label?: string;
};

const mod = (a: number, n: number) => ((a % n) + n) % n;
const wrap180 = (a: number) => mod(a + 180, 360) - 180;

// mola criticamente amortecida: chega sem passar do ponto, e herda a velocidade do arrasto
const RIGIDEZ = 8.5;
const LIMIAR_ARRASTO = 6;

const CircularGallery = forwardRef<CircularGalleryHandle, CircularGalleryProps>(
  (
    { items, minSlots = 8, autoplay = 4500, paused = false, gap = 40, onActiveChange, onItemClick, className, label = 'Galeria' },
    ref,
  ) => {
    const n = items.length;
    const repeticoes = Math.max(1, Math.ceil(minSlots / n));
    const total = n * repeticoes;
    const passo = 360 / total;

    const raiz = useRef<HTMLDivElement>(null);
    const anel = useRef<HTMLDivElement>(null);
    const cartoes = useRef<(HTMLDivElement | null)[]>([]);
    const callbacks = useRef({ onActiveChange, onItemClick });
    callbacks.current = { onActiveChange, onItemClick };
    const pausado = useRef(paused);
    pausado.current = paused;

    const s = useRef({
      ang: 0,
      alvo: 0,
      vel: 0,
      raio: 500,
      grausPorPx: 0.15,
      revelar: 1,
      ativo: 0,
      frente: 0,
      arrastando: false,
      moveu: false,
      x0: 0,
      ang0: 0,
      ultX: 0,
      ultT: 0,
      acabouDeArrastar: false,
      ultimaAcao: 0,
      dentro: false,
      emCima: false,
      quadro: 0,
      tempo: 0,
      rodinha: 0 as ReturnType<typeof setTimeout> | 0,
    }).current;

    const desenhar = () => {
      const a = anel.current;
      if (!a) return;
      a.style.transform = `translateZ(${-s.raio}px) rotateY(${s.ang}deg)`;
      cartoes.current.forEach((el, k) => {
        if (!el) return;
        const graus = wrap180(k * passo + s.ang);
        const frente = (1 + Math.cos((graus * Math.PI) / 180)) / 2;
        // a metade da frente fica inteira (o escurecido dá a profundidade); a de trás quase some
        const base = Math.min(1, Math.max(0.16, (frente - 0.1) / 0.45));
        // na entrada só o cartão da frente aparece; os outros chegam com t
        const naFrente = Math.max(0, 1 - Math.abs(graus) / passo);
        const op = base * (s.revelar + (1 - s.revelar) * naFrente);
        el.style.opacity = op.toFixed(3);
        el.style.setProperty('--sombra', ((1 - frente) * 0.55).toFixed(3));
        el.style.pointerEvents = op < 0.3 ? 'none' : '';
      });
      // quem está de frente: durante o arrasto, o mais perto; nos giros, o destino
      const frenteK = mod(Math.round(-(s.arrastando ? s.ang : s.alvo) / passo), total);
      if (frenteK !== s.frente) {
        cartoes.current[s.frente]?.removeAttribute('data-frente');
        s.frente = frenteK;
      }
      cartoes.current[frenteK]?.setAttribute('data-frente', '');
      const ativo = frenteK % n;
      if (ativo !== s.ativo) {
        s.ativo = ativo;
        callbacks.current.onActiveChange?.(ativo);
      }
    };

    const quadro = (t: number) => {
      const dt = Math.min(0.05, (t - (s.tempo || t)) / 1000);
      s.tempo = t;
      if (!s.arrastando) {
        // integra em passos curtos para a mola ficar estável mesmo com quadros lentos
        for (let i = 0; i < 4; i++) {
          const h = dt / 4;
          const acel = RIGIDEZ * RIGIDEZ * (s.alvo - s.ang) - 2 * RIGIDEZ * s.vel;
          s.vel += acel * h;
          s.ang += s.vel * h;
        }
      }
      desenhar();
      if (s.arrastando || Math.abs(s.alvo - s.ang) > 0.01 || Math.abs(s.vel) > 0.01) {
        s.quadro = requestAnimationFrame(quadro);
      } else {
        s.ang = s.alvo;
        s.vel = 0;
        s.quadro = 0;
        s.tempo = 0;
        desenhar();
      }
    };

    const animar = () => {
      if (!s.quadro) s.quadro = requestAnimationFrame(quadro);
    };

    const girarPara = (alvo: number, instantaneo = false) => {
      s.alvo = alvo;
      s.ultimaAcao = performance.now();
      if (instantaneo) {
        s.ang = alvo;
        s.vel = 0;
        desenhar();
      } else animar();
    };

    /** gira até o cartão k pelo caminho mais curto */
    const irParaCartao = (k: number, instantaneo = false) => girarPara(s.alvo + wrap180(-k * passo - s.alvo), instantaneo);

    useImperativeHandle(ref, () => ({
      next: () => girarPara(Math.round(s.alvo / passo) * passo - passo),
      prev: () => girarPara(Math.round(s.alvo / passo) * passo + passo),
      goTo: (index, o) => {
        // entre as cópias do item, a mais perto de onde o anel está
        let melhor = index;
        for (let k = index; k < total; k += n)
          if (Math.abs(wrap180(-k * passo - s.alvo)) < Math.abs(wrap180(-melhor * passo - s.alvo))) melhor = k;
        irParaCartao(melhor, o?.instant);
      },
      reveal: (t) => {
        s.revelar = Math.min(1, Math.max(0, t));
        desenhar();
      },
      frontImage: () => cartoes.current[s.frente]?.querySelector('img') ?? null,
    }));

    // raio do anel e perspectiva a partir do tamanho real dos cartões (que vem do CSS)
    useLayoutEffect(() => {
      const r = raiz.current;
      if (!r) return;
      const medir = () => {
        const largura = Math.max(...cartoes.current.map((el) => el?.offsetWidth ?? 0));
        if (!largura) return;
        s.raio = (largura + gap) / (2 * Math.sin(Math.PI / total));
        s.grausPorPx = passo / (largura * 0.9);
        r.style.perspective = `${Math.round(s.raio * 2.4)}px`;
        cartoes.current.forEach((el, k) => {
          if (el) el.style.transform = `rotateY(${k * passo}deg) translateZ(${s.raio}px)`;
        });
        desenhar();
      };
      medir();
      const ro = new ResizeObserver(medir);
      ro.observe(r);
      return () => ro.disconnect();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [total, gap]);

    // giro automático: só com a galeria na tela, a aba visível e ninguém mexendo
    useEffect(() => {
      const r = raiz.current;
      if (!r || !autoplay) return;
      const io = new IntersectionObserver(([e]) => (s.dentro = e.isIntersecting && e.intersectionRatio > 0.5), {
        threshold: [0, 0.5, 1],
      });
      io.observe(r);
      s.ultimaAcao = performance.now();
      const id = window.setInterval(() => {
        const livre = s.dentro && !s.emCima && !s.arrastando && !pausado.current && s.revelar >= 1 && !document.hidden;
        // enquanto não pode girar, o relógio fica parado: depois espera o intervalo inteiro
        if (!livre) {
          s.ultimaAcao = performance.now();
          return;
        }
        if (performance.now() - s.ultimaAcao >= autoplay) girarPara(Math.round(s.alvo / passo) * passo - passo);
      }, 250);
      return () => {
        io.disconnect();
        window.clearInterval(id);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoplay, total]);

    // trackpad: deslizar de lado gira (e não deixa o navegador voltar a página)
    useEffect(() => {
      const r = raiz.current;
      if (!r) return;
      const rodinha = (e: WheelEvent) => {
        if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || Math.abs(e.deltaX) < 1) return;
        e.preventDefault();
        s.alvo -= e.deltaX * s.grausPorPx;
        s.ultimaAcao = performance.now();
        animar();
        clearTimeout(s.rodinha);
        s.rodinha = setTimeout(() => girarPara(Math.round(s.alvo / passo) * passo), 120);
      };
      r.addEventListener('wheel', rodinha, { passive: false });
      return () => r.removeEventListener('wheel', rodinha);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [total]);

    useEffect(() => () => cancelAnimationFrame(s.quadro), [s]);

    const aoApertar = (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      s.arrastando = true;
      s.moveu = false;
      s.x0 = s.ultX = e.clientX;
      s.ultT = performance.now();
      s.ang0 = s.ang;
      s.vel = 0;
    };

    const aoMover = (e: React.PointerEvent) => {
      if (!s.arrastando) return;
      const dx = e.clientX - s.x0;
      if (!s.moveu) {
        if (Math.abs(dx) < LIMIAR_ARRASTO) return;
        // só prende o ponteiro depois que virou arrasto, para o toque simples continuar sendo clique
        s.moveu = true;
        raiz.current?.setPointerCapture(e.pointerId);
        raiz.current?.setAttribute('data-arrastando', '');
        animar();
      }
      const agora = performance.now();
      const dt = Math.max(1, agora - s.ultT);
      const v = ((e.clientX - s.ultX) * s.grausPorPx * 1000) / dt;
      s.vel = s.vel * 0.6 + v * 0.4;
      s.ultX = e.clientX;
      s.ultT = agora;
      s.ang = s.alvo = s.ang0 + dx * s.grausPorPx;
    };

    const aoSoltar = (e: React.PointerEvent) => {
      if (!s.arrastando) return;
      s.arrastando = false;
      if (!s.moveu) return;
      raiz.current?.releasePointerCapture?.(e.pointerId);
      raiz.current?.removeAttribute('data-arrastando');
      s.acabouDeArrastar = true;
      setTimeout(() => (s.acabouDeArrastar = false), 0);
      // solta com embalo: segue um pouco na direção do gesto e para no cartão mais perto (no máximo 2 adiante)
      const solto = performance.now() - s.ultT > 80 ? 0 : s.vel;
      const projetado = s.ang + Math.max(-2 * passo, Math.min(2 * passo, solto * 0.22));
      s.vel = solto;
      girarPara(Math.round(projetado / passo) * passo);
    };

    const aoClicar = (k: number) => (e: React.MouseEvent) => {
      e.preventDefault();
      if (s.acabouDeArrastar) return;
      const img = e.currentTarget.querySelector('img');
      if (k === s.frente && img) callbacks.current.onItemClick?.(k % n, img);
      else irParaCartao(k);
    };

    const aoTeclar = (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowRight') girarPara(Math.round(s.alvo / passo) * passo - passo);
      else if (e.key === 'ArrowLeft') girarPara(Math.round(s.alvo / passo) * passo + passo);
      else return;
      e.preventDefault();
    };

    return (
      <div
        ref={raiz}
        role="region"
        aria-roledescription="carrossel"
        aria-label={label}
        className={cn('cg', className)}
        onPointerDown={aoApertar}
        onPointerMove={aoMover}
        onPointerUp={aoSoltar}
        onPointerCancel={aoSoltar}
        onKeyDown={aoTeclar}
      >
        <div ref={anel} className="cg-anel">
          {Array.from({ length: total }, (_, k) => {
            const item = items[k % n];
            const copia = k >= n;
            return (
              <div
                key={k}
                ref={(el) => {
                  cartoes.current[k] = el;
                }}
                className="cg-item"
                style={{ '--ar': item.aspect ?? 2 / 3 } as React.CSSProperties}
                aria-hidden={copia || undefined}
              >
                <a
                  href={item.href}
                  className="cg-cartao"
                  draggable={false}
                  tabIndex={copia ? -1 : undefined}
                  aria-label={item.alt}
                  onClick={aoClicar(k)}
                  // com o mouse em cima de uma foto, o giro automático espera
                  onPointerEnter={(e) => e.pointerType === 'mouse' && (s.emCima = true)}
                  onPointerLeave={() => (s.emCima = false)}
                >
                  <img
                    src={item.src}
                    alt=""
                    draggable={false}
                    loading={k === 0 ? 'eager' : 'lazy'}
                    decoding="async"
                    style={{ objectPosition: item.pos ?? 'center' }}
                  />
                </a>
              </div>
            );
          })}
        </div>
      </div>
    );
  },
);

CircularGallery.displayName = 'CircularGallery';

export { CircularGallery };
