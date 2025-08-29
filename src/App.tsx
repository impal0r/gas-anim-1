import { useEffect, useRef } from "react";
import { Stage, Layer, Circle, Rect } from "react-konva";
import { create } from "zustand";
import planck from "planck";
// import { Slider, Switch } from "@radix-ui/react-slider";
import './App.css'
// Elixir errors is a custom utility library in this project
import { ErrorBox, showError, debugAssert, } from "./elixir-errors.tsx"

interface SliderParams {
  min: number;
  max: number;
  step: number;
  default: number;
}

// box parameters
const BOX_WIDTH = 500;
const BOX_HEIGHT = 500;
const BOX_X_INSET = 40;
const BOX_Y_INSET = 40;
// particle parameters
const MAX_PARTICLE_NUMBER = 100
const INITIAL_PARTICLE_NUMBER = 50
// physics parameters (distance units map to pixels, time is in seconds)
const INITIAL_VELOCITY = 50; //all particles given this velocity, in a random direction
const GRAVITY_FORCE = 100; //TODO: rename to be more precise
const ATTRACTION_EPSILON = 100000;
// control parameters
const N_SLIDER_VALS: SliderParams = {min:1, max:MAX_PARTICLE_NUMBER, step:1, default: INITIAL_PARTICLE_NUMBER};
const RADIUS_SLIDER_VALS: SliderParams = {min:2, max:12, step:0.1, default:6}; //pixels
const GRAVITY_SLIDER_VALS: SliderParams = {min:0, max:1, step:0.01, default:0}; //fraction of max gravity
const CONSERV_SLIDER_VALS: SliderParams = {min:0.8, max:1.2, step:0.01, default:1}; //restitution coefficient (aka energy conservation)
const INTERMOL_SLIDER_VALS: SliderParams = {min:0, max:1, step:0.01, default:0}; //fraction of max intermol force
const INTERMOL_SCALE_SLIDER_VALS: SliderParams = {min:0.1, max:5, step:0.1, default:1}; //fraction of default
const SPEED_SLIDER_VALS: SliderParams = {min:0.1, max:3, step:0.1, default:1}; //simulation seconds per second

//TODO: make the speed slider logarithmic


// Store state with Zustand
interface SimState {
  isPaused: boolean;
  particleNumber: number;
  radius: number;
  gravity: number;
  intermolecular: number;
  identicalParticles: boolean;
  lawsOfMotion: 'newton' | 'floating' | 'maze';
  collisionRestitution: number;
  intermolecularScale: number;
  animationSpeed: number;
  positions: { x: number; y: number }[];
  //requestedTempChange: 1 means no change requested.
  // Other values mean the KE of each particle needs to be scaled by that ratio.
  // This value is set by the control panel when the + and - buttons are pressed,
  // and then read (and reset to 1) in the animation loop
  requestedTempChange: number; 
  // Setters
  togglePaused: () => void;
  setParticleNumber: (N_particles: number) => void;
  setRadius: (r: number) => void;
  setGravity: (g: number) => void;
  setIntermolecular: (im: number) => void;
  setIdenticalParticles: (identical: boolean) => void;
  setLawsOfMotion: (laws: 'newton' | 'floating' | 'maze') => void;
  setCollisionRestitution: (restitution: number) => void;
  setIntermolecularScale: (scale: number) => void;
  setAnimationSpeed: (speed: number) => void;
  updatePositions: (positions: { x: number; y: number }[]) => void;
}

const useSimStore = create<SimState>((set) => ({
  isPaused: false,
  particleNumber: N_SLIDER_VALS.default,
  radius: RADIUS_SLIDER_VALS.default,
  gravity: GRAVITY_SLIDER_VALS.default,
  intermolecular: INTERMOL_SLIDER_VALS.default,
  identicalParticles: true,
  lawsOfMotion: 'newton' as const,
  collisionRestitution: CONSERV_SLIDER_VALS.default,
  intermolecularScale: INTERMOL_SCALE_SLIDER_VALS.default,
  animationSpeed: SPEED_SLIDER_VALS.default,
  positions: [],
  requestedTempChange: 1,
  setParticleNumber: (N_particles) => set({ particleNumber: N_particles }),
  setRadius: (r) => set({ radius: r }),
  setGravity: (g) => set({ gravity: g }),
  setIntermolecular: (intermol) => set({ intermolecular: intermol }),
  setIdenticalParticles: (identical) => set({ identicalParticles: identical }),
  setLawsOfMotion: (laws) => set({ lawsOfMotion: laws }),
  setCollisionRestitution: (restitution) => set({ collisionRestitution: restitution }),
  setIntermolecularScale: (scale) => set({ intermolecularScale: scale }),
  setAnimationSpeed: (speed) => set({ animationSpeed: speed }),
  togglePaused: () => set((s) => ({ isPaused: !s.isPaused })),
  updatePositions: (positions) => set({ positions })
}));

function createCircle(world: planck.World, radius: number, restitution: number) : planck.Body {
  // random position
  const pos = new planck.Vec2(
    Math.random() * (BOX_WIDTH - 2 * radius) + radius,
    Math.random() * (BOX_HEIGHT - 2 * radius) + radius
  );
  // put it in the world
  const b = world.createDynamicBody(pos);
  b.createFixture(new planck.Circle(radius), {
    density: 1, friction: 0, restitution: restitution
  });
  // seed a velocity: random direction and exactly INITIAL_VELOCITY in magnitude
  // (only doing it this way because it was easy to implement. the gas will quickly
  //  reach thermodynamic equilibrium anyway)
  const angle = Math.random() * 2 * Math.PI;
  b.setLinearVelocity(new planck.Vec2(Math.cos(angle), Math.sin(angle)).mul(INITIAL_VELOCITY));
  return b;
}

// // Function to calculate average kinetic energy for a list of particles
// function getAverageKineticEnergy(particles: planck.Body[]) {
//   if (!particles.length) return 0;
//   let doubleTotalKE = 0;
//   for (let i = 0; i < particles.length; i++) {
//     const speedSq = particles[i].getLinearVelocity().lengthSquared();
//     // mass = 1 for all particles
//     doubleTotalKE += speedSq;
//   }
//   return doubleTotalKE / particles.length * 0.5;
// }

function SimulationCanvas() {
  // refs for world, bodies, layer & circles:
  const worldRef     = useRef<planck.World>(null);
  const particlesRef    = useRef<planck.Body[]>([]);
  const prevGravity  = useRef<number>(null);
  const prevParticleNumber = useRef<number>(null);
  const prevRadius   = useRef<number>(null);
  const prevCollisionRestitution = useRef<number>(null);
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
    const initialCollisionRestitution = useSimStore.getState().collisionRestitution;
    prevRadius.current = initialRadius;
    prevParticleNumber.current = initialParticleNumber;
    prevCollisionRestitution.current = initialCollisionRestitution;
    for (let i = 0; i < initialParticleNumber; i++) {
      particles.push(createCircle(world, initialRadius, initialCollisionRestitution));
    }
    particlesRef.current = particles;

    // 2) THE SINGLE (recursive) ANIMATION LOOP
    let rafId: number; // ID returned by requestAnimationFrame
    const step = () => {
      const {
        isPaused,
        gravity,
        intermolecular,
        radius,
        particleNumber,
        collisionRestitution,
        // intermolecularScale,
        // lawsOfMotion,
        animationSpeed } = useSimStore.getState();
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
            density: 1, friction: 0, restitution: prevCollisionRestitution.current!
          });
          body.resetMassData();
        });
        prevRadius.current = radius;
      }

      // A2) Collision restitution change → rebuild fixtures (even if paused)
      if (collisionRestitution !== prevCollisionRestitution.current) {
        redraw = true;
        particlesRef.current.forEach((body) => {
          // destroy existing fixtures
          let f = body.getFixtureList();
          while (f) {
            const next = f.getNext();
            body.destroyFixture(f);
            f = next;
          }
          // create new ones with updated restitution
          body.createFixture(new planck.Circle(prevRadius.current!), {
            density: 1, friction: 0, restitution: collisionRestitution
          });
          body.resetMassData();
        });
        prevCollisionRestitution.current = collisionRestitution;
      }

      // B) Change number of particles (even if paused)
      if (particleNumber != prevParticleNumber.current) {
        redraw = true;
        const new_num = particleNumber;
        const old_num = prevParticleNumber.current!;
        if (new_num > old_num) {
          // create that many circles and add them to the particles list
          for (let i = 0; i < new_num - old_num; i++) {
            particles.push(createCircle(world, radius, collisionRestitution));
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
        world.setGravity(new planck.Vec2(0, gravity * GRAVITY_FORCE));
        prevGravity.current = gravity;
      }
      
      if (!isPaused) {
        redraw = true;

        // TODO: Implement temperature controls (boost/shrink KE of particles)
        // TODO: Implement intermolecular scale in the force calculation
        // TODO: Implement particle reset functionality (Random/Linear)

        // D) Intermolecular (hard‐core + attractive tail) (only if not paused)
        if (intermolecular > 0) {
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
                const fMag = 4 * ATTRACTION_EPSILON * Math.pow(sigma / dist, 6) * intermolecular;
                const fx = (dx / dist) * fMag, fy = (dy / dist) * fMag;
                A.applyForce(new planck.Vec2( fx, fy), pA);
                B.applyForce(new planck.Vec2(-fx,-fy), pB);
              }
            }
          }
        }

        // E) Step the world
        let dt = 1/60 * animationSpeed;
        world.step(dt);
      }

      if (redraw) {
        // F) Imperatively update all 100 circles
        particlesRef.current.forEach((b, i) => {
          const p = b.getPosition();
          const c = circleRefs.current[i];
          if (c) {
            c.setAttrs({
              x: p.x + BOX_X_INSET,
              y: p.y + BOX_Y_INSET,
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
    <div className="flex-shrink-0 h-[580px] w-[580px] select-none">
      <Stage width={BOX_WIDTH + 80} height={BOX_HEIGHT + 80}>
        <Layer ref={layerRef}>
          <Rect
            x={BOX_X_INSET} y={BOX_Y_INSET}
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

let controlpanelhasrun: boolean = false;
function ControlPanel() {
  const {
    particleNumber,
    setParticleNumber,
    radius,
    setRadius,
    gravity,
    setGravity,
    intermolecular,
    setIntermolecular,
    isPaused: paused,
    togglePaused,
    identicalParticles,
    setIdenticalParticles,
    lawsOfMotion,
    setLawsOfMotion,
    collisionRestitution,
    setCollisionRestitution,
    intermolecularScale,
    setIntermolecularScale,
    animationSpeed,
    setAnimationSpeed
  } = useSimStore();

  // These assertions should only run once at startup
  if (!controlpanelhasrun) {
    debugAssert(particleNumber == N_SLIDER_VALS.default,
      `Particle number in SimState (${particleNumber}) should match value on slider (${N_SLIDER_VALS.default})`);
    debugAssert(radius == RADIUS_SLIDER_VALS.default,
      `Particle size in SimState (${radius}) should match value on slider (${RADIUS_SLIDER_VALS.default})`);
    debugAssert(gravity == GRAVITY_SLIDER_VALS.default,
      `Gravity strength in SimState (${gravity}) should match value on slider (${GRAVITY_SLIDER_VALS.default})`);
    debugAssert(intermolecular == INTERMOL_SLIDER_VALS.default,
      `Intermolecular force strength in SimState (${intermolecular}) should match value on slider (${INTERMOL_SLIDER_VALS.default})`);
    debugAssert(collisionRestitution == CONSERV_SLIDER_VALS.default,
      `Energy conservation in SimState (${collisionRestitution}) should match value on slider (${CONSERV_SLIDER_VALS.default})`);
    debugAssert(intermolecularScale == INTERMOL_SCALE_SLIDER_VALS.default,
      `Intermolecular force scale in SimState (${intermolecularScale}) should match value on slider (${INTERMOL_SCALE_SLIDER_VALS.default})`);
    debugAssert(animationSpeed == SPEED_SLIDER_VALS.default,
      `Animation speed in SimState (${animationSpeed}) should match value on slider (${SPEED_SLIDER_VALS.default})`);
    controlpanelhasrun = true;
  }

  return (
    <div className="flex flex-col gap-4 ml-8 mt-10 text-white">
      <div>
        <label className="text-sm">Particle Number </label>
        <input
          type="range"
          min={N_SLIDER_VALS.min}
          max={N_SLIDER_VALS.max}
          step={N_SLIDER_VALS.step}
          value={particleNumber}
          onChange={(e) => setParticleNumber(Number(e.target.value))}
          className="w-48" />
      </div>
      
      <div>
        <input
          type="checkbox"
          checked={identicalParticles}
          onChange={(e) => setIdenticalParticles(e.target.checked)}
          className="ml-2" />
        <label className="text-sm"> Identical Particles</label>
      </div>
      
      <div>
        <label className="text-sm">Particle Size </label>
        <input
          type="range"
          min={RADIUS_SLIDER_VALS.min}
          max={RADIUS_SLIDER_VALS.max}
          step={RADIUS_SLIDER_VALS.step}
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value))}
          className="w-48" />
      </div>
      
      <div>
        <div className="flex gap-2 mt-1">
          <span className="text-sm">Reset Particles: </span>
          <button
            onClick={() => {
              // TODO: Implement random particle reset
            }}
            className="px-3 py-1 bg-purple-600 hover:bg-purple-700 rounded text-sm">
            Random
          </button>
          <button
            onClick={() => {
              // TODO: Implement linear particle reset
            }}
            className="px-3 py-1 bg-purple-600 hover:bg-purple-700 rounded text-sm">
            Linear
          </button>
        </div>
      </div>
      
      <div>
        <label className="text-sm">Laws of Motion</label>
        <select
          value={lawsOfMotion}
          onChange={(e) => setLawsOfMotion(e.target.value as 'newton' | 'floating' | 'maze')}
          className="ml-2 bg-gray-800 text-white px-2 py-1 rounded">
          <option value="newton">Newton</option>
          <option value="floating">Floating</option>
          <option value="maze">Maze</option>
        </select>
      </div>
      
      <div>
        <label className="text-sm">Gravity </label>
        <input
          type="range"
          min={GRAVITY_SLIDER_VALS.min}
          max={GRAVITY_SLIDER_VALS.max}
          step={GRAVITY_SLIDER_VALS.step}
          value={gravity}
          onChange={(e) => setGravity(Number(e.target.value))}
          className="w-48"
          disabled={lawsOfMotion !== 'newton'} />
        <span className="ml-2">{gravity.toFixed(2)}</span>
      </div>
      
      <div>
        <label className="text-sm">Collision Energy Conservation </label>
        <input
          type="range"
          min={CONSERV_SLIDER_VALS.min}
          max={CONSERV_SLIDER_VALS.max}
          step={CONSERV_SLIDER_VALS.step}
          value={collisionRestitution}
          onChange={(e) => setCollisionRestitution(Number(e.target.value))}
          className="w-48"
          disabled={intermolecular > 0} />
        <span className="ml-2">{collisionRestitution.toFixed(2)}</span>
      </div>
      
      <div>
        <input
          type="checkbox"
          checked={intermolecular > 0}
          onChange={(e) => setIntermolecular(e.target.checked ? 0.5 : 0)}
          className="ml-2"
          disabled={lawsOfMotion !== 'newton'} />
        <label className="text-sm"> Enable Intermolecular Forces</label>
      </div>
      
      <div>
        <label className="text-sm">Intermolecular Forces Strength </label>
        <input
          type="range"
          min={INTERMOL_SLIDER_VALS.min}
          max={INTERMOL_SLIDER_VALS.max}
          step={INTERMOL_SLIDER_VALS.step}
          value={intermolecular}
          onChange={(e) => setIntermolecular(Number(e.target.value))}
          className="w-48"
          disabled={lawsOfMotion !== 'newton'} />
        <span className="ml-2">{intermolecular.toFixed(2)}</span>
      </div>
      
      <div>
        <label className="text-sm">Intermolecular Forces Scale </label>
        <input
          type="range"
          min={INTERMOL_SCALE_SLIDER_VALS.min}
          max={INTERMOL_SCALE_SLIDER_VALS.max}
          step={INTERMOL_SCALE_SLIDER_VALS.step}
          value={intermolecularScale}
          onChange={(e) => setIntermolecularScale(Number(e.target.value))}
          className="w-48"
          disabled={lawsOfMotion !== 'newton'} />
        <span className="ml-2">{intermolecularScale.toFixed(1)}</span>
      </div>
      
      <div>
        <label className="text-sm">Animation Speed </label>
        <input
          type="range"
          min={SPEED_SLIDER_VALS.min}
          max={SPEED_SLIDER_VALS.max}
          step={SPEED_SLIDER_VALS.step}
          value={animationSpeed}
          onChange={(e) => setAnimationSpeed(Number(e.target.value))}
          className="w-48" />
        <span className="ml-2">{animationSpeed.toFixed(1)}x</span>
      </div>
      
      <div>
        <div className="flex gap-2 mt-1">
          <label className="text-sm">Temperature</label>
          <button
            onClick={() => {
              // TODO: Implement temperature decrease - shrink KE of each particle
            }}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded">
            -
          </button>
          <button
            onClick={() => {
              // TODO: Implement temperature increase - boost KE of each particle
            }}
            className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded">
            +
          </button>
        </div>
      </div>
      
      <div>
        <button
          onClick={togglePaused}
          className={`px-6 py-2 rounded font-medium ${
            paused 
              ? 'bg-green-600 hover:bg-green-700' 
              : 'bg-red-600 hover:bg-red-700'
          }`}>
          {paused ? 'Unpause' : 'Pause'}
        </button>
      </div>
    </div>
  );
}

function ExplanationBox() {
  return(
    <div className="text-left">
      <h2 className="pt-10 text-lg font-bold">Explanation</h2>
      <p className="mt-4">
        An <b>ideal gas</b> is a theoretical concept that makes real-world gases easy to model, because
        ideal gases follow the neat "ideal gas law": pV = nRT. This model applies well to many real-world
        gases, for example atmospheric gases at room temperature and pressure. When we model gases,
        we usually put them in a conceptual closed container, like the grey box above. Either the gas we are modelling is really enclosed in a
        container (e.g. a syringe), or we are modelling a small part of a large volume of gas (e.g. the atmosphere),
        and the walls of the container represent other parcels of gas in the large volume.
      </p>
      <p className="mt-4">
          There are <b>8 key assumptions</b> that define an ideal gas:
      </p>
      <ul className="list-inside list-disc">
        <li>A large number of particles</li>
        <li>The particles are identical</li>
        <li>The particles are small: they have a much smaller total volume/size than their container, or the space that the gas occupies</li>
        <li>The particles follow Newton's laws of motion</li>
        <li>The particles move randomly in all directions</li>
        <li>Collisions (both between particles, and with the container's walls) are instantaneous</li>
        <li>Collisions are elastic</li>
        <li>There are no forces between particles ("intermolecular forces"), except in the instant they collide</li>
      </ul>
      <p className="mt-4">
        The first 5 assumptions describe the <b>kinetic theory of gases</b>, which is the basic principle
        underlying widely accepted models of gases today. This theory says that
        gases are actually made of a large number of small particles - too small for us to see, and too
        many to count. There are over 10^24 particles in a single gram of air! The ideas behind the
        kinetic theory were gradually developed by many scientists in the 17th and 18th centuries,
        after steam engines had made <b>thermodynamics</b> a valuable subject to study. The key figures who
        finalised the theory were James Clerk Maxwell and Ludwig Boltzmann. The kinetic theory was
        controversial at the time, because many scientists thought that gases were continuous substances
        (ones that are infinitely divisible, and don't have a smallest element like a particle) - but it was influential because it provided
        a way to link the laws of thermodynamics with Newton's fundamental laws of motion.
      </p>
      <p className="mt-4">
        Clear experimental evidence for the kinetic theory came at the start of the 20th century,
        when Albert Einstein and Marian Smoluckowski published papers that used kinetic theory to make
        predictions about <b>Brownian motion</b>, and these predictions turned out to agree with experiments.
      </p>
      <p className="mt-4">
        Although ideal gases can be described using kinetic theory, it can also be used to model some
        types of <b>non-ideal gases</b>.
        This means breaking some of the assumptions of an ideal gas.
        For example, to model the way that gases condense into liquids, you would have to add
        intermolecular forces back into the model.
        As another example, when modelling what happens at very high pressure, you can no longer
        assume that the total volume of the particles is much smaller than that of the container.
      </p>
      <p className="mt-4">
        Kinetic theory starts to fail when quantum effects become significant, for example
        in helium, which remains a gas at very low temperatures. To make accurate predictions about
        helium at low temperatures, theoretical physicists have to model the gas in a different way.
      </p>
    </div>
  );
}

function App() {
  try {
    return (
      <div className="block">
        <h1 className="pb-10">What's an ideal gas?</h1>
        <div className="flex flex-nowrap items-start bg-black min-h-screen text-white font-sans p-10">
          <SimulationCanvas />
          <ControlPanel />
        </div>
        <ErrorBox />
        <ExplanationBox />
      </div>
    );
  }
  catch (error) {
    if (typeof error === "string") {
      showError(error);
    }
    else if (error instanceof Error) {
      showError(error.message);
    }
    else {
      showError("Unknown Error");
    }
    return(<ErrorBox />);
  }
}

export default App
