"""Collect a bounded list of public reference pages, never account data."""
import re, json, html
from collect import *

ALLOWED.update({'sina.cn', 'www.9game.cn', 'jingxuan.douyin.com'})
sources=read(DATA/'web-sources.json', [])
jobs=[('event-qimian','https://sina.cn/news/detail/5340813383173189.html','七面相｜拾光永恒短线、困难与探索阵容','__七面相','2026-09-08'),('event-jiuyou','https://www.9game.cn/yys/12074556.html','拾光永恒稳定挂机阵容','九游','2026-09-09'),('event-gehai','https://jingxuan.douyin.com/m/video/7683309392934079759','拾光永恒活动阵容','鸽海成路','2026-09-09')]
for key,url,title,author,date in jobs:
    m,b=request(url,key)
    body=html.unescape(b.decode('utf-8',errors='replace'))
    body=re.sub(r'<(script|style)\b[^>]*>.*?</\1>','',body,flags=re.S)
    body=html.unescape(re.sub('<[^>]+>','\n',body))
    body=re.sub('[ \t]+',' ',body)
    codes=list(dict.fromkeys(re.findall(r'\|TA\|[a-fA-F0-9]{32}(?![a-fA-F0-9])',body)))
    sources=[s for s in sources if s.get('bvid')!=key]
    sources.append({'bvid':key,'url':url,'title':title,'author':author,'publishedAt':date,'description':body,'evidence':m,'codes':codes})
    print(key,len(codes),m['status'])
for bv in ['BV1La4y1f7CY','BV1Tw411z7KG','BV1Rv41137hX']:
    m,b=request('https://api.bilibili.com/x/web-interface/view?bvid='+bv,'video-'+bv)
    d=json.loads(b).get('data')
    if d:
        sources=[s for s in sources if s.get('bvid')!=bv]
        sources.append({'bvid':bv,'url':'https://www.bilibili.com/video/'+bv+'/','title':d['title'],'author':d['owner']['name'],'publishedAt':datetime.fromtimestamp(d['pubdate'],timezone.utc).isoformat(),'description':d['desc'],'evidence':m,'codes':re.findall(r'\|TA\|[a-fA-F0-9]{32}',d['desc'])})
        print(bv,d['title'])
save(DATA/'web-sources.json',sources)
