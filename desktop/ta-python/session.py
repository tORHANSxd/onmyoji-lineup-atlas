"""Private session; only the Electron parent may persist authorized credentials."""
from __future__ import annotations

import base64
import copy
import json
import math
import re
import threading
import time

import onmyoji_network as net


def role_level(value):
    """Only a known positive integer may take priority over an unknown level."""
    if isinstance(value, bool):
        return math.inf
    try:
        level = float(value)
        return int(level) if math.isfinite(level) and level > 0 and level.is_integer() else math.inf
    except (TypeError, ValueError, OverflowError):
        return math.inf


def role_order(role):
    return role_level(role.get('level')), int(role['server_id']), role['avatar_id']


def normalize_roles(records):
    roles = []
    for row in records:
        if not isinstance(row, dict):
            continue
        sid = str(row.get('server_id') or row.get('serverid') or '')
        if not sid.isdigit():
            continue
        aid = net.role_id(row.get('avatarId', row.get('avatar_id', row.get('_id', row.get('player_id')))))
        name = row.get('name') or row.get('player_name') or row.get('nickName') or ''
        if aid and name and not row.get('deactive'):
            roles.append({'server_id': sid, 'avatar_id': aid, 'name': str(name),
                          'level': row.get('level', row.get('player_level')),
                          'from_channel': row.get('from_channel')})
    return sorted(roles, key=role_order)


class Session:
    def __init__(self, emit=lambda state: None, credentials=lambda data: None):
        self.emit = emit
        self.credentials = credentials
        self.lock = threading.RLock()
        self.catalog = net.server_catalog('')
        self.roles = []
        self.roles_loaded = False
        self.known_role_servers = set()
        self.selected_server = '10014'
        self.selected_avatar = ''
        self.authenticated = False
        self.login_info = None
        self.qr = self.gate = None
        self.gate_role = None
        self.gate_used_at = 0
        self.generation = 0
        self.busy = False
        self.stage, self.message, self.error = 'idle', '点击加载服务器后扫码登录', ''

    def server_available(self, server):
        return bool(server.get('available') and server.get('addresses') and
                    net.server_compatible(server, self.login_info, self.roles))

    def status(self):
        with self.lock:
            servers = []
            for row in self.catalog:
                servers.append({**{k: row.get(k) for k in ('id', 'name', 'category', 'available')},
                                'available': self.server_available(row),
                                'unavailable_reason': '渠道不兼容' if row.get('available') and not self.server_available(row) else '无连接地址',
                                'roles': [r for r in self.roles if r['server_id'] == row['id']],
                                'roles_known': self.roles_loaded or row['id'] in self.known_role_servers})
            image = self.qr.image if self.qr and self.stage in ('qr_waiting', 'qr_scanned') else b''
            return {'stage': self.stage, 'message': self.message, 'error': self.error,
                    'busy': self.busy, 'authenticated': self.authenticated,
                    'query_ready': self.authenticated and any(
                        r['server_id'] == self.selected_server and r['avatar_id'] == self.selected_avatar
                        for r in self.available_roles()),
                    'servers': servers, 'roles_loaded': self.roles_loaded,
                    'selected_server': self.selected_server, 'selected_avatar': self.selected_avatar,
                    'qr_image': ('data:image/png;base64,' + base64.b64encode(image).decode('ascii')) if image else ''}

    def update(self, stage, message, error=''):
        with self.lock:
            self.stage, self.message, self.error = stage, message, error
        self.emit(self.status())

    def safe_error(self, exc):
        if isinstance(exc, net.ProtocolError):
            text = str(exc)
        elif isinstance(exc, TimeoutError):
            text = '等待官方服务器响应超时，请重试'
        elif isinstance(exc, OSError):
            text = '连接已中断，请重试'
        else:
            text = '官方响应格式尚未兼容，请重新扫码或稍后重试'
        # Never include arbitrary response bodies, account identities or tokens.
        def hide(value):
            nonlocal text
            if isinstance(value, dict):
                for child in value.values():
                    hide(child)
            elif isinstance(value, str) and len(value) >= 6:
                text = text.replace(value, '[已隐藏]')
        hide(self.login_info)
        return text[:350]

    def run(self, action, params, done):
        methods = {'init': self.load_servers, 'qr': self.start_qr,
                   'select': self.select, 'roles': self.load_roles, 'query': self.query,
                   'restore': self.restore, 'share': self.share}
        if action not in methods:
            raise net.ProtocolError('不支持的操作')
        with self.lock:
            if self.busy:
                raise net.ProtocolError('上一项操作尚未完成；可退出登录取消')
            self.busy = True
        self.emit(self.status())

        def work():
            data, error = None, None
            try:
                data = methods[action](**params)
            except Exception as exc:
                error = self.safe_error(exc)
                self.update('assistant_unavailable' if isinstance(exc, net.AssistantUnavailable) else 'error',
                            '阵容助手暂不可用' if isinstance(exc, net.AssistantUnavailable) else '操作未完成', error)
            finally:
                with self.lock:
                    self.busy = False
                self.emit(self.status())
                done(data, error)
        threading.Thread(target=work, daemon=True).start()

    def load_servers(self):
        self.update('loading', '正在加载官方服务器列表')
        catalog = net.server_catalog()
        available = [s['id'] for s in catalog if s['available']]
        if not available:
            raise net.ProtocolError('官方列表当前没有可用连接地址，请稍后重试')
        self.catalog = catalog
        if self.selected_server not in available:
            self.selected_server = available[0]
            self.selected_avatar = ''
        if self.authenticated:
            self.choose_role()
            self.report_roles()
        else:
            self.update('ready', '服务器列表已加载，可以扫码登录')

    def select(self, server_id, avatar_id=''):
        if not isinstance(server_id, str) or not any(
                s['id'] == server_id and self.server_available(s) for s in self.catalog):
            raise net.ProtocolError('该服务器当前不可连接，请刷新服务器列表后重试')
        if not isinstance(avatar_id, str) or (avatar_id and not any(
                r['server_id'] == server_id and r['avatar_id'] == avatar_id for r in self.roles)):
            raise net.ProtocolError('只能选择本次账号返回的已有角色')
        if (server_id, avatar_id) != (self.selected_server, self.selected_avatar):
            self.drop_gate()
        self.selected_server, self.selected_avatar = server_id, avatar_id
        if self.authenticated:
            if not avatar_id:
                self.choose_role(server_id=server_id)
            self.save_credentials()

    def save_credentials(self, invalidate=False):
        info = self.login_info or {}
        if not info.get('full_uid'):
            return
        user = info.get('mpay_user') or {}
        # No one-time QR code, password, or unrelated refresh token is persisted.
        minimal = {k: info[k] for k in ('full_uid', 'mpay_device_id', 'src_client_type', 'login_channel') if k in info}
        minimal['mpay_user'] = {k: user[k] for k in ('id', 'token', 'login_channel', 'login_type', 'pc_ext_info') if k in user}
        role = next((r for r in self.roles if r['server_id'] == self.selected_server
                     and r['avatar_id'] == self.selected_avatar), {})
        server = next((s for s in self.catalog if s['id'] == self.selected_server), {})
        label = role.get('name')
        if label and server.get('name'):
            label += ' · ' + server['name']
        self.credentials({'full_uid': info['full_uid'], 'invalidate': invalidate,
                          'consent_observation': info.get('_consent_observation'),
                          'credentials': copy.deepcopy(minimal), 'label': label,
                          'server_id': self.selected_server, 'avatar_id': self.selected_avatar})

    def restore(self, credentials, server_id='', avatar_id=''):
        user = credentials.get('mpay_user') if isinstance(credentials, dict) else None
        ext = user.get('pc_ext_info') if isinstance(user, dict) else None
        flag = ext.get('is_remember') if isinstance(ext, dict) else None
        if not (flag is True or isinstance(flag, str) and flag.lower() == 'true') or not all(
                isinstance(value, str) and value for value in (user.get('id'), user.get('token'),
                credentials.get('full_uid'), credentials.get('mpay_device_id'))):
            raise net.ProtocolError('已保存凭据没有记住登录授权，请重新扫码')
        if len(json.dumps(credentials).encode('utf-8')) > 48000:
            raise net.ProtocolError('已保存凭据格式无效，请重新扫码')
        self.clear_login()
        self.login_info = copy.deepcopy(credentials)
        self.selected_server = server_id if isinstance(server_id, str) and server_id.isdigit() else '10014'
        self.selected_avatar = avatar_id if isinstance(avatar_id, str) else ''
        self.update('account_login', '正在向网易验证已记住的账号')
        client = net.MpayClient(net.CONFIG['game_id'])
        try:
            self.login_info['mpay_user'] = client.resume(self.login_info)
        except net.MpayError as exc:
            if exc.http_status in (401, 403):
                self.save_credentials(invalidate=True)
            raise net.ProtocolError(str(exc)) from None
        finally:
            client.close()
        # Preserve a rotated token even if the subsequent game connection is
        # temporarily unavailable. MPay already authenticated this account.
        self.save_credentials()
        self.load_servers()
        self.authenticate()

    def drop_gate(self):
        gate, self.gate = self.gate, None
        self.gate_role = None
        if gate:
            gate.close()

    def clear_login(self):
        self.generation += 1
        self.drop_gate()
        if self.qr:
            self.qr.client.close()
        self.qr = self.gate = self.login_info = None
        self.authenticated = self.roles_loaded = False
        self.roles, self.selected_avatar = [], ''
        self.known_role_servers.clear()

    def start_qr(self):
        server = next((s for s in self.catalog if s['id'] == self.selected_server), None)
        if not server or not server['available']:
            raise net.ProtocolError('请先加载服务器列表，并选择有连接地址的服务器')
        self.clear_login()
        generation = self.generation
        qr = self.qr = net.MpayQR()
        self.update('qr_creating', '正在获取网易官方登录二维码')
        qr.create()
        self.update('qr_waiting', '请用阴阳师手游内的扫码登录扫描，并在手机确认')

        def poll():
            last = None
            while generation == self.generation:
                time.sleep(qr.interval)
                if generation != self.generation:
                    return
                if time.monotonic() - qr.created_at > 180:
                    self.update('qr_expired', '二维码已过期，请刷新')
                    return
                try:
                    state, info = qr.poll()
                    if state == 'confirmed':
                        # Keep this confirmation while a catalog/selection request
                        # finishes. Never poll/exchange the one-time token twice.
                        deadline = time.monotonic() + 30
                        while True:
                            with self.lock:
                                if generation != self.generation:
                                    return
                                if not self.busy:
                                    self.busy = True
                                    self.login_info = info
                                    break
                            if time.monotonic() >= deadline:
                                raise net.ProtocolError('服务器操作超时，请重新获取二维码')
                            time.sleep(.05)
                        try:
                            self.authenticate()
                        finally:
                            with self.lock:
                                self.busy = False
                            self.emit(self.status())
                        return
                    if generation != self.generation:
                        return
                    if state != last:
                        self.update('qr_scanned' if state == 'scanned' else 'qr_waiting',
                                    '已扫码，请在手机确认登录' if state == 'scanned' else '等待阴阳师手游扫码')
                        last = state
                except Exception as exc:
                    if generation == self.generation:
                        self.update('error', '扫码登录未完成，请刷新二维码', self.safe_error(exc))
                    return
        threading.Thread(target=poll, daemon=True).start()

    def open_gate(self, server_id):
        server = next((s for s in self.catalog if s['id'] == server_id), None)
        if not server or not self.server_available(server):
            raise net.ProtocolError('该服务器当前不可连接，或与扫码账号的渠道不兼容')
        last = None
        for address in server['addresses'][:2]:
            gate = None
            try:
                gate = net.Gate(address['host'], address['port'])
                self.gate = gate
                gate.handshake()
                result = gate.login_by_qr(self.login_info, server_id)
                if result.get('errorCode') != 0:
                    self.authenticated = False
                    code = result.get('errorCode')
                    # ClientAccount.on_login_result: 25 is a channel/server
                    # mismatch. Only code 5 with sauth 401 proves token expiry.
                    auth = result.get('sauth_result')
                    if code == 5 and isinstance(auth, dict) and str(auth.get('code')) == '401':
                        self.save_credentials(invalidate=True)
                    if code == 25:
                        raise net.ProtocolError('当前登录渠道不能进入所选服务器（代码 25）；已记住账号仍保留')
                    detail = str(code) if type(code) is int else '未知'
                    raise net.ProtocolError(f'账号登录未成功（代码 {detail}），请重新扫码')
                return gate
            except (OSError, net.ProtocolError) as exc:
                if gate:
                    gate.close()
                self.gate = None
                last = exc
                if not self.authenticated and self.stage != 'account_login':
                    break
        raise last or net.ProtocolError('无法连接所选服务器')

    def authenticate(self):
        self.update('account_login', '正在验证已授权账号并读取角色')
        try:
            # MPay already validated the QR. Discover its own roles before
            # connecting a preselected, potentially incompatible gateway.
            self.authenticated = True
            self.load_roles()
            compatible = [s['id'] for s in self.catalog if self.server_available(s)]
            if self.selected_server not in compatible:
                if not compatible:
                    self.authenticated = False
                    raise net.ProtocolError('没有与本次扫码渠道兼容且可连接的服务器，请刷新服务器列表')
                self.selected_server = compatible[0]
            gate = self.open_gate(self.selected_server)
            self.authenticated = True
            self.load_roles(gate)
            self.save_credentials()
        finally:
            if self.gate:
                self.gate.close()
                self.gate = None

    def load_roles(self, gate=None):
        if not self.authenticated or not self.login_info:
            raise net.ProtocolError('请先扫码登录账号')
        self.update('role_loading', '正在读取本次账号的已有角色')
        local = [{**r, 'server_id': gate.server_id} for r in net.account_avatars(gate.login_result)] if gate else []
        if gate:
            self.known_role_servers.add(gate.server_id)
        # This identity was constructed from the freshly exchanged MPay user.
        account = net.role_query_uid(self.login_info) if self.login_info.get('mpay_user', {}).get('id') else self.login_info.get('full_uid')
        try:
            roles = normalize_roles(net.query_own_roles(account))
        except Exception as exc:
            if local:
                self.roles = local
            self.roles_loaded = False
            self.choose_role()
            self.update('roles_partial',
                        '跨服角色读取失败，当前可用角色已保留；刷新角色后重试' if self.selected_avatar
                        else '角色读取失败，暂时无法查询；请刷新角色重试', self.safe_error(exc))
            return
        for role in local:
            matches = [r for r in roles if r['server_id'] == role['server_id'] and
                       (r['avatar_id'] in (role['avatar_id'], role['record_id']) or r['name'] == role['name'])]
            if len(matches) == 1:
                known_level = matches[0].get('level')
                matches[0].update(role)
                if role_level(role.get('level')) == math.inf:
                    matches[0]['level'] = known_level
            elif not matches:
                roles.append(role)
        self.roles, self.roles_loaded = sorted(roles, key=role_order), True
        known = {s['id'] for s in self.catalog}
        for role in roles:
            if role['server_id'] not in known:
                self.catalog.append({'id': role['server_id'], 'name': '服务器 ' + role['server_id'],
                                     'category': '分类待更新', 'available': False, 'addresses': []})
                known.add(role['server_id'])
        self.choose_role()
        self.report_roles()

    def available_roles(self):
        available = {s['id'] for s in self.catalog if self.server_available(s)}
        return sorted((r for r in self.roles if r['server_id'] in available), key=role_order)

    def report_roles(self):
        if self.selected_avatar:
            self.update('roles_ready', f'查询角色已就绪，共读取 {len(self.roles)} 个角色；可手动切换')
        elif not self.roles_loaded:
            self.update('roles_partial', '角色列表尚未完整取回，请刷新角色重试')
        elif self.roles:
            self.update('roles_unavailable', '已有角色所在服务器暂不可连接，请刷新服务器列表或稍后重试')
        else:
            self.update('roles_empty', '暂无可用角色。请先在阴阳师手游中创建角色，再点击「刷新角色」；需要已有角色才能使用阵容码查询。')

    def choose_role(self, server_id=None):
        candidates = [r for r in self.available_roles() if server_id is None or r['server_id'] == server_id]
        if candidates:
            role = next((r for r in candidates if r['server_id'] == self.selected_server
                         and r['avatar_id'] == self.selected_avatar), candidates[0])
            self.selected_server, self.selected_avatar = role['server_id'], role['avatar_id']
        else:
            self.selected_avatar = ''

    def role_gate(self):
        if not self.authenticated or not self.login_info:
            raise net.ProtocolError('请先扫码登录账号')
        sid, aid = self.selected_server, self.selected_avatar
        chosen = next((r for r in self.roles if r['server_id'] == sid and r['avatar_id'] == aid), None)
        if not chosen:
            raise net.ProtocolError('请先在阴阳师手游中创建角色，再刷新角色列表' if self.roles_loaded and not self.roles
                                    else '暂无可用查询角色，请刷新角色和服务器列表后重试')
        # Reuse the selected avatar during a batch. Retire idle sockets;
        # transport/protocol failures retire it; clean business errors do not.
        if self.gate_role != (sid, aid) or time.monotonic() - self.gate_used_at > 25:
            self.drop_gate()
        gate = self.gate
        if gate is None:
            self.update('account_login', '正在连接所选服务器')
            gate = self.open_gate(sid)
            actual = net.account_avatars(gate.login_result)
            matches = [r for r in actual if aid in (r['avatar_id'], r['record_id'])]
            if not matches:
                matches = [r for r in actual if r['name'] == chosen['name']]
            if len(matches) != 1:
                raise net.ProtocolError('该服务器未返回唯一匹配的已有角色，请刷新角色列表')
            self.update('role_login', '正在建立所选角色的查询会话')
            gate.select_role(matches[0]['avatar_id'])
            self.gate_role = (sid, aid)
        gate.deadline = time.monotonic() + 25
        if not gate.assistant_ready:
            self.update('assistant_initializing', '正在初始化所选角色的阵容助手')
        gate.ensure_lineup_assistant()
        gate.deadline = time.monotonic() + 25
        return gate

    def query(self, code):
        if not isinstance(code, str) or not re.fullmatch(r'\|TA\|[^\s|\x00-\x1f\x7f\u200b-\u200d\u2060\ufeff]{1,4096}', code):
            raise net.ProtocolError('请输入一条完整的 |TA| 文字码')
        try:
            gate = self.role_gate()
            self.update('lineup_loading', '正在查询 TA 阵容')
            response = gate.query_lineup(code[4:])
            if not isinstance(response, dict) or response.get('share_key') != code[4:]:
                raise net.ProtocolError('阵容响应与本次文字码不一致')
            if type(response.get('err')) is not int:
                raise net.ProtocolError('阵容响应错误码类型无效')
            if response['err'] != 0:
                self.update('lineup_unavailable', f"服务器返回阵容查询代码 {response['err']}")
                self.gate_used_at = time.monotonic()
                # Forward only the typed code and request association, never
                # arbitrary server bodies. The desktop queue handles retries.
                return {'err': response['err'], 'share_key': code[4:], 'code': code}
            payload = response.get('lineup_data')
            if not isinstance(payload, str) or len(payload) > 32 * 1024 * 1024:
                raise net.ProtocolError('阵容响应缺少有效内容')
            self.update('lineup_ready', '已收到本次文字码的官方阵容内容')
            self.gate_used_at = time.monotonic()
            return {'err': 0, 'share_key': code[4:], 'lineup_data': payload, 'code': code}
        except Exception:
            self.drop_gate()
            raise

    def share(self, code):
        if not isinstance(code, str) or not code.startswith('#TA#') or len(code) > 131072:
            raise net.ProtocolError('请先在制作器中生成有效游戏码')
        payload = code[4:]
        try:
            base64.b64decode(payload, validate=True)
        except ValueError:
            raise net.ProtocolError('游戏码的编码格式无效') from None
        try:
            gate = self.role_gate()
            self.update('lineup_loading', '正在向官方生成阵容短码')
            response = gate.share_lineup(payload)
            if not isinstance(response, dict) or type(response.get('err')) is not int:
                raise net.ProtocolError('官方分享响应格式不受支持')
            if response['err'] != 0:
                raise net.ProtocolError(f"官方未生成阵容短码（代码 {response['err']}）")
            key, data = response.get('share_key'), response.get('lineup_data')
            if not isinstance(key, str) or not re.fullmatch(r'[^\s|\x00-\x1f\x7f\u200b-\u200d\u2060\ufeff]{1,4096}', key) or not isinstance(data, str) or len(data) > 32 * 1024 * 1024:
                raise net.ProtocolError('官方分享响应缺少有效短码或阵容内容')
            self.gate_used_at = time.monotonic()
            self.update('lineup_ready', '已收到官方阵容短码')
            return {'err': 0, 'share_key': key, 'code': '|TA|' + key, 'lineup_data': data}
        except Exception:
            self.drop_gate()
            raise
