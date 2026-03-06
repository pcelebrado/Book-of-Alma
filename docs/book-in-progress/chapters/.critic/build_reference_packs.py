import argparse
import datetime
import json
import os
from pathlib import Path


def load_json(path: Path):
  with path.open('r', encoding='utf-8') as f:
    return json.load(f)


def utc_today() -> str:
  return datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d')


def sem_match_files(sem_docs, keywords, limit):
  kws = [k.lower() for k in keywords]
  hits = []
  for d in sem_docs:
    toks = d.get('tokens') or []
    blob = ' '.join(toks).lower()
    score = 0
    for k in kws:
      if k in blob:
        score += 1
    if score:
      hits.append((score, d.get('file') or '', d.get('title') or ''))
  hits.sort(key=lambda x: (-x[0], x[1]))
  seen = set()
  out = []
  for score, f, t in hits:
    if not f or f in seen:
      continue
    seen.add(f)
    out.append((score, f, t))
    if len(out) >= limit:
      break
  return out


def write_lines(path: Path, lines):
  path.parent.mkdir(parents=True, exist_ok=True)
  with path.open('w', encoding='utf-8', newline='\n') as f:
    for i, ln in enumerate(lines):
      if i:
        f.write('\n')
      f.write(ln)


def main():
  ap = argparse.ArgumentParser(
    description='Build per-chapter Bible reference packs from Bible indices.',
  )
  ap.add_argument(
    '--bible-root',
    default='OP3NF1XER/nate-alma/dev/memory/alma-teachings/bible',
    help='Path to the Bible root directory',
  )
  ap.add_argument(
    '--out-dir',
    default='OP3NF1XER/nate-alma/book-in-progress/chapters/.critic/references',
    help='Output directory for reference packs',
  )
  ap.add_argument(
    '--limit-unmapped',
    type=int,
    default=300,
    help='Keyword-sourced cap for sections with docCount=0',
  )
  ap.add_argument(
    '--limit-mapped-extras',
    type=int,
    default=120,
    help='Keyword-sourced cap for mapped sections (extra pool)',
  )
  ap.add_argument(
    '--no-keyword-pool',
    action='store_true',
    help='Do not add keyword-sourced reference pools',
  )
  args = ap.parse_args()

  bible_root = Path(args.bible_root)
  out_dir = Path(args.out_dir)

  digest = load_json(bible_root / 'digest.json')
  section_map = load_json(bible_root / 'indices' / 'section-doc-map.json')
  book_sections = load_json(bible_root / 'mappings' / 'book-sections.json')[
    'sections'
  ]
  sem = load_json(bible_root / 'indices' / 'substack-semantic-index.json')

  sha_to_doc = digest['documents']
  section_title = {s['sectionId']: s['title'] for s in book_sections}
  sem_docs = sem['documents']

  ch_to_section = {
    'CH01': 'part-i-ch-1-why-fundamentals-mislead',
    'CH02': 'part-i-ch-2-the-volatility-framework',
    'CH03': 'part-i-ch-3-liquidity-is-everything',
    'CH04': 'part-ii-ch-4-gamma-the-markets-gravity',
    'CH05': 'part-ii-ch-5-vanna-and-speed-profiles',
    'CH06': 'part-ii-ch-6-charm-color-and-dealer-hedging',
    'CH07': 'part-ii-ch-7-the-intraday-playbook',
    'CH08': 'part-iii-ch-8-geopolitics-and-volatility-regimes',
    'CH09': 'part-iii-ch-9-financing-the-bubble',
    'CH10': 'part-iii-ch-10-the-hidden-left-tail',
    'CH14': 'part-v-ch-14-probability-over-prediction',
    'CH15': 'part-v-ch-15-do-not-marry-a-side',
    # CH16 intentionally omitted: no section mapping in book-sections.json
  }

  chapter_ids = [
    'CH01',
    'CH02',
    'CH03',
    'CH04',
    'CH05',
    'CH06',
    'CH07',
    'CH08',
    'CH09',
    'CH10',
    'CH14',
    'CH15',
    'CH16',
  ]

  # Tight keyword pools to keep results relevant.
  keyword_pools = {
    'CH01': [
      'reflexiv',
      'fundamental',
      'emh',
      'efficient',
      'sentiment',
      'narrative',
      'position',
      'liquidity',
      'bubble',
    ],
    'CH02': [
      'volatility',
      'vix',
      'skew',
      'term',
      'structure',
      'distribution',
      'kurtosis',
      'vol-of-vol',
      'implied',
      'realized',
    ],
    'CH03': [
      'liquidity',
      'bond',
      'yield',
      'swap',
      'spread',
      'repo',
      'funding',
      'term',
      'premium',
      'credit',
    ],
    'CH14': ['probabil', 'stochastic', 'determin', 'expectancy', 'distribution', 'risk'],
    'CH15': ['sentiment', 'bias', 'position', 'regime', 'probabil', 'risk'],
    'CH16': [
      'risk',
      'drawdown',
      'discipline',
      'process',
      'probabil',
      'expectancy',
      'principle',
      'psycholog',
    ],
  }

  gen_date = utc_today()

  readme_lines = [
    '# Reference Packs',
    '',
    f'Generated: {gen_date} (UTC)',
    '',
    'These files are built from the Bible indexes under:',
    f'`{(bible_root / "indices").as_posix()}`',
    '',
    'Primary sources used:',
    '- `bible/indices/section-doc-map.json` (sectionId -> list of digest sha IDs)',
    '- `bible/digest.json` (sha -> file/title/date/postType/sectionId)',
    '- `bible/indices/substack-semantic-index.json` (keyword search fallback for unmapped sections)',
    '',
    'Citation format to use in chapters: `bible/corpus/substack/<file>.md`',
  ]
  write_lines(out_dir.parent / 'REFERENCE_README.md', readme_lines)

  index_lines = ['# Reference Index', '', f'Generated: {gen_date} (UTC)', '']
  for ch in chapter_ids:
    sec = ch_to_section.get(ch)
    title = section_title.get(sec) if sec else ''
    if not title:
      title = 'The Trader Mind (no section mapping)' if ch == 'CH16' else ch
    index_lines.append(f'- {ch}: `{ch}.md` - {title}')
  write_lines(out_dir / 'INDEX.md', index_lines)

  for ch in chapter_ids:
    sec = ch_to_section.get(ch)
    title = section_title.get(sec) if sec else ''
    if not title:
      title = 'The Trader Mind' if ch == 'CH16' else ch

    lines = [f'# {ch} References: {title}', '', f'Generated: {gen_date} (UTC)']

    doc_ids = []
    if sec:
      sec_info = section_map.get('sections', {}).get(sec) or {}
      doc_ids = sec_info.get('documents') or []
      lines += ['', f'SectionId: `{sec}`', f'Mapped docs in `section-doc-map.json`: {len(doc_ids)}']
      lines += ['', '## Section-Mapped Bible Corpus', '']
      if doc_ids:
        docs = []
        for sha in doc_ids:
          d = sha_to_doc.get(sha)
          if d and d.get('file'):
            docs.append(d)
        docs.sort(key=lambda d: ((d.get('date') or '0000-00-00'), (d.get('title') or '')))
        for d in docs:
          f = d.get('file')
          date = d.get('date') or ''
          pt = d.get('postType') or ''
          t = d.get('title') or ''
          lines.append(f'- bible/corpus/substack/{f} ({date}, {pt}) - {t}')
      else:
        lines.append('- (No mapped documents yet for this section)')
    else:
      lines += ['', 'SectionId: (none in `book-sections.json`)']

    if not args.no_keyword_pool:
      kws = keyword_pools.get(ch)
      if kws:
        limit = args.limit_unmapped if not doc_ids else args.limit_mapped_extras
        extra = sem_match_files(sem_docs, kws, limit)
        lines += ['', '## Keyword-Sourced Reference Pool (from `substack-semantic-index.json`)', '']
        lines.append('Keywords: ' + ', '.join(kws))
        lines.append(f'Results: {len(extra)}')
        lines.append('')
        for score, f, t in extra:
          lines.append(f'- bible/corpus/substack/{f} (score {score}) - {t}')

    write_lines(out_dir / f'{ch}.md', lines)

  print(f'Wrote reference packs to: {out_dir.as_posix()}')


if __name__ == '__main__':
  main()
