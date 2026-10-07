import sys
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
root=Path(sys.argv[1]).resolve(); errors=[]
class Links(HTMLParser):
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  for k in ['href','src']:
   u=a.get(k,''); p=urlsplit(u)
   if not u or p.scheme or p.netloc or not p.path or p.path.startswith('/'):continue
   target=(self.file.parent/unquote(p.path)).resolve()
   if not target.is_relative_to(root):errors.append(str(self.file)+': escaping '+u)
   elif not target.exists():errors.append(str(self.file)+': missing '+u)
for p in root.rglob('*.html'):
 parser=Links();parser.file=p;parser.feed(p.read_text(encoding='utf-8'))
if errors:raise SystemExit('\n'.join(errors))
print('Public HTML links and assets checked.')
