"""Boundary regressions for the public resource collector; no network calls."""
import io, json, sys, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'tools'))
import collect
from PIL import Image

class CollectionBoundaries(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.root=Path(self.temp.name)
        self.patches=[patch.object(collect,'ROOT',self.root),patch.object(collect,'DATA',self.root/'data'),patch.object(collect,'SNAP',self.root/'data'/'snap')]
        for p in self.patches:p.start()
    def tearDown(self):
        for p in self.patches:p.stop()
        self.temp.cleanup()
    def page(self,ids,total=2,pages=2):
        return {'success':True,'data':{str(i):{'name':'角色'+str(i),'rarity':4} for i in ids},'total_num':total,'total_page':pages}
    def mock_catalog(self,pages,static_ids):
        queue=list(pages)
        def request(url,*args,**kwargs):
            if url==collect.STATIC:value=[{'id':i,'name':'角色'+str(i),'level':'SSR'} for i in static_ids]
            else:value=queue.pop(0)
            return {'status':'received','url':url},json.dumps(value).encode()
        return request
    def test_all_pages_and_cross_check(self):
        with patch.object(collect,'request',self.mock_catalog([self.page([1]),self.page([2])],[1,2])):collect.roster()
        r=collect.read(collect.DATA/'roster-report.json')
        self.assertEqual(r['paginationErrors'],[])
        self.assertEqual(r['unionCount'],2)
        self.assertEqual(r['pages'],2)
    def test_repeated_page_cannot_claim_complete(self):
        with patch.object(collect,'request',self.mock_catalog([self.page([1]),self.page([1])],[1,2])):collect.roster()
        r=collect.read(collect.DATA/'roster-report.json')
        self.assertIn('empty/repeated/no-new page',r['paginationErrors'])
        self.assertEqual(r['onlyStatic'],['2'])
    def test_total_count_mismatch_and_unknown_shape(self):
        with patch.object(collect,'request',self.mock_catalog([self.page([1],2,1)],[1])):collect.roster()
        self.assertTrue(any('count mismatch' in e for e in collect.read(collect.DATA/'roster-report.json')['paginationErrors']))
        with patch.object(collect,'request',self.mock_catalog([{'success':True,'data':[]}],[])):collect.roster()
        self.assertIn('unknown data structure',collect.read(collect.DATA/'roster-report.json')['paginationErrors'])
    def test_html_error_is_not_an_image(self):
        with patch.object(collect,'request',return_value=({'status':'received'},b'<html>not an image</html>')):r=collect.image_probe([1],['art-before'],None)
        self.assertEqual(r[0]['status'],'invalid_image')
        self.assertNotIn('localPath',r[0])
    def test_404_is_different_from_denied_and_throttle(self):
        for status in ['missing_resource','access_denied','rate_limited','network_error']:
            with patch.object(collect,'request',return_value=({'status':status},b'')):r=collect.image_probe([1],['art-after'],None)
            self.assertEqual(r[0]['status'],status)
            self.assertIsNone(r[0]['verifiedState'])
    def test_valid_png_dimensions_and_bytes_preserved(self):
        b=io.BytesIO();Image.new('RGBA',(13,21),(0,0,0,0)).save(b,format='PNG');raw=b.getvalue()
        with patch.object(collect,'request',return_value=({'status':'received'},raw)):r=collect.image_probe([1],['art-before'],None)
        self.assertEqual((r[0]['width'],r[0]['height']),(13,21))
        self.assertEqual((self.root/r[0]['localPath']).read_bytes(),raw)
        self.assertFalse(r[0]['nativeCardVerified'])
    def test_awakening_unavailable_comes_from_attribute_response(self):
        collect.save(collect.DATA/'roster.json',[{'id':'1','name':'角色1'}])
        def request(url,*args,**kwargs):
            d={'success':True,'data':None if 'awake=1' in url else {'attack':100}}
            return {'status':'received'},json.dumps(d).encode()
        seen=[]
        def probe(ids,families,report):
            seen.extend(families);return []
        with patch.object(collect,'request',request),patch.object(collect,'image_probe',probe):collect.collect_full()
        self.assertEqual(seen,['art-before','portrait-before'])
        self.assertEqual(collect.read(collect.DATA/'asset-manifest.json')['1']['awakeningAvailability'],'not_applicable')
    def test_n_gua_attribute_dictionary_does_not_prove_awakening(self):
        self.assertEqual(collect.awakening_status({'id':'404','rarity':'N'},{'0':{'attack':1},'1':{'attack':1}}),'not_applicable')

if __name__=='__main__':unittest.main()
