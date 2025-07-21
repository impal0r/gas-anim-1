import { useEffect, useRef } from "react";
import { Stage, Layer, Circle, Rect } from "react-konva";
import { create } from "zustand";
import planck from "planck";
// import { Slider, Switch } from "@radix-ui/react-slider";
import './App.css'

const MAX_PARTICLE_NUMBER = 100
const INITIAL_PARTICLE_NUMBER = 50
const INITIAL_RADIUS = 6
const INITIAL_VELOCITY = 50

// Store with Zustand
interface SimState {
  particleNumber: number;
  radius: number;
  gravity: boolean;
  intermolecular: boolean;
  paused: boolean;
  setParticleNumber: (N_particles: number) => void;
  setRadius: (r: number) => void;
  toggleGravity: () => void;
  toggleIntermolecular: () => void;
  togglePause: () => void;
  positions: { x: number; y: number }[];
  updatePositions: (positions: { x: number; y: number }[]) => void;
}

const useSimStore = create<SimState>((set) => ({
  particleNumber: INITIAL_PARTICLE_NUMBER,
  radius: INITIAL_RADIUS,
  gravity: false,
  intermolecular: false,
  paused: false,
  positions: [],
  setParticleNumber: (N_particles) => set({ particleNumber: N_particles }),
  setRadius: (r) => set({ radius: r }),
  toggleGravity: () => set((s) => ({ gravity: !s.gravity })),
  toggleIntermolecular: () => set((s) => ({ intermolecular: !s.intermolecular })),
  togglePause: () => set((s) => ({ paused: !s.paused })),
  updatePositions: (positions) => set({ positions })
}));

const BOX_WIDTH = 500;
const BOX_HEIGHT = 500;
const GRAVITY_FORCE = 100;
const ATTRACTION_EPSILON = 100000;

function createCircle(world: planck.World, radius: number) : planck.Body {
  // random position
  const pos = new planck.Vec2(
    Math.random() * (BOX_WIDTH - 2 * radius) + radius,
    Math.random() * (BOX_HEIGHT - 2 * radius) + radius
  );
  // put it in the world
  const b = world.createDynamicBody(pos);
  b.createFixture(new planck.Circle(radius), {
    density: 1, friction: 0, restitution: 1
  });
  // seed a velocity: random direction and exactly INITIAL_VELOCITY in magnitude
  const angle = Math.random() * 2 * Math.PI;
  b.setLinearVelocity(new planck.Vec2(Math.cos(angle), Math.sin(angle)).mul(INITIAL_VELOCITY));
  return b;
}

function SimulationCanvas() {
  // refs for world, bodies, layer & circles:
  const worldRef     = useRef<planck.World>(null);
  const particlesRef    = useRef<planck.Body[]>([]);
  const prevGravity  = useRef(false);
  const prevParticleNumber = useRef<number>(null);
  const prevRadius   = useRef<number>(null);
  const layerRef     = useRef<any>(null);
  const circleRefs   = useRef<any[]>(Array(useSimStore.getState().particleNumber).fill(null));

  useEffect(() => {
    // 1) INITIALIZE WORLD + BODIES ONCE
    const world = new planck.World();
    worldRef.current = world;

    // walls
    const wall = { type: "static" } as planck.BodyDef;
    world.createBody(wall).createFixture(new planck.Edge(new planck.Vec2(0,0),       new planck.Vec2(BOX_WIDTH,0)));
    world.createBody(wall).createFixture(new planck.Edge(new planck.Vec2(0,BOX_HEIGHT), new planck.Vec2(BOX_WIDTH,BOX_HEIGHT)));
    world.createBody(wall).createFixture(new planck.Edge(new planck.Vec2(0,0),       new planck.Vec2(0,BOX_HEIGHT)));
    world.createBody(wall).createFixture(new planck.Edge(new planck.Vec2(BOX_WIDTH,0), new planck.Vec2(BOX_WIDTH,BOX_HEIGHT)));

    // particles + random velocity
    const particles: planck.Body[] = [];
    const initialRadius = useSimStore.getState().radius;
    const initialParticleNumber = useSimStore.getState().particleNumber;
    prevRadius.current = initialRadius;
    prevParticleNumber.current = initialParticleNumber;
    for (let i = 0; i < initialParticleNumber; i++) {
      particles.push(createCircle(world, initialRadius));
    }
    particlesRef.current = particles;

    // 2) THE SINGLE (recursive) ANIMATION LOOP
    let rafId: number;
    const step = () => {
      const { paused, gravity, intermolecular, radius, particleNumber } = useSimStore.getState();
      const world = worldRef.current!;

      let redraw = false;

      // A) Radius change → rebuild fixtures (even if paused)
      if (radius !== prevRadius.current) {
        redraw = true;
        particlesRef.current.forEach((body) => {
          // destroy existing fixtures
          let f = body.getFixtureList();
          while (f) {
            const next = f.getNext();
            body.destroyFixture(f);
            f = next;
          }
          // create new ones with updated radius
          body.createFixture(new planck.Circle(radius), {
            density: 1, friction: 0, restitution: 1
          });
          body.resetMassData();
        });
        prevRadius.current = radius;
      }

      // B) Change number of particles (even if paused)
      if (particleNumber != prevParticleNumber.current) {
        redraw = true;
        const new_num = particleNumber;
        const old_num = prevParticleNumber.current!;
        if (new_num > old_num) {
          // create that many circles and add them to the particles list
          for (let i = 0; i < new_num - old_num; i++) {
            particles.push(createCircle(world, radius));
          }
        }
        else {
          // destroy the bodies in the planck.js world, and stop circles from displaying
          for (let i = old_num - 1; i > new_num - 1; i--) {
            world.destroyBody(particles.pop()!);
            circleRefs.current[i].setAttrs({x: -100, y: -100});
            //^maybe there's a better way but just putting them outside the canvas works
          }
        }
        prevParticleNumber.current = particleNumber;
      }

      // C) Gravity toggle (even if paused)
      if (gravity !== prevGravity.current) {
        world.setGravity(gravity
          ? new planck.Vec2(0, GRAVITY_FORCE)
          : new planck.Vec2(0, 0)
        );
        prevGravity.current = gravity;
      }

      if (!paused) {
        redraw = true;

        // D) Intermolecular (hard‐core + attractive tail) (only if not paused)
        if (intermolecular) {
          const sigma = prevRadius.current! * 2;
          const r0 = sigma * 1.1;
          const rc = sigma * 30;
          for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
              const A = particles[i], B = particles[j];
              const pA = A.getPosition(), pB = B.getPosition();
              const dx = pB.x - pA.x, dy = pB.y - pA.y;
              const dist = Math.hypot(dx, dy);
              if (dist > r0 && dist < rc) {
                const fMag = 4 * ATTRACTION_EPSILON * Math.pow(sigma / dist, 6);
                const fx = (dx / dist) * fMag, fy = (dy / dist) * fMag;
                A.applyForce(new planck.Vec2( fx, fy), pA);
                B.applyForce(new planck.Vec2(-fx,-fy), pB);
              }
            }
          }
        }

        // E) Step the world
        world.step(1/60);
      }

      if (redraw) {
        // F) Imperatively update all 100 circles
        particlesRef.current.forEach((b, i) => {
          const p = b.getPosition();
          const c = circleRefs.current[i];
          if (c) {
            c.setAttrs({
              x: p.x + 40,
              y: p.y + 40,
              radius: prevRadius.current
            });
          }
        });
        // G) Single batch draw
        layerRef.current?.batchDraw();
      }

      // always re-schedule, even if paused
      rafId = requestAnimationFrame(step);
    };

    step(); // recursion
    return () => cancelAnimationFrame(rafId);
  }, []); // <- set the animation loop going: do this only once

  // 3) RENDER ONCE
  return (
    <div className="flex-shrink-0 h-[580px] w-[580px] relative select-none">
      <Stage width={BOX_WIDTH + 80} height={BOX_HEIGHT + 80}>
        <Layer ref={layerRef}>
          <Rect
            x={40} y={40}
            width={BOX_WIDTH} height={BOX_HEIGHT}
            cornerRadius={20}
            fill="#111" stroke="#888" strokeWidth={2}
          />
          {Array.from({ length: MAX_PARTICLE_NUMBER }).map((_, i) => (
            <Circle
              key={i}
              ref={node => { circleRefs.current[i] = node; }}
              // NO radius/x/y in props; they are set by the script each step
              fill="#ccc"
              stroke="#fff"
            />
          ))}
        </Layer>
      </Stage>
    </div>
  );
}


function ControlPanel() {
  const {
    particleNumber,
    setParticleNumber,
    radius,
    setRadius,
    gravity,
    toggleGravity,
    intermolecular,
    toggleIntermolecular,
    paused,
    togglePause
  } = useSimStore();

  return (
    <div className="flex flex-col gap-4 ml-8 mt-10 text-white">
      <div>
        <label className="text-sm">Particle Number</label>
        <input
          type="range"
          min={1}
          max={100}
          step={1}
          value={particleNumber}
          onChange= {(e) => setParticleNumber(Number(e.target.value))}
          className="w-48" />
      </div>
      <div>
        <label className="text-sm">Particle Size</label>
        <input
          type="range"
          min={2}
          max={12}
          step={.1}
          value={radius}
          onChange= {(e) => setRadius(Number(e.target.value))}
          className="w-48" />
      </div>
      <div>
        <label className="text-sm">Intermolecular Forces</label>
        <input type="checkbox" checked={intermolecular} onChange={toggleIntermolecular} />
      </div>
      <div>
        <label className="text-sm">Gravity</label>
        <input type="checkbox" checked={gravity} onChange={toggleGravity} />
      </div>
      <div>
        <label className="text-sm">Pause</label>
        <input type="checkbox" checked={paused} onChange={togglePause} />
      </div>
    </div>
  );
}

function App() {
  return (
    <div className="flex flex-nowrap items-start bg-black min-h-screen text-white font-sans p-10">
      <SimulationCanvas />
      <ControlPanel />
    </div>
  );
}

export default App
