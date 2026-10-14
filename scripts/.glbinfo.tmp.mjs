import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(process.argv[2]);
const r = doc.getRoot();
console.log('meshes', r.listMeshes().map(m => m.getName() + ':' + m.listPrimitives().reduce((a, p) => a + (p.getAttribute('POSITION')?.getCount() ?? 0), 0)).join(', '));
console.log('materials', r.listMaterials().map(m => m.getName()).join(', '));
console.log('textures', r.listTextures().length, 'skins', r.listSkins().length);
console.log('anims', r.listAnimations().length, r.listAnimations().map(a => a.getName()).join(', '));
