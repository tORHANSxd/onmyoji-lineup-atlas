import re, json, html
from collect import *

def run():
    s=(SNAP/'news-update-index.bin').read_text(encoding='utf-8')
    links=re.findall(r'href="(//yys\.163\.com/news/update/202609[^"]+)"',s)
    for j,link in enumerate(links[:2]):
        m,b=request('https:'+link,f'official-update-sept-{j}')
        text=html.unescape(re.sub('<[^>]+>',' ',b.decode('utf-8')))
        text=re.sub(r'\s+',' ',text)
        save(DATA/f'official-update-sept-{j}.json',{'evidence':m,'text':text})
        print(link,text[text.find('维护时间'):text.find('维护时间')+12000])
    x=read(DATA/'excel.json')['entries']
    bvids=[]
    for a in x:
        bvids+=re.findall(r'BV[A-Za-z0-9]{10}',a.get('sourceUrl','')+' '+a.get('notes',''))
    bvids+=['BV1UpYp6aEa7','BV1pEkkBbEbY','BV14jbW6DEVB','BV1W3bK6cE37','BV1Cs4y1c7S7','BV18k4y1p7D9','BV1Qh4y1G7ji','BV1364y1L7Uo','BV1U841167VH','BV1Ha44z8EhB','BV1oC48euEyJ','BV1tkGA6sEcc']
    output=[]
    for bv in dict.fromkeys(bvids):
        m,b=request('https://api.bilibili.com/x/web-interface/view?bvid='+bv,'video-'+bv)
        try: d=json.loads(b)
        except Exception: d={}
        if d.get('code')==0:
            d=d['data']; output.append({'bvid':bv,'url':'https://www.bilibili.com/video/'+bv+'/','title':d.get('title'),'author':d.get('owner',{}).get('name'),'description':d.get('desc'),'publishedAt':datetime.fromtimestamp(d['pubdate'],timezone.utc).isoformat(),'evidence':m,'codes':re.findall(r'\|TA\|[a-fA-F0-9]{32}(?![a-fA-F0-9])',d.get('desc',''))})
            print(bv,d.get('title'),'codes',len(output[-1]['codes']),flush=True)
        else:
            output.append({'bvid':bv,'url':'https://www.bilibili.com/video/'+bv+'/','error':d.get('message',m['status']),'evidence':m})
            print(bv,'failed',flush=True)
        save(DATA/'web-sources.json',output)
        if m['status'] in ['rate_limited','access_denied']:break

if __name__=='__main__':run()
