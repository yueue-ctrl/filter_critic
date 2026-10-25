"""Offline ASR worker. Audio and models stay on this computer."""
import json
import os
import sys
from faster_whisper import WhisperModel

model = WhisperModel(
    os.environ['LOCAL_WHISPER_MODEL'],
    device='cpu', compute_type='int8', cpu_threads=6,
    local_files_only=True,
)
segments, info = model.transcribe(
    sys.argv[1], beam_size=5, vad_filter=True,
    condition_on_previous_text=False,
)
parts = []
for segment in segments:
    if segment.no_speech_prob > 0.8 and segment.avg_logprob < -1:
        continue
    parts.append({'start': segment.start, 'end': segment.end, 'text': segment.text.strip()})
print(json.dumps({'text': ' '.join(p['text'] for p in parts), 'segments': parts, 'language': info.language}, ensure_ascii=False))
