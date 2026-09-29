"""Build compact browser assets from the SCB handoff directory (stdlib only).
Usage: python scripts/prepare_data.py /path/to/extracted/package
Published counts and metrics are preserved; node indices only compress identifiers.
"""
import gzip
import hashlib
import json
import sys
from pathlib import Path

source = Path(sys.argv[1]).resolve()
target = Path(__file__).resolve().parents[1] / 'data'
target.mkdir(exist_ok=True)

def read(name):
    return json.loads((source / name).read_text(encoding='utf-8'))

def write(name, value):
    raw = json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode()
    (target / name).write_bytes(gzip.compress(raw, compresslevel=9, mtime=0) if name.endswith('.gz') else raw)

catalog = read('data/catalog.json')
nodes = read('data/nodes.json')
indices = {n['municipality_code']: i for i, n in enumerate(nodes)}
assert len(indices) == 290
geo = read('data/municipalities.geojson')
assert {f['properties']['municipality_code'] for f in geo['features']} == set(indices)
write('geography.json.gz', {'nodes': nodes, 'boundaries': geo})
history_fields = ['resident_workers_observed', 'workplace_workers_observed', 'out_workers', 'in_workers',
                  'residence_mean_external_distance_km', 'workplace_mean_external_distance_km']
history = {'columns': history_fields, 'partitions': {}}
for p in catalog['partitions']:
    links = read('data/' + p['links'])
    metrics = read('data/' + p['metrics'])
    by_code = {m['municipality_code']: m for m in metrics}
    assert len(by_code) == 290
    key = f"{p['source_table']}_{p['year']}_{p['sex']}"
    compact = [[indices[o], indices[d], w] for o, d, w, _ in links['data']]
    assert sum(e[2] for e in compact) == links['meta']['displayed_workers_sum']
    ordered = [by_code[n['municipality_code']] for n in nodes]
    write(key + '.json.gz', {'meta': links['meta'], 'links': compact, 'metrics': ordered})
    history['partitions'][key] = [[m.get(f) for f in history_fields] for m in ordered]
    p['bundle'] = key + '.json.gz'
    p.pop('links'); p.pop('metrics')
catalog['nodes'] = 'geography.json.gz'
catalog['boundaries'] = 'geography.json.gz'
catalog['history'] = 'history.json.gz'
catalog['bundle_link_columns'] = ['origin_node_index', 'destination_node_index', 'workers']
catalog['provenance'] = {
    'input_manifest_sha256': hashlib.sha256((source / 'MANIFEST.json').read_bytes()).hexdigest(),
    'boundaries': 'Eurostat GISCO LAU 2024, Sweden, 1:1 million, WGS84',
    'attribution': '© EuroGeographics for the administrative boundaries',
    'geometry_policy': 'Fixed 2024 boundaries for every year; no historical crosswalk',
}
write('catalog.json', catalog)
write('history.json.gz', history)
print(f"Prepared {len(catalog['partitions'])} partitions; {sum(p.stat().st_size for p in target.iterdir()) / 1e6:.2f} MB")
