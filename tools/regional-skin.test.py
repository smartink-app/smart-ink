"""Run without Blender: mask bounds, continuity, side symmetry and joint direction."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'smartink-live'))
from regionalSkin import region_weights
for x in [0,.15,.2,.25,.35,.5]:
 for i in range(1001):
  h=i/1000;p=(x,(h-.5)*1.75,.05);w=region_weights(p,(0,0,1))
  assert all(0<=v<=1 for v in w)
  assert abs(sum(w[:4])-1)<1e-9
  assert w==region_weights((-x,p[1],p[2]),(0,0,1))
  next_w=region_weights((x,p[1]+1e-5,p[2]),(0,0,1))
  assert max(abs(a-b) for a,b in zip(w,next_w))<.001
p=(.3,(.645-.5)*1.75,0)
assert region_weights(p,(0,0,-1))[4]>.9
assert region_weights(p,(0,0,1))[4]==0
p=(.08,(.285-.5)*1.75,0)
assert region_weights(p,(0,0,1))[4]>.9
assert region_weights(p,(0,0,-1))[4]==0
print('Regional masks: bounded, normalized, continuous, symmetric; joint directions passed')
