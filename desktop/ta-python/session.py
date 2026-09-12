"""Memory-only session for the desktop application; no local HTTP server."""
from __future__ import annotations

import base64
import re
import threading
import time

import onmyoji_network as net


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
                          'level': row.get('level', row.get('player_level'))})
    return roles


class Session:
    def __init__(self, emit=lambda state: None):
        self.emit = emit
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
        self.generation = 0
        self.busy = False
        self.stage, self.message, self.error = 'idle', '点击加载服务器后扫码登录', ''

    def status(self):
        with self.lock:
            servers = []
            for row in self.catalog:
                servers.append({**{k: row.get(k) for k in ('id', 'name', 'category', 'available')},
                                'roles': [r for r in self.roles if r['server_id'] == row['id']],
                                'roles_known': self.roles_loaded or row['id'] in self.known_role_servers})
            image = self.qr.image if self.qr and self.stage in ('qr_waiting', 'qr_scanned') else b''
            return {'stage': self.stage, 'message': self.message, 'error': self.error,
                    'busy': self.busy, 'authenticated': self.authenticated,
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
                   'select': self.select, 'roles': self.load_roles, 'query': self.query}
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
                self.update('error', '操作未完成', error)
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
        self.update('ready', '服务器列表已加载，可以扫码登录')

    def select(self, server_id, avatar_id=''):
        if not isinstance(server_id, str) or not any(s['id'] == server_id for s in self.catalog):
            raise net.ProtocolError('服务器不在当前列表中')
        if not isinstance(avatar_id, str) or (avatar_id and not any(
                r['server_id'] == server_id and r['avatar_id'] == avatar_id for r in self.roles)):
            raise net.ProtocolError('只能选择本次账号返回的已有角色')
        self.selected_server, self.selected_avatar = server_id, avatar_id

    def clear_login(self):
        self.generation += 1
        if self.gate:
            self.gate.close()
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
                    with self.lock:
                        if generation != self.generation:
                            qr.client.close()
                            return
                        if state == 'confirmed':
                            # Selection requests are short; wait for their final state.
                            if self.busy:
                                raise net.ProtocolError('扫码确认时有操作进行中，请刷新二维码')
                            self.busy = True
                            self.login_info = info
                    if state == 'confirmed':
                        try:
                            self.authenticate()
                        finally:
                            with self.lock:
                                self.busy = False
                            self.emit(self.status())
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
        if not server or not server['available']:
            raise net.ProtocolError('该服务器当前没有公开连接地址')
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
        self.update('account_login', '手机已确认，正在验证账号并读取角色')
        try:
            gate = self.open_gate(self.selected_server)
            self.authenticated = True
            self.load_roles(gate)
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
        account = self.login_info.get('full_uid')
        try:
            roles = normalize_roles(net.query_own_roles(account))
        except Exception as exc:
            if local:
                self.roles = local
            self.roles_loaded = False
            self.choose_role()
            self.update('roles_partial', '已保留当前服角色；跨服角色列表暂未取回', self.safe_error(exc))
            return
        for role in local:
            matches = [r for r in roles if r['server_id'] == role['server_id'] and
                       (r['avatar_id'] in (role['avatar_id'], role['record_id']) or r['name'] == role['name'])]
            if len(matches) == 1:
                matches[0].update(role)
            elif not matches:
                roles.append(role)
        self.roles, self.roles_loaded = roles, True
        known = {s['id'] for s in self.catalog}
        for role in roles:
            if role['server_id'] not in known:
                self.catalog.append({'id': role['server_id'], 'name': '服务器 ' + role['server_id'],
                                     'category': '分类待更新', 'available': False, 'addresses': []})
                known.add(role['server_id'])
        self.choose_role()
        self.update('roles_ready', f'登录成功，已读取 {len(roles)} 个角色')

    def choose_role(self):
        candidates = [r for r in self.roles if r['server_id'] == self.selected_server] or self.roles
        if candidates:
            role = next((r for r in candidates if r['avatar_id'] == self.selected_avatar), candidates[0])
            self.selected_server, self.selected_avatar = role['server_id'], role['avatar_id']

    def query(self, code):
        if not isinstance(code, str) or not re.fullmatch(r'\|TA\|[0-9a-fA-F]{32}', code):
            raise net.ProtocolError('请输入完整的 |TA| 文字码（后接32位分享键）')
        if not self.authenticated or not self.login_info:
            raise net.ProtocolError('请先扫码登录账号')
        sid, aid = self.selected_server, self.selected_avatar
        chosen = next((r for r in self.roles if r['server_id'] == sid and r['avatar_id'] == aid), None)
        if not chosen:
            raise net.ProtocolError('请先选择本次账号已有的角色')
        self.update('account_login', '正在连接所选服务器')
        try:
            # Reconnect with the in-memory token: no stale idle avatar socket.
            gate = self.open_gate(sid)
            actual = net.account_avatars(gate.login_result)
            matches = [r for r in actual if aid in (r['avatar_id'], r['record_id'])]
            if not matches:
                matches = [r for r in actual if r['name'] == chosen['name']]
            if len(matches) != 1:
                raise net.ProtocolError('该服务器未返回唯一匹配的已有角色，请刷新角色列表')
            self.update('role_login', '正在建立所选角色的查询会话')
            gate.select_role(matches[0]['avatar_id'])
            self.update('lineup_loading', '正在查询 TA 阵容')
            response = gate.query_lineup(code[4:])
            if not isinstance(response, dict) or response.get('share_key') != code[4:]:
                raise net.ProtocolError('阵容响应与本次文字码不一致')
            if type(response.get('err')) is not int or response['err'] != 0:
                err = response.get('err')
                detail = str(err) if type(err) is int else '未知'
                raise net.ProtocolError(f'服务器未返回该阵容（代码 {detail}）；分享可能已失效')
            payload = response.get('lineup_data')
            if not isinstance(payload, str) or len(payload) > 32 * 1024 * 1024:
                raise net.ProtocolError('阵容响应缺少有效内容')
            self.update('lineup_ready', '已收到本次文字码的官方阵容内容')
            return {'err': 0, 'share_key': code[4:], 'lineup_data': payload, 'code': code}
        finally:
            if self.gate:
                self.gate.close()
                self.gate = None
