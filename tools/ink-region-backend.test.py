"""Validation for optional localized tattoo texture coordinates."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server.app import validate_contract
from fastapi import HTTPException
base = {'schemaVersion': 1, 'bodyMeshId': 'body_full', 'skinToneId': 'tone_03', 'poseId': 'neutral', 'lookId': 'studio_softbox', 'inkTextureUrl': 'ink.png', 'camera': {'position': [0,0,8], 'target': [0,0,0], 'fov':45, 'aspect':1}, 'output': {'qualityTier':'final', 'width':960, 'height':960}}
for region in ([0,0,1,1], [.1,.2,.3,.4]):
    assert validate_contract(json.dumps({**base, 'inkUvRegion':region}).encode())['inkUvRegion'] == region
for region in ([0,0,0,1], [0,0,1], [True,0,1,1], [.9,0,.2,1], [0,0,float('nan'),1], 'bad'):
    try: validate_contract(json.dumps({**base, 'inkUvRegion':region}).encode())
    except HTTPException: pass
    else: raise AssertionError(region)
assert 'inkUvRegion' not in validate_contract(json.dumps(base).encode())
print('Ink UV bounds: valid, legacy and invalid contracts passed')
