/**
 * Rigs and animates the Tripo police officer: node tools/assets/build-cop.mjs [--debug]
 *
 * In:  asset-sources/cop-model.glb (the static Tripo mesh, ~2M triangles, facing +X) and
 *      public/assets/characters/thief.glb (Quaternius' CC0 Ninja: its skeleton's clips are the motion source).
 * Out: public/assets/characters/cop.glb: ~16k triangles, 1.8 m tall, facing +Z, one base-colour texture, a skeleton
 *      named like the Quaternius CharacterArmature (Root, Body, Hips, Abdomen, Torso, Neck, Head, Shoulder/UpperArm/
 *      LowerArm/Fist, UpperLeg/LowerLeg/Foot, .L and .R) and the Ninja's 14 clips under the same names
 *      ('CharacterArmature|Run' and so on), so src/render/assets/characters.ts can map them unchanged.
 *      With --debug, also artifacts/cop/cop.weights.glb, coloured by each vertex's main bone.
 *
 * How:
 * 1. Decimate (meshoptimizer) and keep only the base colour (the game draws toon shading).
 * 2. Joints are placed by hand from slices of the mesh (JOINTS below, in the mesh's own units); skin weights come
 *    from distance to each bone's capsule, limited by body region so hands never take the hips or legs, then
 *    smoothed over the surface.
 * 3. Clips are retargeted from the Ninja: limbs copy the world direction of the matching Ninja bone (a per-bone frame
 *    correction maps his crouched rest pose onto this A-pose), the spine and head copy his motion relative to his
 *    rest. This body is a chibi (the head is 44% of the height, the arms are short), so a few clips keep less arm
 *    swing, elbow bend or head turn (ARM_SWING, ELBOW_KEEP, HEAD_KEEP) to keep the fists out of the face.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import * as THREE from 'three';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE_MESH = path.join(root, 'asset-sources', 'cop-model.glb');
const SOURCE_RIG = path.join(root, 'public', 'assets', 'characters', 'thief.glb');
const OUTPUT = path.join(root, 'public', 'assets', 'characters', 'cop.glb');
const DEBUG_OUTPUT = path.join(root, 'artifacts', 'cop', 'cop.weights.glb');
const debug = process.argv.includes('--debug');

/** Triangles kept from the Tripo mesh, and the texture's largest side, px. */
const TRIANGLES = 16000;
const TEXTURE_SIZE = 1024;

// ---------------------------------------------------------------- body layout (the mesh's units, turned to face +Z)
/** Height of the Tripo mesh and its lowest point, in its own units. */
const SOURCE_HEIGHT = 0.9793;
const GROUND = -0.4898;
/** Metres per mesh unit: the cop is 1.8 m tall. */
const SCALE = 1.8 / SOURCE_HEIGHT;
/** Tripo space (facing +X) to rig space (facing +Z, feet at y = 0, metres). */
const toRig = (x, y, z) => [-z * SCALE, (y - GROUND) * SCALE, x * SCALE];
/** A point measured on the turned mesh (x to his left, y up, z forward), in rig space. */
const at = (x, y, z) => [x * SCALE, (y - GROUND) * SCALE, z * SCALE];

/** Name, parent and position of every joint; .L joints are mirrored to .R. */
const JOINTS = [
  ['Root', null, at(0, GROUND, 0.03)],
  ['Body', 'Root', at(0, -0.09, 0.04)],
  ['Hips', 'Body', at(0, -0.085, 0.04)],
  ['Abdomen', 'Hips', at(0, -0.045, 0.045)],
  ['Torso', 'Abdomen', at(0, -0.01, 0.045)],
  ['Neck', 'Torso', at(0, 0.05, 0.035)],
  ['Head', 'Neck', at(0, 0.085, 0.035)],
  ['Shoulder.L', 'Torso', at(0.03, 0.02, 0.0)],
  ['UpperArm.L', 'Shoulder.L', at(0.13, 0.005, 0.0)],
  ['LowerArm.L', 'UpperArm.L', at(0.175, -0.07, -0.003)],
  ['Fist.L', 'LowerArm.L', at(0.21, -0.125, 0.015)],
  ['UpperLeg.L', 'Body', at(0.06, -0.11, 0.03)],
  ['LowerLeg.L', 'UpperLeg.L', at(0.068, -0.24, 0.02)],
  ['Foot.L', 'LowerLeg.L', at(0.095, -0.40, 0.02)],
];
/** Where each bone points (a joint's name or a point), for the retarget frames and the weight capsules. */
const TIPS = {
  Body: at(0, -0.13, 0.04), Hips: 'Abdomen', Abdomen: 'Torso', Torso: 'Neck', Neck: 'Head', Head: at(0, 0.40, 0.035),
  'Shoulder.L': 'UpperArm.L', 'UpperArm.L': 'LowerArm.L', 'LowerArm.L': 'Fist.L', 'Fist.L': at(0.275, -0.255, 0.045),
  'UpperLeg.L': 'LowerLeg.L', 'LowerLeg.L': 'Foot.L', 'Foot.L': at(0.11, -0.46, 0.17),
};
/** Capsule radius per deforming bone, mesh units (Root never deforms). */
const RADIUS = {
  Body: 0.09, Hips: 0.10, Abdomen: 0.10, Torso: 0.11, Neck: 0.06, Head: 0.2,
  'Shoulder.L': 0.05, 'UpperArm.L': 0.045, 'LowerArm.L': 0.04, 'Fist.L': 0.075,
  'UpperLeg.L': 0.06, 'LowerLeg.L': 0.055, 'Foot.L': 0.08,
};
/** Where the arms hang in the A-pose: beside the waist, then beside the thighs. */
const ARM_ZONE = (ax, y) => (y < 0 && y > -0.12 && ax > 0.12) || (y <= -0.12 && y > -0.3 && ax > 0.14);
/** 0 at a, 1 at b, linear between (a may be greater than b). */
const ramp = (v, a, b) => Math.max(0, Math.min(1, (v - a) / (b - a)));
/**
 * How far each bone may weight a vertex, 0..1, from the vertex's height y and its distance ax out to the bone's own
 * side (mesh units). The hands hang beside the legs and the shoulders sit under the chin, so each part keeps to its own
 * bones; round the shoulder the factors are ramps on the navy shirt, so the teal sleeve moves wholly with the arm.
 */
const REGION = {
  Head: (ax, y) => y > 0.045,
  Neck: (ax, y) => y > 0.0 && y < 0.14,
  Torso: (ax, y) => (y > -0.07 && y < 0.11 ? (y > 0.05 ? 1 : ramp(ax, 0.118, 0.085)) : 0),
  Abdomen: (ax, y) => y > -0.12 && y < 0.03 && !ARM_ZONE(ax, y),
  Hips: (ax, y) => y > -0.16 && y < -0.02 && !ARM_ZONE(ax, y),
  Body: (ax, y) => y > -0.2 && y < -0.04 && !ARM_ZONE(ax, y),
  'Shoulder.L': (ax, y) => (ax > 0.03 && y > -0.07 && y < 0.05 ? ramp(ax, 0.14, 0.10) : 0),
  'UpperArm.L': (ax, y) => (y > -0.14 && y < 0.06 ? (ARM_ZONE(ax, y) ? 1 : y > -0.04 ? ramp(ax, 0.06, 0.11) : 0) : 0),
  'LowerArm.L': (ax, y) => ARM_ZONE(ax, y) && y < -0.02,
  'Fist.L': (ax, y) => ARM_ZONE(ax, y) && y < -0.08,
  'UpperLeg.L': (ax, y) => y < -0.09 && !ARM_ZONE(ax, y),
  'LowerLeg.L': (ax, y) => y < -0.16 && y > -0.45 && !ARM_ZONE(ax, y),
  'Foot.L': (ax, y) => y < -0.33,
};

// ---------------------------------------------------------------- retarget settings
/**
 * The Ninja bone each cop bone copies, and the Ninja joint its direction points to. With no tip, the bone copies the
 * Ninja's motion relative to his rest (the spine: his rest is a hunch the cop does not share); with a tip it copies the
 * bone's world direction (the limbs). Fist has no source and follows the forearm.
 */
const SOURCE = {
  Body: ['Body', null], Hips: ['Hips', null], Abdomen: ['Abdomen', null], Torso: ['Torso', null],
  Neck: ['Neck', null], Head: ['Head', null], 'Shoulder.L': ['Shoulder.L', 'UpperArm.L'],
  'UpperArm.L': ['UpperArm.L', 'LowerArm.L'], 'LowerArm.L': ['LowerArm.L', 'Middle1.L'],
  'UpperLeg.L': ['UpperLeg.L', 'LowerLeg.L'], 'LowerLeg.L': ['LowerLeg.L', 'LowerLeg.L_end'], 'Foot.L': ['Foot.L', 'Foot.L_end'],
};
/** The second axis that fixes a limb's twist in the frame correction: forward for the arms, sideways for the rest. */
const SECOND = name => (/Shoulder|Arm/.test(name) ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0));
/** Upper-arm swing kept per clip; the rest is taken out towards the hanging A-pose (the elbow keeps its bend). */
const ARM_SWING = { Run: 0.4, Walk: 0.6, Jump: 0.45, Jump_Idle: 0.4, Jump_Land: 0.45, Duck: 0.3, Punch: 0.7, Weapon: 0.7 };
/** Head and neck turn kept per clip, taken out towards upright: a big head bowed deep goes into the chest. */
const HEAD_KEEP = { Duck: 0.3, Jump_Idle: 0.6 };
/** Elbow bend kept per clip, the rest straightened: the Ninja's crouch folds his forearms up to his face. */
const ELBOW_KEEP = { Duck: 0.35 };
/** Clip sampling rate, frames per second. */
const FPS = 30;

// ---------------------------------------------------------------- 1. decimate
await MeshoptDecoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
if (!fs.existsSync(SOURCE_MESH)) throw new Error(`Missing ${SOURCE_MESH}: put the Tripo export there.`);
const copDoc = await io.read(SOURCE_MESH);
for (const ext of copDoc.getRoot().listExtensionsUsed()) {
  if (ext.extensionName === 'EXT_meshopt_compression' || ext.extensionName === 'KHR_mesh_quantization') ext.dispose();
}
const prim = copDoc.getRoot().listMeshes()[0].listPrimitives()[0];
const triangles = () => prim.getIndices().getCount() / 3;
const before = triangles();
prim.setAttribute('NORMAL', null);
await copDoc.transform(weld());
await copDoc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: TRIANGLES / triangles(), error: 0.02, lockBorder: false }));
const srcMat = copDoc.getRoot().listMaterials()[0];
srcMat.setNormalTexture(null).setMetallicRoughnessTexture(null);
await copDoc.transform(prune(), textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [TEXTURE_SIZE, TEXTURE_SIZE] }));
console.log(`mesh: ${before} -> ${triangles()} triangles`);

// ---------------------------------------------------------------- 2. skeleton and skin weights
const mirror = name => name.replace(/\.L(_end)?$/, '.R$1');
const side = name => (name.endsWith('.R') ? name.replace(/\.R$/, '.L') : name);
const bones = [];
for (const [name, parent, p] of JOINTS) {
  bones.push({ name, parent, pos: new THREE.Vector3(...p) });
  if (name.endsWith('.L')) {
    bones.push({ name: mirror(name), parent: parent.endsWith('.L') ? mirror(parent) : parent, pos: new THREE.Vector3(-p[0], p[1], p[2]) });
  }
}
const byName = new Map(bones.map(b => [b.name, b]));
for (const b of bones) {
  const tip = TIPS[side(b.name)];
  if (tip === undefined) continue;
  const mirrored = b.name.endsWith('.R');
  if (typeof tip === 'string') b.tip = byName.get(mirrored ? mirror(tip) : tip).pos.clone();
  else b.tip = new THREE.Vector3(mirrored ? -tip[0] : tip[0], tip[1], tip[2]);
  b.radius = RADIUS[side(b.name)] * SCALE;
}

const posAcc = prim.getAttribute('POSITION');
const count = posAcc.getCount();
const positions = new Float32Array(count * 3);
const element = [];
for (let i = 0; i < count; i++) positions.set(toRig(...posAcc.getElement(i, element)), i * 3);
const index = prim.getIndices().getArray();

const pt = new THREE.Vector3(), ab = new THREE.Vector3(), ap = new THREE.Vector3();
/** Distance from p to the segment a-b. */
const segDist = (p, a, b) => {
  ab.subVectors(b, a);
  ap.subVectors(p, a);
  const t = Math.max(0, Math.min(1, ap.dot(ab) / ab.lengthSq()));
  return ap.sub(ab.multiplyScalar(t)).length();
};
const deform = bones.filter(b => b.tip);
const nB = deform.length;
/** How far bone b may weight vertex i, 0..1: its own side only, then its region. */
const regionFactor = (b, i) => {
  const x = positions[i * 3] / SCALE, y = positions[i * 3 + 1] / SCALE + GROUND;
  if (b.name.endsWith('.L') && x < -0.005) return 0;
  if (b.name.endsWith('.R') && x > 0.005) return 0;
  const ax = b.name.endsWith('.R') ? -x : b.name.endsWith('.L') ? x : Math.abs(x);
  return Number(REGION[side(b.name)](ax, y));
};

// Vertices welded by position (UV seams split them), for surface adjacency and shared normals.
const weldId = new Int32Array(count);
const ids = new Map();
for (let i = 0; i < count; i++) {
  const k = `${Math.round(positions[i * 3] * 2000)},${Math.round(positions[i * 3 + 1] * 2000)},${Math.round(positions[i * 3 + 2] * 2000)}`;
  if (!ids.has(k)) ids.set(k, ids.size);
  weldId[i] = ids.get(k);
}
const nW = ids.size;
const neighbours = Array.from({ length: nW }, () => new Set());
for (let t = 0; t < index.length; t += 3) {
  const a = weldId[index[t]], b = weldId[index[t + 1]], c = weldId[index[t + 2]];
  neighbours[a].add(b).add(c); neighbours[b].add(a).add(c); neighbours[c].add(a).add(b);
}

// Capsule weights: sharp inverse distance in radii, times the region factor.
let W = new Float32Array(nW * nB);
const allowed = new Float32Array(nW * nB);
for (let i = 0; i < count; i++) {
  const v = weldId[i];
  pt.fromArray(positions, i * 3);
  let sum = 0;
  const row = new Float32Array(nB);
  deform.forEach((b, j) => {
    const factor = regionFactor(b, i);
    if (factor <= 0) return;
    allowed[v * nB + j] = factor;
    row[j] = factor / Math.pow(segDist(pt, b.pos, b.tip) / b.radius + 0.15, 8);
    sum += row[j];
  });
  if (sum === 0) throw new Error(`vertex ${i} is in no bone's region`);
  for (let j = 0; j < nB; j++) W[v * nB + j] = row[j] / sum;
}
// Six passes of surface smoothing, keeping each bone inside its region, so joints bend softly.
for (let pass = 0; pass < 6; pass++) {
  const next = new Float32Array(W.length);
  for (let v = 0; v < nW; v++) {
    let total = 0;
    for (let j = 0; j < nB; j++) {
      if (allowed[v * nB + j] <= 0) continue;
      let s = 0;
      for (const u of neighbours[v]) s += W[u * nB + j];
      next[v * nB + j] = neighbours[v].size ? 0.5 * W[v * nB + j] + 0.5 * s / neighbours[v].size : W[v * nB + j];
      total += next[v * nB + j];
    }
    for (let j = 0; j < nB; j++) next[v * nB + j] = total > 0 ? next[v * nB + j] / total : W[v * nB + j];
  }
  W = next;
}
// The four largest per vertex, normalised.
const jointIndex = new Map(bones.map((b, i) => [b.name, i]));
const joints = new Uint8Array(count * 4);
const weights = new Float32Array(count * 4);
const dominant = new Uint8Array(count);
for (let i = 0; i < count; i++) {
  const row = deform.map((b, j) => [W[weldId[i] * nB + j], j]).sort((a, b) => b[0] - a[0]).slice(0, 4).filter(r => r[0] > 0.01);
  const sum = row.reduce((acc, r) => acc + r[0], 0);
  row.forEach((r, k) => {
    joints[i * 4 + k] = jointIndex.get(deform[r[1]].name);
    weights[i * 4 + k] = r[0] / sum;
  });
  dominant[i] = joints[i * 4];
}

// ---------------------------------------------------------------- 3. retarget the Ninja's clips
const ninjaDoc = await io.read(SOURCE_RIG);
const nRoot = ninjaDoc.getRoot();
const ninja = new Map();
const ninjaTop = new THREE.Object3D();
const addNinjaNode = (node, parent) => {
  const o = new THREE.Object3D();
  o.name = node.getName();
  o.position.fromArray(node.getTranslation());
  o.quaternion.fromArray(node.getRotation());
  o.scale.fromArray(node.getScale());
  o.userData.rest = { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() };
  parent.add(o);
  // Bones come first in the file; a mesh node of the same name must not hide one.
  if (!ninja.has(o.name)) ninja.set(o.name, o);
  for (const child of node.listChildren()) addNinjaNode(child, o);
};
for (const node of nRoot.listScenes()[0].listChildren()) addNinjaNode(node, ninjaTop);
const resetNinja = () => {
  for (const o of ninja.values()) {
    o.position.copy(o.userData.rest.p);
    o.quaternion.copy(o.userData.rest.q);
    o.scale.copy(o.userData.rest.s);
  }
  ninjaTop.updateMatrixWorld(true);
};
resetNinja();
const worldQ = name => ninja.get(name).getWorldQuaternion(new THREE.Quaternion());
const worldP = name => ninja.get(name).getWorldPosition(new THREE.Vector3());

/** An orthonormal frame with `dir` as its y axis and `second` (made perpendicular) as its x axis. */
const frame = (dir, second) => {
  const d = dir.clone().normalize();
  const s = second.clone().sub(d.clone().multiplyScalar(second.dot(d))).normalize();
  return new THREE.Matrix4().makeBasis(s, d, new THREE.Vector3().crossVectors(d, s));
};
// Per cop bone: the Ninja bone, the inverse of its rest world rotation, and the inverse of the rotation taking the
// Ninja's rest frame onto the cop's (identity for the spine). At time t the cop bone's world rotation is
// N(t) · N(rest)⁻¹ · C⁻¹, which turns the cop's rest direction onto the Ninja's direction at t.
const retarget = new Map();
for (const b of bones) {
  const src = SOURCE[side(b.name)];
  if (!src) continue;
  const mirrored = b.name.endsWith('.R');
  const srcName = mirrored ? mirror(src[0]) : src[0];
  const tipName = src[1] && (mirrored ? mirror(src[1]) : src[1]);
  let correction = new THREE.Quaternion();
  if (tipName) {
    const ninjaFrame = frame(worldP(tipName).sub(worldP(srcName)), SECOND(b.name));
    const copFrame = frame(b.tip.clone().sub(b.pos), SECOND(b.name));
    correction = new THREE.Quaternion().setFromRotationMatrix(copFrame.multiply(ninjaFrame.transpose()));
  }
  retarget.set(b.name, { srcName, restInverse: worldQ(srcName).invert(), correctionInverse: correction.invert() });
}
// The hips move by the Ninja's hip motion scaled by leg length, measured from the ankle.
const ninjaLeg = worldP('UpperLeg.L').distanceTo(worldP('LowerLeg.L')) + worldP('LowerLeg.L').distanceTo(worldP('LowerLeg.L_end'));
const copLeg = byName.get('UpperLeg.L').pos.distanceTo(byName.get('LowerLeg.L').pos) + byName.get('LowerLeg.L').pos.distanceTo(byName.get('Foot.L').pos);
const legRatio = copLeg / ninjaLeg;
const ninjaBodyRest = worldP('Body');
const ninjaAnkleY = worldP('LowerLeg.L_end').y;
const copAnkleY = byName.get('Foot.L').pos.y;
const copBody = byName.get('Body').pos.clone().sub(byName.get('Root').pos);

const clips = [];
for (const anim of nRoot.listAnimations()) {
  const short = anim.getName().split('|').pop();
  const swing = ARM_SWING[short] ?? 1;
  const headKeep = HEAD_KEEP[short] ?? 1;
  const elbowKeep = ELBOW_KEEP[short] ?? 1;
  const tracks = [];
  let duration = 0;
  for (const channel of anim.listChannels()) {
    const target = channel.getTargetPath();
    if (target !== 'rotation' && target !== 'translation') continue;
    const sampler = channel.getSampler();
    const input = Array.from(sampler.getInput().getArray());
    duration = Math.max(duration, input[input.length - 1]);
    const Track = target === 'rotation' ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
    tracks.push({ object: ninja.get(channel.getTargetNode().getName()), target,
      interpolant: new Track('t', input, Array.from(sampler.getOutput().getArray())).createInterpolant() });
  }
  const frames = Math.max(2, Math.round(duration * FPS) + 1);
  const times = Array.from({ length: frames }, (_, f) => (f / (frames - 1)) * duration);
  const rotations = new Map(bones.map(b => [b.name, []]));
  const bodyTranslation = [];
  for (const t of times) {
    resetNinja();
    for (const track of tracks) {
      const value = track.interpolant.evaluate(t);
      if (track.target === 'rotation') track.object.quaternion.fromArray(value).normalize();
      else track.object.position.fromArray(value);
    }
    ninjaTop.updateMatrixWorld(true);
    // `raw` is each bone's retargeted world rotation; `final` the world rotation after damping. Locals normally come
    // from the raw parent, so a damped upper arm keeps the elbow's bend; the damped head and neck use the final one.
    const raw = new Map();
    const final = new Map();
    for (const b of bones) {
      const r = retarget.get(b.name);
      const q = r ? worldQ(r.srcName).multiply(r.restInverse).multiply(r.correctionInverse)
        : b.parent ? raw.get(b.parent).clone() : new THREE.Quaternion();
      raw.set(b.name, q);
      let local;
      if (headKeep < 1 && (b.name === 'Neck' || b.name === 'Head')) {
        local = final.get(b.parent).clone().invert().multiply(new THREE.Quaternion().slerp(q, headKeep));
      } else {
        const parent = b.parent ? raw.get(b.parent) : new THREE.Quaternion();
        const target = swing < 1 && b.name.startsWith('UpperArm') ? new THREE.Quaternion().slerp(q, swing) : q;
        local = parent.clone().invert().multiply(target);
        if (elbowKeep < 1 && b.name.startsWith('LowerArm')) local = new THREE.Quaternion().slerp(local, elbowKeep);
      }
      final.set(b.name, b.parent ? final.get(b.parent).clone().multiply(local) : local.clone());
      rotations.get(b.name).push(...local.toArray());
    }
    const body = worldP('Body');
    bodyTranslation.push(
      copBody.x + (body.x - ninjaBodyRest.x) * legRatio,
      copAnkleY + (body.y - ninjaAnkleY) * legRatio - byName.get('Root').pos.y,
      copBody.z + (body.z - ninjaBodyRest.z) * legRatio,
    );
  }
  clips.push({ name: anim.getName(), times, rotations, bodyTranslation });
}

/** World positions of every joint at a clip's frame (forward kinematics of the cop). */
const pose = (clip, f) => {
  const q = new Map(), p = new Map();
  for (const b of bones) {
    const local = new THREE.Quaternion().fromArray(clip.rotations.get(b.name), f * 4);
    if (!b.parent) { q.set(b.name, local); p.set(b.name, b.pos.clone()); continue; }
    const offset = b.name === 'Body' ? new THREE.Vector3().fromArray(clip.bodyTranslation, f * 3) : b.pos.clone().sub(byName.get(b.parent).pos);
    p.set(b.name, offset.applyQuaternion(q.get(b.parent)).add(p.get(b.parent)));
    q.set(b.name, q.get(b.parent).clone().multiply(local));
  }
  return p;
};
// Stand the Idle clip's feet on the ground, and move every clip by the same amount.
const idle = clips.find(c => c.name.endsWith('|Idle'));
const sink = pose(idle, 0).get('Foot.L').y - copAnkleY;
for (const clip of clips) for (let i = 1; i < clip.bodyTranslation.length; i += 3) clip.bodyTranslation[i] -= sink;
for (const clip of clips) {
  let lowest = Infinity;
  for (let f = 0; f < clip.times.length; f++) {
    const p = pose(clip, f);
    lowest = Math.min(lowest, p.get('Foot.L').y, p.get('Foot.R').y);
  }
  console.log(`${clip.name.padEnd(28)} ${String(clip.times.length).padStart(3)} frames, lowest ankle ${lowest.toFixed(3)} m (standing ${copAnkleY.toFixed(3)})`);
}

// ---------------------------------------------------------------- 4. write the GLB
/** Area-weighted vertex normals, shared across UV seams. */
const smoothNormals = () => {
  const sum = new Float32Array(nW * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let t = 0; t < index.length; t += 3) {
    a.fromArray(positions, index[t] * 3);
    b.fromArray(positions, index[t + 1] * 3);
    c.fromArray(positions, index[t + 2] * 3);
    n.crossVectors(b.sub(a), c.sub(a));
    for (let k = 0; k < 3; k++) {
      const w = weldId[index[t + k]] * 3;
      sum[w] += n.x; sum[w + 1] += n.y; sum[w + 2] += n.z;
    }
  }
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) out.set(n.fromArray(sum, weldId[i] * 3).normalize().toArray(), i * 3);
  return out;
};

const doc = new Document();
const buffer = doc.createBuffer();
const accessor = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
const armature = doc.createNode('CharacterArmature');
doc.createScene('Scene').addChild(armature);
const nodes = new Map();
for (const b of bones) {
  const parent = b.parent ? byName.get(b.parent).pos : new THREE.Vector3();
  nodes.set(b.name, doc.createNode(b.name).setTranslation(b.pos.clone().sub(parent).toArray()));
  (b.parent ? nodes.get(b.parent) : armature).addChild(nodes.get(b.name));
}
// Every bone's rest rotation is the identity, so its inverse bind matrix is a translation.
const inverseBind = new Float32Array(bones.length * 16);
bones.forEach((b, i) => inverseBind.set(new THREE.Matrix4().makeTranslation(-b.pos.x, -b.pos.y, -b.pos.z).elements, i * 16));
const skin = doc.createSkin('Cop').setSkeleton(nodes.get('Root')).setInverseBindMatrices(accessor('MAT4', inverseBind));
for (const b of bones) skin.addJoint(nodes.get(b.name));

const srcTexture = srcMat.getBaseColorTexture();
const texture = doc.createTexture('CopColour').setImage(srcTexture.getImage()).setMimeType(srcTexture.getMimeType());
const material = doc.createMaterial('Cop').setBaseColorTexture(texture).setMetallicFactor(0).setRoughnessFactor(1);
const uvAcc = prim.getAttribute('TEXCOORD_0');
const uv = new Float32Array(count * 2);
const pair = [0, 0];
for (let i = 0; i < count; i++) uv.set(uvAcc.getElement(i, pair), i * 2);
const primitive = doc.createPrimitive()
  .setAttribute('POSITION', accessor('VEC3', positions))
  .setAttribute('NORMAL', accessor('VEC3', smoothNormals()))
  .setAttribute('TEXCOORD_0', accessor('VEC2', uv))
  .setAttribute('JOINTS_0', accessor('VEC4', joints))
  .setAttribute('WEIGHTS_0', accessor('VEC4', weights))
  .setIndices(accessor('SCALAR', count < 65536 ? new Uint16Array(index) : new Uint32Array(index)))
  .setMaterial(material);
armature.addChild(doc.createNode('Cop').setMesh(doc.createMesh('Cop').addPrimitive(primitive)).setSkin(skin));

for (const clip of clips) {
  const animation = doc.createAnimation(clip.name);
  const input = accessor('SCALAR', new Float32Array(clip.times));
  const channel = (bone, target, type, values) => {
    const sampler = doc.createAnimationSampler().setInput(input).setInterpolation('LINEAR').setOutput(accessor(type, new Float32Array(values)));
    animation.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(nodes.get(bone)).setTargetPath(target).setSampler(sampler));
  };
  for (const b of bones) if (b.parent) channel(b.name, 'rotation', 'VEC4', clip.rotations.get(b.name));
  channel('Body', 'translation', 'VEC3', clip.bodyTranslation);
}
await doc.transform(prune());
await new NodeIO().write(OUTPUT, doc);
console.log(`written ${path.relative(root, OUTPUT)}: ${bones.length} bones, ${clips.length} clips, ${fs.statSync(OUTPUT).size} bytes`);

if (debug) {
  const colours = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) colours.set([...new THREE.Color().setHSL((dominant[i] * 0.618) % 1, 0.75, 0.55).toArray(), 1], i * 4);
  primitive.setAttribute('COLOR_0', accessor('VEC4', colours));
  material.setBaseColorTexture(null);
  fs.mkdirSync(path.dirname(DEBUG_OUTPUT), { recursive: true });
  await new NodeIO().write(DEBUG_OUTPUT, doc);
  console.log(`written ${path.relative(root, DEBUG_OUTPUT)} (vertex colour = main bone)`);
}
