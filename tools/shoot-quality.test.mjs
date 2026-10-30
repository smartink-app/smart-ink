import assert from 'node:assert/strict';
import { build } from 'esbuild';
const result = await build({stdin:{contents:"export * from './src/render/shootQuality'; export * from './src/render/tattooCamera'; export * from './src/render/cinematicPresets'; export { PerspectiveCamera, Vector3 } from 'three';", resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const {guidedCamera,guidedLights,guidedBrightness,frameTattoo,CINEMATIC_PRESETS,PerspectiveCamera,Vector3} = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
for (const preset of CINEMATIC_PRESETS) {
  for (const angle of [-999,0,999,NaN]) for (const aspect of [.45,1,2.1]) {
    const adjustment = guidedCamera({azimuth:angle,elevation:angle,zoom:999},preset.id);
    assert.ok(Math.abs(adjustment.azimuth)<=30 && Math.abs(adjustment.elevation)<=20);
    const framing = {center:[0,0,0],normal:[0,0,1],up:[0,1,0],radius:.3,minDistance:.18,points:new Float32Array([-.2,-.3,0,.2,-.3,0,.2,.3,0,-.2,.3,0])};
    const view=frameTattoo(framing,adjustment,aspect,preset.fov);
    const camera=new PerspectiveCamera(view.fov,aspect,.001,100);
    camera.position.set(...view.position);camera.lookAt(...view.target);camera.updateMatrixWorld();
    const wide=frameTattoo(framing,{...adjustment,zoom:1},aspect,preset.fov);
    assert.ok(view.fov < wide.fov || new Vector3(...view.position).length() < new Vector3(...wide.position).length());
    camera.fov=wide.fov;camera.position.set(...wide.position);camera.lookAt(...wide.target);camera.updateProjectionMatrix();camera.updateMatrixWorld();
    for(let i=0;i<framing.points.length;i+=3){
      const point=new Vector3().fromArray(framing.points,i).project(camera);
      assert.ok(Math.abs(point.x)<=1/1.2+1e-6 && Math.abs(point.y)<=1/1.2+1e-6,'complete flat footprint retains margin');
    }
    const lights=guidedLights(preset.id,view,.1,1.1);
    assert.ok(lights.every(light=>Number.isFinite(light.intensity)&&light.intensity>0));
    assert.ok(lights[2].intensity/lights[1].intensity>=.28-1e-9);
    assert.ok(lights[3].intensity/lights[1].intensity<=.25+1e-9);
    for(const light of lights.slice(1)) assert.deepEqual(light.target,view.target);
  }
}
assert.equal(guidedBrightness(NaN),1);
assert.equal(guidedBrightness(0),.9);
assert.equal(guidedBrightness(999),1.2);
console.log('Guided shot checks passed: camera bounds, projected margins, invalid input, fill and rim balance.');
