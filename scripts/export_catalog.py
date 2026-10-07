"""Export only explicitly registered public material, using Python standard library."""
import json, sys, re, subprocess
from pathlib import Path
from html.parser import HTMLParser
class Text(HTMLParser):
    def __init__(self):
        super().__init__(); self.skip=0; self.parts=[]; self.article=0; self.article_parts=[]
    def handle_starttag(self,tag,attrs):
        if tag in ('script','style','nav','header','footer'): self.skip+=1
        if tag=='article': self.article+=1
    def handle_endtag(self,tag):
        if tag in ('script','style','nav','header','footer'): self.skip=max(0,self.skip-1)
        if tag=='article': self.article=max(0,self.article-1)
    def handle_data(self,s):
        if not self.skip and s.strip():
            self.parts.append(s.strip())
            if self.article: self.article_parts.append(s.strip())
def extract(p):
    s=p.read_text(encoding='utf-8')
    if p.suffix=='.html':
        t=Text();t.feed(s);return '\n'.join(t.article_parts or t.parts)
    return re.sub(r'!\[[^\]]*\]\([^)]*\)','',s)
def main():
    config=json.loads(Path('publish.json').read_text(encoding='utf-8'))
    records=[]
    for item in config['records']:
        r={k:v for k,v in item.items() if k!='textPaths'}
        paths=item.get('textPaths',[])
        parts=[]
        for name in paths:
            p=Path(name)
            if p.is_absolute() or '..' in p.parts: raise ValueError('Invalid text path')
            parts.extend(extract(p).splitlines())
        r['text']='\n'.join(dict.fromkeys(x.strip() for x in parts if x.strip()))
        date=subprocess.check_output(['git','log','-1','--format=%cs','--',*(paths or ['publish.json'])],text=True).strip()
        if date:r['updated']=date
        records.append(r)
    output=Path(sys.argv[1]);output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps({'version':1,'records':records},ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'Exported {len(records)} public records to {output}')
if __name__=='__main__':main()
