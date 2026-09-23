"""Protocol regression vectors from the independently verified login client."""
import sys
import base64
import hashlib
import json
import struct
import unittest
import urllib.parse
import zlib
from pathlib import Path
from unittest.mock import Mock, patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'desktop'/'ta-python'))
from Crypto.Cipher import ARC4
import msgpack
import onmyoji_network as net
from onmyoji_mpay import MpayClient
CODE='|TA|'+'a'*32

class Socket:
    def __init__(self, chunks=()):
        self.chunks = iter(chunks)
        self.timeout = 15
        self.sent = []

    def recv(self, size):
        return next(self.chunks, b'')

    def sendall(self, data):
        self.sent.append(data)

    def settimeout(self, value):
        self.timeout = value

    def gettimeout(self):
        return self.timeout

    def close(self):
        pass

def gate(sock=None):
    with patch.object(net.socket, 'create_connection', return_value=sock or Socket()):
        return net.Gate('unused.invalid', 1)

def frame(index, proto):
    payload = proto.SerializeToString()
    return struct.pack('<IH', len(payload) + 2, index) + payload

def login_result():
    return {'errorCode': 0, 'avatar_list': {
        'record-a': {'avatarId': 'role-a', 'name': '测试角色', 'level': 60},
        'record-b': {'avatarId': 'role-b', 'name': '注销角色', 'deactive': 1},
        'record-c': {'avatarId': 'role-c', 'name': ''}}}

def qr_login_info():
    return {'code': 'test-only', 'src_client_type': 1, 'mpay_device_id': 'test-device',
            'mpay_user': {'id': 'test-user', 'token': 'fresh-test-token', 'login_channel': 'netease'}}

class NetworkTests(unittest.TestCase):
    def test_assistant_initializes_once_before_queries_and_honors_feature_switch(self):
        client = gate()
        client.avatar_id = b'v' * 12
        client.rpc = Mock()
        client.wait_events = Mock(return_value=iter([
            ('lineup_assisant_logic_get_info_cb', {'info': {'my_lineup_num': 0}})]))
        client.ensure_lineup_assistant()
        client.ensure_lineup_assistant()
        client.rpc.assert_called_once_with('lineup_assisant_logic.get_info', {}, entity_id=client.avatar_id)
        client.assistant_ready = False
        client.function_switch = {'988': False}
        with self.assertRaisesRegex(net.AssistantUnavailable, '未开放'):
            client.ensure_lineup_assistant()
        client.function_switch = {}
        client.wait_events = Mock(return_value=iter([]))
        with self.assertRaisesRegex(net.AssistantUnavailable, '初始化'):
            client.ensure_lineup_assistant()
        self.assertFalse(client.assistant_ready)

    def test_assistant_callback_must_belong_to_selected_avatar(self):
        client = gate()
        client.avatar_id = b'v' * 12
        msg = client.message('EntityMessage', id=b'x' * 12, parameters=msgpack.packb({'info': {}}))
        msg.method.md5 = hashlib.md5(b'lineup_assisant_logic_get_info_cb').digest()
        client.receive = Mock(return_value=('entity_message', msg))
        self.assertEqual(client.next_event()[1], {})
        msg.id = client.avatar_id
        self.assertEqual(client.next_event(), ('lineup_assisant_logic_get_info_cb', {'info': {}}))

    def test_pc_qr_uses_verified_common_sdk_version(self):
        with patch.object(net, 'http_get', return_value={}) as request:
            net.MpayQR()._get('/api/qrcode/create_login')
        params = urllib.parse.parse_qs(urllib.parse.urlparse(request.call_args.args[0]).query)
        self.assertEqual(params['cv'], ['c4.19.1'])

    def test_pc_qr_requests_remember_mode_without_fabricating_consent(self):
        qr = net.MpayQR()
        qr.client.register = Mock()
        qr.client.device_id = 'test-device'
        qr._get = Mock(side_effect=[{'uuid': 'test-uuid'}, b'\x89PNG\r\n\x1a\nexample'])
        qr.create()
        self.assertEqual(qr._get.call_args_list[0].args, ('/api/qrcode/create_login', {
            'qrcode_channel_type': '2', 'is_remember': '2', 'device_id': 'test-device'}))

    def test_account_destroy_after_avatar_creation_does_not_abort_query(self):
        client = gate()
        client.account_id, client.avatar_id = b'a' * 12, b'v' * 12
        client.rpc = Mock()
        response = {'err': 0, 'share_key': CODE[4:], 'lineup_data': 'encoded'}
        client.wait_events = Mock(return_value=iter([
            ('destroy_entity', {'entity_id': client.account_id}),
            ('destroy_entity', {'entity_id': b'x' * 12}),
            ('lineup_assisant_logic_get_share_lineup_data_cb', response)]))
        self.assertEqual(client.query_lineup(CODE[4:]), response)
        client.wait_events = Mock(return_value=iter([('destroy_entity', {'entity_id': client.avatar_id})]))
        with self.assertRaises(net.ProtocolError):
            client.query_lineup(CODE[4:])

    def test_destroy_event_keeps_entity_identity(self):
        client = gate()
        reply = client.message('EntityMessage', id=b'a' * 12)
        client.receive = Mock(return_value=('destroy_entity', reply))
        self.assertEqual(client.next_event(), ('destroy_entity', {'entity_id': b'a' * 12}))

    def test_fragmented_and_coalesced_frames(self):
        client = gate()
        wire = b''.join(frame(0, client.message('SessionSeed', seed=n)) for n in (17, 91))
        client.sock = Socket([wire[:1], wire[1:5], wire[5:9], wire[9:]])
        self.assertEqual(client.receive()[1].seed, 17)
        self.assertEqual(client.receive()[1].seed, 91)

    def test_encrypted_compressed_stream_across_packets(self):
        client = gate()
        key = b'test-session-key-1234'
        cipher, comp = ARC4.new(key), zlib.compressobj()
        chunks = []
        for n in (123, 456):
            data = comp.compress(frame(0, client.message('SessionSeed', seed=n))) + comp.flush(zlib.Z_SYNC_FLUSH)
            chunks.append(cipher.encrypt(data))
        client.sock = Socket([chunks[0][:3], chunks[0][3:] + chunks[1][:4], chunks[1][4:]])
        client.dec, client.decomp = ARC4.new(key), zlib.decompressobj()
        self.assertEqual([client.receive()[1].seed for _ in range(2)], [123, 456])

    def test_oversized_frame_rejected_before_payload(self):
        client = gate(Socket([struct.pack('<I', net.MAX_RESPONSE + 1)]))
        with self.assertRaises(net.ProtocolError):
            client.receive()

    def test_callback_must_match_entity(self):
        client = gate()
        client.account_id = b'a' * 12
        msg = client.message('EntityMessage', id=b'x' * 12,
                             parameters=msgpack.packb({'errorCode': 0}))
        msg.method.md5 = hashlib.md5(b'on_login_result').digest()
        client.receive = Mock(return_value=('entity_message', msg))
        self.assertEqual(client.next_event()[1], {})

    def test_only_named_active_returned_roles(self):
        self.assertEqual(net.account_avatars(login_result()), [
            {'avatar_id': 'role-a', 'record_id': 'record-a', 'name': '测试角色', 'level': 60}])
        self.assertEqual(net.account_avatars({'errorCode': 1, 'avatar_list': login_result()['avatar_list']}), [])

    def test_login_wire_ec_is_normalized(self):
        client = gate()
        client.rpc = Mock()
        client.wait_events = Mock(return_value=iter([('on_login_result', {'ec': 7, 'avatar_list': {}})]))
        result = client.login_by_qr(qr_login_info(), '10014')
        info = client.rpc.call_args.args[1]['account_info']
        # GameWorld.getLocalVersion copies the complete four-part string to
        # all four fields for an unpatched package; it never sends an int.
        for key in ('app_version', 'patch_version', 'res_version', 'script_version'):
            self.assertEqual(info[key], '2.8.83.2384860')
        self.assertEqual(set(info['network']),
                         {'use_ipv6', 'use_3xian', 'ip_errcode', 'reconn_count', 'network', 'py', 'platform'})
        client.wait_events.assert_called_once_with(seconds=120)
        self.assertEqual(result['errorCode'], 7)

    def test_sdk_auth_uses_exchanged_token_and_preserves_server_fields(self):
        client = gate()
        client.rpc = Mock()
        client.wait_events = Mock(return_value=iter([('on_login_result', {'ec': 0})]))
        login = qr_login_info()
        original = {'sessionid': 'old-phone-token', 'sdkuid': 'old-phone-uid',
                    'signed_test_field': 'server-issued', 'realname': '{"test":"unchanged"}'}
        extra = urllib.parse.quote_plus(base64.b64encode(json.dumps(original).encode()).decode())
        login['mpay_user']['pc_ext_info'] = {'extra_unisdk_data': json.dumps({'SAUTH_JSON': extra})}
        client.login_by_qr(login, '10014')
        self.assertEqual(client.rpc.call_args.args[0], 'login_with_sdk')
        info = client.rpc.call_args.args[1]['account_info']
        self.assertEqual(info['session'], 'fresh-test-token')
        self.assertIn('sessionid=fresh-test-token', info['sauth_str'])
        self.assertIn('signed_test_field=server-issued', info['sauth_str'])
        self.assertEqual(dict(urllib.parse.parse_qsl(info['sauth_str']))['realname'], '{"test":"unchanged"}')
        self.assertNotIn('old-phone-token', info['sauth_str'])
        self.assertNotIn('old-phone-uid', info['sauth_str'])

    def test_pc_renewal_keeps_game_platform_and_current_sdk_token(self):
        for platform_name, app_channel in [('ios', 'app_store'), ('ad', 'netease')]:
            with self.subTest(platform=platform_name):
                login = qr_login_info()
                login['full_uid'] = f'test-user@{platform_name}.netease.win.163.com'
                login['mpay_user']['pc_ext_info'] = {
                    'src_client_type': 5, 'src_app_channel': 'netease',
                    'src_pay_channel': 'netease', 'src_sdk_version': '4.19.1'}
                client = gate()
                client.rpc = Mock()
                client.wait_events = Mock(return_value=iter([('on_login_result', {'ec': 0})]))
                client.login_by_qr(login, '10014')
                info = client.rpc.call_args.args[1]['account_info']
                self.assertEqual(info['full_uid'], login['full_uid'])
                self.assertEqual(info['platform'], platform_name)
                self.assertEqual(info['app_channel'], app_channel)
                self.assertEqual(info['pay_channel'], app_channel)
                self.assertEqual(info['sdk_version'], '4.19.1')
                self.assertEqual(info['session'], 'fresh-test-token')
                self.assertIn('platform=' + platform_name, info['sauth_str'])
                self.assertIn('app_channel=' + app_channel, info['sauth_str'])
                self.assertTrue(info['is_login_in_pc'])
                self.assertEqual(info['pc_app_channel'], 'netease')
                self.assertEqual(login['mpay_user']['pc_ext_info']['src_client_type'], 5)

    def test_unknown_or_mismatched_game_platform_cannot_default_to_android(self):
        login = qr_login_info()
        login['mpay_user']['pc_ext_info'] = {'src_client_type': 5}
        with self.assertRaises(net.ProtocolError):
            net.game_platform(login)
        login['full_uid'] = 'another-user@ios.netease.win.163.com'
        with self.assertRaises(net.ProtocolError):
            net.game_platform(login)

    def test_mpay_exchange_matches_java_aes_reference(self):
        client = MpayClient('test-game')
        client.device_id = 'test-device'
        client.device_key = bytes.fromhex('00112233445566778899aabbccddeeff')
        client._post = Mock(return_value={'user': {'id': 'test-user', 'token': 'test-token'}})
        client.exchange('test-qr-confirmation')
        path, fields = client._post.call_args.args
        self.assertEqual(path, '/api/users/login/qrcode/exchange_token')
        # Obtained independently with Java Cipher AES/ECB/PKCS5Padding.
        self.assertEqual(fields['encrypt_code'], 'daaad4d04e323e7f221396d194ab2ceaec8edbce460a80c62ffdfaefcb6fe220')
        client.close()
        self.assertIsNone(client.user)
        self.assertEqual(client.device_key, b'')

    def test_server_index_registration_is_outbound_only(self):
        client = gate()
        before = dict(client.index_names)
        reply = Mock(md5=hashlib.md5(b'on_login_result').digest(), index=200001)
        client.receive = Mock(return_value=('reg_md5_index', reply))
        self.assertEqual(client.next_event()[0], 'rpc_index')
        self.assertEqual(client.index_names, before)

    def test_select_role_contract_and_avatar_boundary(self):
        client = gate()
        client.account_id, client.login_result = b'a' * 12, login_result()
        client.rpc = Mock()
        client.wait_events = Mock(return_value=iter([
            ('create_entity', {'entity_type': 'ClientEntity', 'entity_id': b'x' * 12}),
            ('create_entity', {'entity_type': 'ClientAvatar', 'entity_id': b'v' * 12})]))
        client.select_role('role-a')
        client.rpc.assert_called_once_with('select_role', {
            'id': 10, 'avatar_id': 'role-a',
            'client_cache_data_md5': {'rpc_static_index_map_md5': net.CONFIG['static_rpc_md5']}})
        self.assertEqual(client.avatar_id, b'v' * 12)
        with self.assertRaises(net.ProtocolError):
            client.select_role('another-account-role')

    def test_ta_uses_avatar_and_rejects_wrong_key(self):
        client = gate()
        client.account_id, client.avatar_id = b'a' * 12, b'v' * 12
        client.rpc = Mock()
        key = CODE[4:]
        reply = {'err': 0, 'share_key': key, 'lineup_data': 'encoded'}
        client.wait_events = Mock(return_value=iter([
            ('lineup_assisant_logic_get_share_lineup_data_cb', {**reply, 'share_key': '0' * 32}),
            ('lineup_assisant_logic_get_share_lineup_data_cb', reply)]))
        self.assertEqual(client.query_lineup(key), reply)
        client.rpc.assert_called_once_with('lineup_assisant_logic.get_share_lineup_data',
                                           {'share_key': key}, entity_id=b'v' * 12)

    def test_server_merge_keeps_new_and_unavailable_definitions(self):
        rows = net.server_catalog('other 1 all new_server 99999 example.invalid:1234:1:1\n')
        self.assertEqual(len(rows), 158)
        self.assertEqual(sum(r['available'] for r in rows), 1)
        self.assertEqual(next(r for r in rows if r['id'] == '99999')['category_id'], 0)
        self.assertEqual(sum(r['category_id'] == 4 for r in rows), 4)
        self.assertEqual(sum(r['category_id'] == 6 for r in rows), 110)

    def test_mpay_remembered_login_uses_get_and_preserves_optional_qr_context(self):
        saved = {'mpay_device_id': 'test-device', 'mpay_user': {'id': 'test-user', 'token': 'old',
                 'pc_ext_info': {'is_remember': True, 'src_client_type': 2}}}
        client = MpayClient('test-game')
        client._request = Mock(return_value={'user': {'token': 'new'}})
        user = client.resume(saved)
        client._request.assert_called_once_with('/games/test-game/devices/test-device/users/test-user',
                                               {'token': 'old', 'verify_status': '0', 'cv': 'c4.19.1',
                                                'opt_fields': 'nickname,avatar,realname_status,mobile_bind_status'}, 'GET')
        self.assertEqual(user['id'], 'test-user')
        self.assertEqual(user['token'], 'new')
        self.assertTrue(user['pc_ext_info']['is_remember'])
        self.assertEqual(user['pc_ext_info']['src_client_type'], 2)
        client._request.return_value = {'user': {'pc_ext_info': {'is_remember': False}}}
        self.assertFalse(client.resume(saved)['pc_ext_info']['is_remember'])
        client._request.return_value = {'user': {'id': 'another-user', 'token': 'wrong'}}
        with self.assertRaises(Exception):
            client.resume(saved)

    def test_channel_session_remains_opaque_and_never_replaces_mpay_token(self):
        login = qr_login_info()
        login['mpay_user'].update(login_channel='bilibili_sdk', token=urllib.parse.quote_plus(base64.b64encode(b'opaque&a=b+c').decode()))
        login['full_uid'] = 'sdk-issued-test-identity'
        original = login['mpay_user']['token']
        self.assertEqual(net.sdk_session(login), 'opaque&a=b+c')
        self.assertEqual(net.sdk_full_uid(login), 'sdk-issued-test-identity')
        self.assertEqual(net.role_query_uid(login), 'test-user@ad.bilibili_sdk.win.163.com')
        self.assertEqual(login['mpay_user']['token'], original)
        connection = gate()
        connection.rpc = Mock()
        connection.wait_events = Mock(return_value=iter([('on_login_result', {'ec':0})]))
        connection.login_by_qr(login, '15021')
        account_info = connection.rpc.call_args.args[1]['account_info']
        self.assertEqual(account_info['session'], 'opaque&a=b+c')
        self.assertEqual(dict(urllib.parse.parse_qsl(account_info['sauth_str']))['sessionid'], 'opaque&a=b+c')
        self.assertEqual(account_info['auth_type'], 'native')
        del login['full_uid']
        with self.assertRaisesRegex(net.ProtocolError, '账号标识'):
            net.sdk_full_uid(login)
        login['mpay_user']['token'] = '!invalid'
        with self.assertRaises(net.ProtocolError):
            net.sdk_session(login)

    def test_native_channel_visibility_and_existing_role_override(self):
        login = qr_login_info()
        for channel, platform, expected in [('netease', 1, [1,2,5,6,7]), ('bilibili_sdk', 1, [3,4,5,6,7]), ('huawei', 1, [3,5,6,7]), ('netease', 2, [1,2,4,5,6,7])]:
            login['src_client_type'] = platform
            login['mpay_user']['login_channel'] = channel
            self.assertEqual([t for t in range(1,8) if net.server_compatible({'id':'7','source_type':t},login)], expected)
        login['mpay_user']['login_channel'] = 'huawei'
        self.assertTrue(net.server_compatible({'id':'7','source_type':1},login,[{'server_id':'7','from_channel':'huawei'}]))

    def test_share_callback_is_decoded_only_for_selected_avatar(self):
        client = gate()
        client.account_id, client.avatar_id = b'a'*12, b'b'*12
        name = 'lineup_assisant_logic_save_and_share_lineup_data_cb'
        proto = client.message('EntityMessage', id=b'a'*12, parameters=msgpack.packb({'err':0,'share_key':'test'}))
        proto.method.md5 = hashlib.md5(name.encode()).digest()
        client.receive = Mock(return_value=('entity_message',proto))
        self.assertEqual(client.next_event()[1], {})
        proto.id = b'b'*12
        self.assertEqual(client.next_event()[1]['share_key'],'test')
        client.rpc = Mock()
        client.wait_events = Mock(return_value=iter([(name,{'err':0,'share_key':'test','lineup_data':'dGVzdA=='})]))
        self.assertEqual(client.share_lineup('dGVzdA==')['share_key'],'test')
        client.rpc.assert_called_once_with('lineup_assisant_logic.save_and_share_lineup_data', {'lineup_data':'dGVzdA=='}, entity_id=b'b'*12)

    def test_share_waits_past_callback_for_another_entity(self):
        client = gate()
        client.account_id, client.avatar_id = b'a'*12, b'b'*12
        name = 'lineup_assisant_logic_save_and_share_lineup_data_cb'
        messages = []
        for recipient in (b'a'*12, b'b'*12):
            proto = client.message('EntityMessage', id=recipient, parameters=msgpack.packb({'err': 0, 'share_key': 'correct-key', 'lineup_data': 'dGVzdA=='}))
            proto.method.md5 = hashlib.md5(name.encode()).digest()
            messages.append(('entity_message', proto))
        client.receive = Mock(side_effect=messages)
        client.rpc = Mock()
        self.assertEqual(client.share_lineup('dGVzdA==')['share_key'], 'correct-key')
        self.assertEqual(client.receive.call_count, 2)
