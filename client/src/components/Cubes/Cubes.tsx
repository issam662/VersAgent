import { useCallback, useEffect, useRef } from 'react';
import gsap from 'gsap';
import './Cubes.css';

interface CubesProps {
    gridSize?: number;
    cubeSize?: number;
    maxAngle?: number;
    radius?: number;
    easing?: string;
    duration?: { enter: number; leave: number };
    cellGap?: number | { col?: number; row?: number };
    borderStyle?: string;
    faceColor?: string;
    shadow?: boolean | string;
    autoAnimate?: boolean;
    rippleOnClick?: boolean;
    rippleColor?: string;
    rippleSpeed?: number;
    isPaused?: boolean;
}

const Cubes = ({
    gridSize = 10,
    cubeSize,
    maxAngle = 45,
    radius = 3,
    easing = 'power3.out',
    duration = { enter: 0.3, leave: 0.6 },
    cellGap,
    borderStyle = '1px solid #fff',
    faceColor = '#060010',
    shadow = false,
    autoAnimate = true,
    rippleOnClick = true,
    rippleColor = '#fff',
    rippleSpeed = 2,
    isPaused = false
}: CubesProps) => {
    const sceneRef = useRef<HTMLDivElement>(null);
    const rafRef = useRef<number | null>(null);
    const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const userActiveRef = useRef(false);
    const simPosRef = useRef({ x: 0, y: 0 });
    const simTargetRef = useRef({ x: 0, y: 0 });
    const simRAFRef = useRef<number | null>(null);

    const colGap = typeof cellGap === 'number' ? `${cellGap}px` : cellGap?.col !== undefined ? `${cellGap.col}px` : '5%';
    const rowGap = typeof cellGap === 'number' ? `${cellGap}px` : cellGap?.row !== undefined ? `${cellGap.row}px` : '5%';

    const enterDur = duration.enter;
    const leaveDur = duration.leave;

    const tiltAt = useCallback(
        (rowCenter: number, colCenter: number) => {
            if (!sceneRef.current || isPaused) return;
            sceneRef.current.querySelectorAll('.cube').forEach(cube => {
                const r = +(cube as HTMLElement).dataset.row!;
                const c = +(cube as HTMLElement).dataset.col!;
                const dist = Math.hypot(r - rowCenter, c - colCenter);
                if (dist <= radius) {
                    const pct = 1 - dist / radius;
                    const angle = pct * maxAngle;
                    // Calculate direction FROM cube TO mouse for proper facing
                    const deltaRow = rowCenter - r;
                    const deltaCol = colCenter - c;
                    const magnitude = Math.max(Math.hypot(deltaRow, deltaCol), 0.01);
                    // Tilt toward mouse: rotateX tilts up/down, rotateY tilts left/right
                    gsap.to(cube, {
                        duration: enterDur,
                        ease: easing,
                        overwrite: true,
                        rotateX: -(deltaRow / magnitude) * angle,
                        rotateY: (deltaCol / magnitude) * angle
                    });
                } else {
                    gsap.to(cube, {
                        duration: leaveDur,
                        ease: 'power3.out',
                        overwrite: true,
                        rotateX: 0,
                        rotateY: 0
                    });
                }
            });
        },
        [radius, maxAngle, enterDur, leaveDur, easing, isPaused]
    );

    const onPointerMove = useCallback(
        (e: PointerEvent) => {
            if (isPaused) return;
            userActiveRef.current = true;
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);

            const rect = sceneRef.current!.getBoundingClientRect();
            const cellW = rect.width / gridSize;
            const cellH = rect.height / gridSize;
            const colCenter = (e.clientX - rect.left) / cellW;
            const rowCenter = (e.clientY - rect.top) / cellH;

            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(() => tiltAt(rowCenter, colCenter));

            idleTimerRef.current = setTimeout(() => {
                userActiveRef.current = false;
            }, 3000);
        },
        [gridSize, tiltAt, isPaused]
    );

    const resetAll = useCallback(() => {
        if (!sceneRef.current) return;
        sceneRef.current.querySelectorAll('.cube').forEach(cube =>
            gsap.to(cube, {
                duration: leaveDur,
                rotateX: 0,
                rotateY: 0,
                ease: 'power3.out'
            })
        );
    }, [leaveDur]);

    const onClick = useCallback(
        (e: MouseEvent) => {
            if (!rippleOnClick || !sceneRef.current || isPaused) return;
            const rect = sceneRef.current.getBoundingClientRect();
            const cellW = rect.width / gridSize;
            const cellH = rect.height / gridSize;

            const clientX = e.clientX;
            const clientY = e.clientY;

            const colHit = Math.floor((clientX - rect.left) / cellW);
            const rowHit = Math.floor((clientY - rect.top) / cellH);

            const baseRingDelay = 0.15;
            const baseAnimDur = 0.3;
            const baseHold = 0.6;

            const spreadDelay = baseRingDelay / rippleSpeed;
            const animDuration = baseAnimDur / rippleSpeed;
            const holdTime = baseHold / rippleSpeed;

            const rings: { [key: number]: Element[] } = {};
            sceneRef.current.querySelectorAll('.cube').forEach(cube => {
                const r = +(cube as HTMLElement).dataset.row!;
                const c = +(cube as HTMLElement).dataset.col!;
                const dist = Math.hypot(r - rowHit, c - colHit);
                const ring = Math.round(dist);
                if (!rings[ring]) rings[ring] = [];
                rings[ring].push(cube);
            });

            Object.keys(rings)
                .map(Number)
                .sort((a, b) => a - b)
                .forEach(ring => {
                    const delay = ring * spreadDelay;
                    const faces = rings[ring].flatMap(cube => Array.from(cube.querySelectorAll('.cube-face')));

                    gsap.to(faces, {
                        backgroundColor: rippleColor,
                        duration: animDuration,
                        delay,
                        ease: 'power3.out'
                    });
                    gsap.to(faces, {
                        backgroundColor: faceColor,
                        duration: animDuration,
                        delay: delay + animDuration + holdTime,
                        ease: 'power3.out'
                    });
                });
        },
        [rippleOnClick, gridSize, faceColor, rippleColor, rippleSpeed, isPaused]
    );

    useEffect(() => {
        if (!autoAnimate || !sceneRef.current || isPaused) {
            if (isPaused) resetAll();
            return;
        }
        simPosRef.current = {
            x: Math.random() * gridSize,
            y: Math.random() * gridSize
        };
        simTargetRef.current = {
            x: Math.random() * gridSize,
            y: Math.random() * gridSize
        };
        const speed = 0.02;
        const loop = () => {
            if (!userActiveRef.current) {
                const pos = simPosRef.current;
                const tgt = simTargetRef.current;
                pos.x += (tgt.x - pos.x) * speed;
                pos.y += (tgt.y - pos.y) * speed;
                tiltAt(pos.y, pos.x);
                if (Math.hypot(pos.x - tgt.x, pos.y - tgt.y) < 0.1) {
                    simTargetRef.current = {
                        x: Math.random() * gridSize,
                        y: Math.random() * gridSize
                    };
                }
            }
            simRAFRef.current = requestAnimationFrame(loop);
        };
        simRAFRef.current = requestAnimationFrame(loop);
        return () => {
            if (simRAFRef.current != null) {
                cancelAnimationFrame(simRAFRef.current);
            }
        };
    }, [autoAnimate, gridSize, tiltAt, isPaused, resetAll]);

    useEffect(() => {
        const el = sceneRef.current;
        if (!el) return;

        // Listen on document for mouse move so cubes respond even when behind content
        document.addEventListener('pointermove', onPointerMove as any);
        el.addEventListener('pointerleave', resetAll);
        el.addEventListener('click', onClick as any);

        return () => {
            document.removeEventListener('pointermove', onPointerMove as any);
            el.removeEventListener('pointerleave', resetAll);
            el.removeEventListener('click', onClick as any);

            rafRef.current != null && cancelAnimationFrame(rafRef.current);
            idleTimerRef.current && clearTimeout(idleTimerRef.current);
        };
    }, [onPointerMove, resetAll, onClick]);

    const cells = Array.from({ length: gridSize });
    const sceneStyle: React.CSSProperties = {
        gridTemplateColumns: cubeSize ? `repeat(${gridSize}, ${cubeSize}px)` : `repeat(${gridSize}, 1fr)`,
        gridTemplateRows: cubeSize ? `repeat(${gridSize}, ${cubeSize}px)` : `repeat(${gridSize}, 1fr)`,
        columnGap: colGap,
        rowGap: rowGap
    };
    const wrapperStyle: React.CSSProperties & { [key: string]: string } = {
        '--cube-face-border': borderStyle,
        '--cube-face-bg': faceColor,
        '--cube-face-shadow': shadow === true ? '0 0 6px rgba(0,0,0,.5)' : shadow || 'none',
        ...(cubeSize
            ? {
                width: `${gridSize * cubeSize}px`,
                height: `${gridSize * cubeSize}px`
            }
            : {})
    };

    return (
        <div className="cubes-animation" style={wrapperStyle}>
            <div ref={sceneRef} className="cubes-animation--scene" style={sceneStyle}>
                {cells.map((_, r) =>
                    cells.map((__, c) => (
                        <div key={`${r}-${c}`} className="cube" data-row={r} data-col={c}>
                            <div className="cube-face cube-face--top" />
                            <div className="cube-face cube-face--bottom" />
                            <div className="cube-face cube-face--left" />
                            <div className="cube-face cube-face--right" />
                            <div className="cube-face cube-face--front" />
                            <div className="cube-face cube-face--back" />
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default Cubes;
