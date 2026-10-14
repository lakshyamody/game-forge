import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(process.argv[2]);
const r = doc.getRoot();
for (const m of r.listMeshes()) for (const p of m.listPrimitives()) { const a = p.getAttribute('POSITION'); console.log(m.getName(), p.getMaterial()?.getName(), 'min', a.getMin([]).map(v=>v.toFixed(2)), 'max', a.getMax([]).map(v=>v.toFixed(2)), 'attrs', p.listSemantics().join(',')); }
const sk = r.listSkins()[0]; console.log('joints', sk.listJoints().map(j => j.getName()).join(' '));
for (const n of r.listNodes()) if (n.getMesh()) console.log('meshnode', n.getName(), 'scale', n.getScale(), 'rot', n.getRotation());
for (const mat of r.listMaterials()) console.log('mat', mat.getName(), mat.getBaseColorFactor(), mat.getRoughnessFactor(), mat.getMetallicFactor());
