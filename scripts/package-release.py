"""将 Next.js 静态产物打包；不包含源码、测试或依赖目录。"""
from pathlib import Path
from hashlib import sha256
import json
import zipfile
root = Path(__file__).resolve().parent.parent
output = root / 'out'
required = ['index.html', 'editor/index.html', '404.html']
for name in required:
    if not (output / name).is_file():
        raise SystemExit(f'缺少 {name}，请先 npm run build')
files = sorted(p for p in output.rglob('*') if p.is_file())
if not any('worker' in p.name for p in files):
    raise SystemExit('未找到 Worker 构建产物')
version = json.loads((root / 'package.json').read_text())['version']
destination = root / 'releases'
destination.mkdir(exist_ok=True)
archive = destination / f'dianxiu-{version}-static.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as package:
    for file in files:
        package.write(file, file.relative_to(output).as_posix())
manifest = {'version': version, 'archive': archive.name,
    'sha256': sha256(archive.read_bytes()).hexdigest(),
    'files': [{'path': p.relative_to(output).as_posix(), 'bytes': p.stat().st_size,
        'sha256': sha256(p.read_bytes()).hexdigest()} for p in files]}
(destination / f'dianxiu-{version}-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'archive': str(archive), 'sha256': manifest['sha256'], 'fileCount': len(files), 'bytes': archive.stat().st_size}, indent=2))
