"""Exercise account boundaries and the production session without network I/O."""
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'desktop' / 'ta-python'))
import session as mod

CODE = '|TA|' + 'a' * 32


def make_session():
    app = mod.Session()
    app.catalog = [{'id': '10014', 'name': '测试服务器', 'category': '测试', 'available': True,
                    'addresses': [{'host': 'unused.invalid', 'port': 1234}]}]
    return app


def authorize(app):
    app.authenticated = True
    app.login_info = {'full_uid': 'test-user@ad.netease.win.163.com', 'token': 'secret-test-token'}
    app.selected_avatar = 'role-a'
    app.roles = [{'server_id': '10014', 'avatar_id': 'role-a', 'name': '测试角色'}]
    return app


def client():
    obj = Mock(server_id='10014')
    obj.login_result = {'errorCode': 0, 'avatar_list': {'record-a': {'avatarId': 'role-a', 'name': '测试角色'}}}
    obj.login_by_qr.return_value = obj.login_result
    obj.query_lineup.return_value = {'err': 0, 'share_key': CODE[4:], 'lineup_data': 'test-payload'}
    return obj


class SessionTests(unittest.TestCase):
    def test_query_and_share_wait_for_assistant_initialization(self):
        for operation in ('query', 'share'):
            for accepted in (True, False):
                app, gate = authorize(make_session()), client()
                gate.assistant_ready = False
                calls = []
                def initialize():
                    calls.append('initialize')
                    if not accepted:
                        raise mod.net.AssistantUnavailable('初始化未完成')
                    gate.assistant_ready = True
                gate.ensure_lineup_assistant.side_effect = initialize
                gate.query_lineup.side_effect = lambda key: (calls.append('query') or {'err': 0, 'share_key': key, 'lineup_data': 'payload'})
                gate.share_lineup.side_effect = lambda code: (calls.append('share') or {'err': 0, 'share_key': 'new-code', 'lineup_data': code})
                with patch.object(mod.net, 'Gate', return_value=gate):
                    invoke = lambda: app.query(CODE) if operation == 'query' else app.share('#TA#YQ==')
                    if accepted:
                        invoke()
                        self.assertEqual(calls, ['initialize', operation])
                    else:
                        with self.assertRaises(mod.net.AssistantUnavailable):
                            invoke()
                        self.assertEqual(calls, ['initialize'])
                        self.assertIsNone(app.gate)
                app.clear_login()

    def test_new_login_selects_lowest_known_level_across_available_servers(self):
        app = authorize(make_session())
        app.selected_avatar = ''
        app.catalog.append({**app.catalog[0], 'id': '10123'})
        records = [
            {'server_id': '10014', 'avatarId': 'high', 'name': '高等级', 'level': 60},
            {'server_id': '10123', 'avatarId': 'unknown', 'name': '未知等级'},
            {'server_id': '10123', 'avatarId': 'low', 'name': '低等级', 'level': '2'},
            {'server_id': '19999', 'avatarId': 'offline', 'name': '不可连接', 'level': 1},
            {'server_id': '10123', 'avatarId': 'deleted', 'name': '注销', 'level': 1, 'deactive': 1},
        ]
        with patch.object(mod.net, 'query_own_roles', return_value=records):
            app.load_roles()
        self.assertEqual((app.selected_server, app.selected_avatar), ('10123', 'low'))
        self.assertTrue(app.status()['query_ready'])
        app.select('10014')
        self.assertEqual(app.selected_avatar, 'high')

    def test_refresh_keeps_valid_manual_selection_and_ties_are_stable(self):
        app = authorize(make_session())
        app.roles = [{'server_id': '10014', 'avatar_id': 'role-a', 'name': '已有选择', 'level': 60},
                     {'server_id': '10014', 'avatar_id': 'b', 'name': '同级乙', 'level': 1},
                     {'server_id': '10014', 'avatar_id': 'a', 'name': '同级甲', 'level': 1}]
        app.choose_role()
        self.assertEqual(app.selected_avatar, 'role-a')
        app.selected_avatar = ''
        app.choose_role()
        self.assertEqual(app.selected_avatar, 'a')
        app.selected_avatar = ''
        app.roles.reverse()
        app.choose_role()
        self.assertEqual(app.selected_avatar, 'a')

    def test_local_missing_level_does_not_erase_known_cross_server_level(self):
        app = authorize(make_session())
        with patch.object(mod.net, 'query_own_roles', return_value=[
                {'server_id': '10014', 'avatarId': 'role-a', 'name': '测试角色', 'level': 12}]):
            app.load_roles(client())
        self.assertEqual(app.roles[0]['level'], 12)

    def test_empty_failed_and_unavailable_roles_have_distinct_recovery_messages(self):
        app = authorize(make_session())
        with patch.object(mod.net, 'query_own_roles', return_value=[]):
            app.load_roles()
        self.assertEqual(app.stage, 'roles_empty')
        self.assertIn('创建角色', app.message)
        self.assertFalse(app.status()['query_ready'])
        with patch.object(mod.net, 'query_own_roles', side_effect=OSError()):
            app.load_roles()
        self.assertEqual(app.stage, 'roles_partial')
        self.assertIn('重试', app.message)
        with patch.object(mod.net, 'query_own_roles', return_value=[
                {'server_id': '19999', 'avatarId': 'a', 'name': '已有角色', 'level': 1}]):
            app.load_roles()
        self.assertEqual(app.stage, 'roles_unavailable')
        self.assertEqual(app.selected_avatar, '')
        self.assertFalse(app.status()['query_ready'])
        self.assertNotIn('创建角色', app.message)
        with self.assertRaises(mod.net.ProtocolError):
            app.select('19999', 'a')

    def test_invalid_levels_sort_after_valid_levels(self):
        app = authorize(make_session())
        app.selected_avatar = ''
        app.roles = [{'server_id': '10014', 'avatar_id': str(i), 'name': '角色', 'level': level}
                     for i, level in enumerate([None, '', 'bad', -1, True, float('nan'), 2.5, 5])]
        app.choose_role()
        self.assertEqual(app.selected_avatar, '7')

    def test_qr_confirmation_waits_for_busy_operation_and_respects_cancellation(self):
        for cancelled in (False, True):
            app, qr = make_session(), Mock(interval=.01, image=b'', created_at=mod.time.monotonic())
            qr.poll.return_value = ('confirmed', {'full_uid': 'synthetic'})
            app.authenticate = Mock()
            with patch.object(mod.net, 'MpayQR', return_value=qr), patch.object(mod.threading, 'Thread') as thread:
                app.start_qr()
                poll = thread.call_args.kwargs['target']
            app.busy = True
            sleeps = []
            def finish_operation(delay):
                sleeps.append(delay)
                if len(sleeps) == 2:
                    app.busy = False
                    if cancelled:
                        app.clear_login()
            with patch.object(mod.time, 'sleep', side_effect=finish_operation):
                poll()
            self.assertEqual(app.authenticate.call_count, 0 if cancelled else 1)
            self.assertFalse(app.busy)

    def test_business_errors_keep_healthy_connection_and_forward_only_safe_fields(self):
        app, gate = authorize(make_session()), client()
        with patch.object(mod.net, 'Gate', return_value=gate) as factory:
            for err in (90011, 31279, 17):
                gate.query_lineup.return_value = {'err': err, 'share_key': CODE[4:],
                                                'lineup_data': 'do-not-forward', 'token': 'private'}
                self.assertEqual(app.query(CODE), {'err': err, 'share_key': CODE[4:], 'code': CODE})
                self.assertIs(app.gate, gate)
                gate.close.assert_not_called()
            gate.query_lineup.return_value = {'err': 0, 'share_key': CODE[4:], 'lineup_data': 'test-payload'}
            self.assertEqual(app.query(CODE)['lineup_data'], 'test-payload')
            self.assertEqual(factory.call_count, 1)
            gate.select_role.assert_called_once()
        app.clear_login()

    def test_unauthenticated_calls_and_arbitrary_roles_are_rejected(self):
        app = make_session()
        with patch.object(mod.net, 'Gate') as gate, patch.object(mod.net, 'query_own_roles') as roles:
            for fn in (app.load_roles, lambda: app.query(CODE), lambda: app.select('10014', 'someone-else')):
                with self.assertRaises(mod.net.ProtocolError):
                    fn()
            gate.assert_not_called()
            roles.assert_not_called()

    def test_credentials_cannot_reach_status_or_errors(self):
        app = authorize(make_session())
        app.login_info['mpay_user'] = {'token': 'nested-secret-token'}
        status = json.dumps(app.status())
        for token in ('secret-test-token', 'test-user@', 'nested-secret-token'):
            self.assertNotIn(token, status)
        safe = app.safe_error(mod.net.ProtocolError('secret-test-token nested-secret-token'))
        self.assertNotIn('secret-token', safe)
        app.clear_login()
        self.assertFalse(app.authenticated)
        self.assertIsNone(app.login_info)
        self.assertEqual(app.roles, [])

    def test_partial_roles_preserve_current_server_and_unknown_other_servers(self):
        app = authorize(make_session())
        with patch.object(mod.net, 'query_own_roles', side_effect=OSError()):
            app.load_roles(client())
        self.assertFalse(app.roles_loaded)
        self.assertEqual(app.known_role_servers, {'10014'})
        self.assertEqual(app.selected_avatar, 'role-a')
        self.assertEqual(app.stage, 'roles_partial')

    def test_cross_server_roles_use_only_current_authenticated_identity(self):
        app = authorize(make_session())
        with patch.object(mod.net, 'query_own_roles', return_value=[
                {'server_id': 10123, 'avatarId': 'other-role', 'name': '另一个角色'},
                {'server_id': 10124, 'avatarId': 'deleted', 'name': '注销角色', 'deactive': 1}]) as query:
            app.load_roles(client())
            query.assert_called_once_with('test-user@ad.netease.win.163.com')
        self.assertEqual({r['avatar_id'] for r in app.roles}, {'other-role', 'role-a'})
        self.assertTrue(app.roles_loaded)
        with self.assertRaises(mod.net.ProtocolError):
            app.select('10123', 'role-a')

    def test_batch_reuses_avatar_and_retires_failed_or_idle_connection(self):
        app = authorize(make_session())
        first, second = client(), client()
        with patch.object(mod.net, 'Gate', side_effect=[first, second]) as factory:
            for _ in range(155):
                self.assertEqual(app.query(CODE)['code'], CODE)
            self.assertEqual(factory.call_count, 1)
            first.select_role.assert_called_once_with('role-a')
            first.close.assert_not_called()
            first.query_lineup.side_effect = TimeoutError()
            with self.assertRaises(TimeoutError):
                app.query(CODE)
            self.assertIsNone(app.gate)
            self.assertTrue(app.authenticated)
            self.assertEqual(app.query(CODE)['code'], CODE)
            self.assertEqual(factory.call_count, 2)
            app.clear_login()
            second.close.assert_called_once()
        first.close.assert_called_once()

    def test_wrong_share_key_failed_response_and_wrong_role_never_yield_data(self):
        for reply in ({'err': 0, 'share_key': 'b' * 32, 'lineup_data': 'wrong'},
                      {'err': False, 'share_key': CODE[4:], 'lineup_data': 'wrong'}):
            app, gate = authorize(make_session()), client()
            gate.query_lineup.return_value = reply
            with patch.object(mod.net, 'Gate', return_value=gate):
                with self.assertRaises(mod.net.ProtocolError):
                    app.query(CODE)
            gate.close.assert_called_once()
        app, gate = authorize(make_session()), client()
        gate.login_result['avatar_list'] = {'not-mine': {'avatarId': 'wrong', 'name': '其他角色'}}
        with patch.object(mod.net, 'Gate', return_value=gate):
            with self.assertRaises(mod.net.ProtocolError):
                app.query(CODE)
        gate.query_lineup.assert_not_called()

    def test_server_rejecting_login_invalidates_local_authentication(self):
        app, gate = authorize(make_session()), client()
        gate.login_by_qr.return_value = {'errorCode': 7}
        with patch.object(mod.net, 'Gate', return_value=gate):
            with self.assertRaises(mod.net.ProtocolError):
                app.query(CODE)
        self.assertFalse(app.authenticated)
        gate.select_role.assert_not_called()
        gate.query_lineup.assert_not_called()

    def test_channel_rejection_preserves_credentials_but_confirmed_expiry_invalidates(self):
        for response, expired in [({'errorCode': 25}, False),
                                  ({'errorCode': 5, 'sauth_result': {'code': 401}}, True)]:
            app, gate = authorize(make_session()), client()
            events = []
            app.credentials = events.append
            gate.login_by_qr.return_value = response
            with patch.object(mod.net, 'Gate', return_value=gate):
                with self.assertRaises(mod.net.ProtocolError):
                    app.query(CODE)
            self.assertFalse(app.authenticated)
            self.assertEqual(any(e['invalidate'] for e in events), expired)

    def test_invalid_input_cannot_start_a_connection(self):
        app = authorize(make_session())
        with patch.object(mod.net, 'Gate') as gate:
            for code in ('|TA|bad key', '|TA|' + 'x' * 4097, '#TA#123', {}, None):
                with self.assertRaises(mod.net.ProtocolError):
                    app.query(code)
            gate.assert_not_called()

    def test_remembered_restore_requires_consent_mpay_then_game_validation(self):
        saved = {'full_uid': 'synthetic@ad.netease.win.163.com', 'mpay_device_id': 'device',
                 'mpay_user': {'id': 'synthetic', 'token': 'old', 'pc_ext_info': {'is_remember': True}}}
        app, events = make_session(), []
        app.credentials = events.append
        mpay = Mock()
        mpay.resume.return_value = {**saved['mpay_user'], 'token': 'rotated'}
        app.load_servers = Mock()
        with patch.object(mod.net, 'MpayClient', return_value=mpay), patch.object(mod.net, 'Gate', return_value=client()), patch.object(mod.net, 'query_own_roles', return_value=[]):
            app.restore(saved, '10014', 'role-a')
        self.assertTrue(app.authenticated)
        self.assertEqual(app.login_info['mpay_user']['token'], 'rotated')
        self.assertEqual(saved['mpay_user']['token'], 'old')
        self.assertEqual(events[-1]['avatar_id'], 'role-a')
        self.assertNotIn('rotated', json.dumps(app.status()))
        mpay.close.assert_called_once()
        app.clear_login()
        saved['mpay_user']['pc_ext_info']['is_remember'] = False
        with patch.object(mod.net, 'MpayClient') as factory:
            with self.assertRaises(mod.net.ProtocolError):
                app.restore(saved)
            factory.assert_not_called()

    def test_mpay_network_failure_cannot_authenticate_or_invalidate_remembered_account(self):
        app, events = make_session(), []
        app.credentials = events.append
        saved = {'full_uid': 'synthetic', 'mpay_device_id': 'device',
                 'mpay_user': {'id': 'synthetic', 'token': 'old', 'pc_ext_info': {'is_remember': True}}}
        mpay = Mock()
        mpay.resume.side_effect = mod.net.MpayError('连接失败')
        with patch.object(mod.net, 'MpayClient', return_value=mpay), patch.object(mod.net, 'Gate') as gate:
            with self.assertRaises(mod.net.ProtocolError):
                app.restore(saved)
            gate.assert_not_called()
        self.assertFalse(app.authenticated)
        self.assertEqual(events, [])
        mpay.resume.side_effect = mod.net.MpayError('已失效', http_status=401)
        with patch.object(mod.net, 'MpayClient', return_value=mpay):
            with self.assertRaises(mod.net.ProtocolError):
                app.restore(saved)
        self.assertTrue(events[-1]['invalidate'])

    def test_missing_roles_cannot_reuse_a_remembered_avatar_id(self):
        app = authorize(make_session())
        with patch.object(mod.net, 'query_own_roles', return_value=[]):
            app.load_roles()
        self.assertEqual(app.selected_avatar, '')
        with patch.object(mod.net, 'Gate') as gate:
            with self.assertRaises(mod.net.ProtocolError):
                app.query(CODE)
            gate.assert_not_called()

    def test_authentication_discovers_lowest_compatible_role_before_gateway(self):
        app = make_session()
        app.catalog[0]['source_type'] = 2
        app.catalog.append({**app.catalog[0], 'id':'15021', 'source_type':4})
        app.login_info = {'src_client_type':1, 'full_uid':'sdk-test', 'mpay_user':{'id':'user','token':'test','login_channel':'bilibili_sdk'}}
        result = client()
        result.server_id = '15021'
        result.login_result['avatar_list'] = {'x':{'avatarId':'low','name':'小号','level':2}}
        events = []
        def roles(_):
            events.append('roles')
            return [{'server_id':'10014','avatarId':'wrong-channel','name':'不兼容','level':1},
                    {'server_id':'15021','avatarId':'low','name':'小号','level':2}]
        def open_gate(sid):
            events.append(sid)
            return result
        app.open_gate = open_gate
        with patch.object(mod.net, 'query_own_roles', side_effect=roles):
            app.authenticate()
        self.assertEqual(events[:2], ['roles','15021'])
        self.assertEqual(app.selected_avatar, 'low')
        self.assertFalse(app.status()['servers'][0]['available'])

    def test_share_reuses_only_an_owned_role_and_sanitizes_response(self):
        app, result = authorize(make_session()), client()
        result.share_lineup.return_value = {'err':0,'share_key':'new-key','lineup_data':'dGVzdA==','token':'must-not-leak'}
        with patch.object(mod.net, 'Gate', return_value=result):
            self.assertEqual(app.share('#TA#dGVzdA=='),{'err':0,'share_key':'new-key','code':'|TA|new-key','lineup_data':'dGVzdA=='})
            result.share_lineup.assert_called_once_with('dGVzdA==')
        app.clear_login()
        with self.assertRaises(mod.net.ProtocolError):
            app.share('#TA#dGVzdA==')
