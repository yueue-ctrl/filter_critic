import json
import os
from pathlib import Path
from huggingface_hub import HfApi, snapshot_download
root = Path(__file__).resolve().parent.parent
os.environ['HF_HUB_DISABLE_XET'] = '1'
repo = 'Systran/faster-whisper-small'
revision = HfApi().model_info(repo).sha
snapshot_download(repo_id=repo, revision=revision, local_dir=str(root / '.local-ai/whisper-small'), allow_patterns=['*.json', '*.bin', '*.txt'])
(root / '.local-ai/whisper-model.json').write_text(json.dumps({'repo': repo, 'revision': revision}))
print('Offline speech model downloaded.')
