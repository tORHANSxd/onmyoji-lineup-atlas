"""Small independent client for the APK's official QR and gateway protocols.

Account authorization comes from official QR confirmation and consented renewal.
No official-client credential extraction or gameplay automation is used.
"""
from __future__ import annotations

import base64
import hashlib
import json
import secrets
import socket
import struct
import time
import urllib.error
import urllib.parse
import urllib.request
import zlib
from pathlib import Path

import msgpack
from Crypto.Cipher import ARC4, PKCS1_OAEP
from Crypto.PublicKey import RSA
from google.protobuf import descriptor_pool, message_factory

from onmyoji_mpay import MpayClient, MpayError

ROOT = Path(__file__).resolve().parent
CONFIG = json.loads((ROOT / 'login_protocol.json').read_text(encoding='utf-8'))
SERVER_LIST_URL = 'https://g37.update.netease.com/mini_server_list_cn.txt'
MPAY_BASE = 'https://service.mkey.163.com/mpay'
ROLE_QUERY_URL = 'https://g37dc.webapp.163.com/query_role'
CATEGORIES = {4: '全平台', 1: '中国区-iOS', 2: '网易-双平台', 3: '中国区-安卓',
              5: '国际区', 7: '抢先体验'}
MAX_RESPONSE = 16 * 1024 * 1024


class ProtocolError(RuntimeError):
    pass


def game_platform(login_info: dict) -> str:
    """Keep the QR account's game platform when MPay renews it as PC type 5."""
    user = login_info.get('mpay_user') or {}
    channel = user.get('login_channel', login_info.get('login_channel', 'netease'))
    full_uid = login_info.get('full_uid')
    if full_uid:
        for platform_name in ('ios', 'ad'):
            if full_uid == f'{user.get("id")}@{platform_name}.{channel}.win.163.com':
                return platform_name
        raise ProtocolError('已保存账号的游戏平台不匹配，请重新扫码')
    ext = user.get('pc_ext_info') or {}
    src_type = ext.get('src_client_type', login_info.get('src_client_type')) if isinstance(ext, dict) else None
    if src_type in (2, '2'):
        return 'ios'
    if src_type in (1, '1'):
        return 'ad'
    raise ProtocolError('无法确认扫码账号的游戏平台，请使用手游扫码登录')


def http_get(url: str, *, raw=False, timeout=20):
    request = urllib.request.Request(url, headers={'User-Agent': 'OnmyojiLocalQuery/0.1'})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            data = response.read(MAX_RESPONSE + 1)
    except urllib.error.HTTPError as exc:
        # Deliberately omit URLs/query strings and raw response bodies from errors.
        raise ProtocolError(f'官方 HTTP 接口返回 {exc.code}') from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise ProtocolError('连接官方接口失败，请检查网络后重试') from None
    if len(data) > MAX_RESPONSE:
        raise ProtocolError('官方响应超出大小限制')
    if raw:
        return data
    try:
        return json.loads(data)
    except (ValueError, UnicodeError):
        raise ProtocolError('官方接口返回了非 JSON 数据') from None


def server_catalog(live_text: str | None = None) -> list[dict]:
    """Merge every bundled definition and every address from the current list."""
    if live_text is None:
        live_text = http_get(SERVER_LIST_URL, raw=True).decode('utf-8')
    records = {}
    for line in live_text.splitlines():
        if not line.strip() or line.startswith('#'):
            continue
        fields = line.split()
        if len(fields) < 6:
            continue
        sid = fields[4]
        if not sid.isdigit():
            continue
        record = records.setdefault(sid, {'internal_name': fields[3], 'addresses': [], 'live_state': fields[1]})
        for target in fields[5:]:
            parts = target.split(':')
            try:
                host, port = parts[0], int(parts[1])
            except (IndexError, ValueError):
                continue
            if not 1 <= port <= 65535:
                continue
            # The published first port is a concrete endpoint; retain alternates.
            addr = {'host': host, 'port': port}
            if addr not in record['addresses']:
                record['addresses'].append(addr)
    definitions = json.loads((ROOT / 'server_catalog.json').read_text(encoding='utf-8'))
    result = []
    for info in definitions:
        sid = str(info['ServerID'])
        live = records.pop(sid, {})
        source_type = info.get('serverType')
        category = 4 if source_type == 6 else source_type
        if info.get('is_gray') == 1:
            category = 7
        result.append({'id': sid, 'name': info.get('showName') or info.get('ServerName') or sid,
                       'internal_name': info.get('ServerName'), 'category_id': category,
                       'category': CATEGORIES.get(category, '其他'), 'source_type': source_type,
                       'addresses': live.get('addresses', []), 'available': bool(live.get('addresses')),
                       'open_date': info.get('open_date'), 'definition_state': info.get('state'),
                       'live_state': live.get('live_state'), 'roles': []})
    # Do not silently lose newly-added servers absent from this APK snapshot.
    for sid, live in records.items():
        result.append({'id': sid, 'name': live['internal_name'], 'internal_name': live['internal_name'],
                       'category_id': 0, 'category': '新服务器（分类待更新）', 'source_type': None,
                       'available': bool(live['addresses']), **live, 'roles': []})
    order = {k: i for i, k in enumerate(CATEGORIES)}
    return sorted(result, key=lambda r: (order.get(r['category_id'], 99), -int(r['id'])))


class MpayQR:
    def __init__(self):
        self.uuid = ''
        self.interval = 1.0
        self.image = b''
        self.created_at = 0.0
        self.client = MpayClient(CONFIG['game_id'])

    def _get(self, path, params=None, *, raw=False):
        # Official PC MPay's common parameter builder uses the c-prefixed SDK
        # version (mpay.dll 4.19.1.489), not the legacy p2.0.0 QR channel.
        query = {'game_id': CONFIG['game_id'], 'cv': 'c4.19.1'}
        if params:
            query.update(params)
        return http_get(MPAY_BASE + path + '?' + urllib.parse.urlencode(query), raw=raw)

    def create(self):
        try:
            self.client.register()
        except MpayError as exc:
            raise ProtocolError(str(exc)) from None
        # This game rejects Android type 4 (MPay 1344). Its official desktop
        # QR type 2 is available; exchange still uses the registered device key.
        reply = self._get('/api/qrcode/create_login', {
            # PC MPay 4.19.1.489 uses request mode 2; consent still comes from
            # the exchange response's boolean pc_ext_info.is_remember.
            'qrcode_channel_type': '2', 'is_remember': '2', 'device_id': self.client.device_id})
        if not isinstance(reply, dict) or not reply.get('uuid'):
            raise ProtocolError('官方接口未返回有效二维码')
        self.uuid = str(reply['uuid'])
        self.interval = max(1.0, min(10.0, float(reply.get('query_interval', 1))))
        self.image = self._get('/api/qrcode/image', {'uuid': self.uuid}, raw=True)
        if not self.image.startswith((b'\x89PNG\r\n\x1a\n', b'\xff\xd8\xff', b'GIF8')):
            raise ProtocolError('官方接口未返回可识别的二维码图片')
        self.created_at = time.monotonic()
        return {'game_name': reply.get('qrcode_game_name', '阴阳师'), 'interval': self.interval}

    def poll(self):
        if not self.uuid:
            raise ProtocolError('请先创建二维码')
        reply = self._get('/api/qrcode/query', {'uuid': self.uuid})
        if not isinstance(reply, dict):
            raise ProtocolError('扫码响应格式不受支持')
        if isinstance(reply.get('qrcode'), dict):
            status = reply['qrcode'].get('status')
            if status == 2:
                info = reply.get('login_info')
                if not isinstance(info, dict) or not info.get('code'):
                    raise ProtocolError('扫码已确认，但接口未返回登录凭据')
                try:
                    user = self.client.exchange(info['code'])
                except MpayError as exc:
                    raise ProtocolError(str(exc)) from None
                print('[protocol] MPay account token exchange succeeded', flush=True)
                ext = user.get('pc_ext_info') or {}
                platform_name = game_platform({**info, 'mpay_user': user})
                channel = user.get('login_channel', info.get('login_channel', 'netease'))
                # Narrow consent diagnostics: schema names and boolean choices,
                # never QR codes, tokens, account/device IDs, or signed data.
                consent = {'query_fields': sorted(reply), 'login_fields': sorted(info),
                           'user_fields': sorted(user), 'remember_flags': {}}
                for prefix, record in [('query', reply), ('qrcode', reply.get('qrcode')), ('login_info', info), ('user', user), ('pc_ext_info', ext)]:
                    if isinstance(record, dict):
                        for key, value in record.items():
                            if 'remember' in key.lower():
                                consent['remember_flags'][prefix + '.' + key] = value if value in (True, False, 0, 1, 'true', 'false', '0', '1') else type(value).__name__
                return 'confirmed', {**info, 'mpay_user': user, 'user_id': user['id'],
                                     'token': user['token'],
                                     'full_uid': f'{user["id"]}@{platform_name}.{channel}.win.163.com',
                                     'mpay_device_id': self.client.device_id, '_consent_observation': consent}
            if status == 1:
                return 'scanned', None
            if status == 0:
                return 'waiting', None
        # Error bodies can contain authorization material; expose only a code.
        code = reply.get('code')
        raise ProtocolError(f'二维码已失效或被拒绝，请刷新（接口代码：{str(code)[:20]}）')


def unpack_rpc(data):
    if not data:
        return {}
    return msgpack.unpackb(data, raw=False, strict_map_key=False,
                           max_str_len=MAX_RESPONSE, max_bin_len=MAX_RESPONSE,
                           max_array_len=1_000_000, max_map_len=1_000_000)


def role_id(value):
    if isinstance(value, msgpack.ExtType) and value.code == 42 and len(value.data) == 12:
        return value.data.hex()
    if isinstance(value, bytes) and len(value) == 12:
        return value.hex()
    return str(value) if isinstance(value, (str, int)) and not isinstance(value, bool) else ''


def account_avatars(result):
    """Only named, active roles returned by this server's successful login."""
    if not isinstance(result, dict) or result.get('errorCode') != 0:
        return []
    avatars = result.get('avatar_list')
    if not isinstance(avatars, dict):
        return []
    rows = []
    for key, value in avatars.items():
        if not isinstance(value, dict) or not value.get('name') or value.get('deactive'):
            continue
        aid = role_id(value.get('avatarId'))
        if aid:
            rows.append({'avatar_id': aid, 'record_id': role_id(key),
                         'name': str(value['name']), 'level': value.get('level')})
    return rows


class Gate:
    """One selected avatar connection, reused for consecutive read-only queries."""
    def __init__(self, host, port, timeout=15):
        self.pool = descriptor_pool.DescriptorPool()
        for key in ('22567', '22590'):
            self.pool.AddSerializedFile(base64.b64decode(CONFIG['protobuf'][key]))
        self.sock = socket.create_connection((host, int(port)), timeout=timeout)
        self.sock.settimeout(timeout)
        self.deadline = time.monotonic() + 65
        self.enc = self.dec = None
        self.comp = self.decomp = None
        self.buf = bytearray()
        self.account_id = b''
        self.avatar_id = b''
        self.selected_role = ''
        self.login_result = None
        self.server_id = ''
        self.device_id = secrets.token_hex(16)
        names = set(CONFIG['rpc_names']) | set(CONFIG['static_rpc_names'].values()) | {'become_player'}
        self.md5_names = {hashlib.md5(n.encode('ascii')).digest(): n for n in names}
        self.index_names = {int(k): v for k, v in CONFIG['static_rpc_names'].items()}

    def close(self):
        try:
            self.sock.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        self.sock.close()
        self.buf.clear()
        self.enc = self.dec = None
        self.account_id = self.avatar_id = b''
        self.login_result = None

    def message(self, name, **kwargs):
        descriptor = self.pool.FindMessageTypeByName('mobile.server.' + name)
        return message_factory.GetMessageClass(descriptor)(**kwargs)

    def send(self, index, message):
        payload = message.SerializeToString()
        frame = struct.pack('<IH', len(payload) + 2, index) + payload
        if self.comp:
            frame = self.comp.compress(frame) + self.comp.flush(zlib.Z_SYNC_FLUSH)
        if self.enc:
            frame = self.enc.encrypt(frame)
        self.sock.sendall(frame)

    def receive(self):
        while True:
            remaining = self.deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError('官方连接超过本次等待时限')
            self.sock.settimeout(max(0.1, min(10, remaining)))
            if len(self.buf) >= 4:
                length = struct.unpack_from('<I', self.buf)[0]
                if not 2 <= length <= MAX_RESPONSE:
                    raise ProtocolError('游戏网关帧格式不匹配')
                if len(self.buf) >= length + 4:
                    frame = bytes(self.buf[4:length + 4])
                    del self.buf[:length + 4]
                    index = struct.unpack_from('<H', frame)[0]
                    methods = self.pool.FindServiceByName('mobile.server.IGateClient').methods
                    if index >= len(methods):
                        raise ProtocolError('游戏网关方法索引不匹配')
                    method = methods[index]
                    msg = message_factory.GetMessageClass(method.input_type).FromString(frame[2:])
                    return method.name, msg
            data = self.sock.recv(65536)
            if not data:
                raise ProtocolError('游戏网关已断开连接')
            if self.dec:
                data = self.dec.decrypt(data)
            if self.decomp:
                data = self.decomp.decompress(data, MAX_RESPONSE + 1)
                if len(data) > MAX_RESPONSE or self.decomp.unconsumed_tail:
                    raise ProtocolError('游戏网关解压数据过大')
            self.buf.extend(data)
            if len(self.buf) > MAX_RESPONSE + 4:
                raise ProtocolError('游戏网关接收缓冲过大')

    def handshake(self):
        self.send(0, self.message('Void'))
        name, reply = self.receive()
        if name != 'seed_reply':
            raise ProtocolError('未收到网关握手种子')
        key = hashlib.sha1(secrets.token_bytes(32)).digest()
        session = self.message('SessionKey', random_padding_header=secrets.token_bytes(24),
                               session_key=key, seed=reply.seed, random_padding_tail=secrets.token_bytes(24))
        encrypted = PKCS1_OAEP.new(RSA.import_key(CONFIG['login_public_key'])).encrypt(session.SerializeToString())
        self.send(1, self.message('EncryptString', encryptstr=encrypted))
        self.enc, self.dec = ARC4.new(key), ARC4.new(key)
        name, reply = self.receive()
        if name != 'session_key_ok':
            raise ProtocolError('网关未确认加密握手')
        self.send(2, self.message('ConnectServerRequest', type=0, deviceid=self.device_id.encode('ascii')))
        self.comp, self.decomp = zlib.compressobj(), zlib.decompressobj()
        for _ in range(8):
            name, reply = self.receive()
            if name == 'create_entity':
                self.account_id = bytes(reply.id)
                return unpack_rpc(reply.info)
            if name == 'connect_reply' and reply.type != 1:
                raise ProtocolError(f'服务器暂不接受连接（代码 {reply.type}）')
        raise ProtocolError('未收到账号连接对象')

    def rpc(self, method, parameters, *, entity_id=None):
        allowed = {'login_with_sdk', 'select_role',
                   'lineup_assisant_logic.get_share_lineup_data'}
        if method not in allowed:
            raise ProtocolError('此工具未实现该操作')
        msg = self.message('EntityMessage', id=entity_id or self.account_id,
                           parameters=msgpack.packb(parameters, use_bin_type=True))
        msg.method.md5 = hashlib.md5(method.encode('ascii')).digest()
        self.send(3, msg)

    def next_event(self):
        name, reply = self.receive()
        if name == 'reg_md5_index':
            # This mapping is for our outgoing encoder, not incoming callbacks.
            # We keep sending MD5 names, so no local mapping update is needed.
            return 'rpc_index', {}
        if name == 'entity_message':
            method = self.index_names.get(reply.method.index) if reply.method.HasField('index') else None
            method = method or self.md5_names.get(bytes(reply.method.md5))
            # Only decode expected callbacks; discard unrelated account content.
            expected = self.account_id if method == 'on_login_result' else self.avatar_id
            if method in ('on_login_result', 'lineup_assisant_logic_get_share_lineup_data_cb') and bytes(reply.id) == expected:
                return method, unpack_rpc(reply.parameters)
            if method == 'on_lose_server':
                return method, {'entity_id': bytes(reply.id)}
            if not method:
                tag = ('index_' + str(reply.method.index)) if reply.method.index > 0 else ('md5_' + bytes(reply.method.md5).hex())
                recipient = 'account' if bytes(reply.id) == self.account_id else 'other'
                print(f'[protocol] unknown callback {tag}, recipient={recipient}, bytes={len(reply.parameters)}', flush=True)
                return 'unknown_rpc_' + tag, {}
            return method, {}
        if name == 'create_entity':
            kind = self.md5_names.get(bytes(reply.type.md5), '')
            return 'create_entity', {'entity_id': bytes(reply.id), 'entity_type': kind}
        if name == 'destroy_entity':
            # Account and avatar entities have separate lifetimes. The server
            # can destroy the account entity after creating the selected avatar.
            return name, {'entity_id': bytes(reply.id)}
        return name, {}

    def wait_events(self, seconds=35):
        deadline = min(self.deadline, time.monotonic() + seconds)
        old_timeout = self.sock.gettimeout()
        try:
            while time.monotonic() < deadline:
                self.sock.settimeout(max(0.1, min(10, deadline - time.monotonic())))
                try:
                    yield self.next_event()
                except socket.timeout:
                    continue
        finally:
            self.sock.settimeout(old_timeout)

    def login_by_qr(self, login_info: dict, server_id: str):
        user = login_info.get('mpay_user')
        if not isinstance(user, dict) or not user.get('id') or not user.get('token'):
            raise ProtocolError('请刷新二维码，使用新的 SDK 扫码授权流程')
        ext = user.get('pc_ext_info') or {}
        if not isinstance(ext, dict):
            raise ProtocolError('MPay 扫码附加信息格式不受支持')
        platform_name = game_platform(login_info)
        channel = user.get('login_channel', login_info.get('login_channel', 'netease'))
        if channel != 'netease':
            raise ProtocolError('此联调客户端目前仅接入网易账号的 SDK 授权')
        # ClientAccount.loginWithSdk selects the game's platform independently
        # of the PC SDK, and sets APP_CHANNEL/PAY_CHANNEL to app_store for iOS.
        app_channel = 'app_store' if platform_name == 'ios' else (ext.get('src_app_channel2') or ext.get('src_app_channel') or 'netease')
        pay_channel = 'app_store' if platform_name == 'ios' else (ext.get('src_pay_channel') or 'netease')
        sdk_version = ext.get('src_sdk_version') or '5.18.0'
        udid = ext.get('src_udid') or self.device_id
        device_id = login_info.get('mpay_device_id')
        if not isinstance(device_id, str) or not device_id:
            raise ProtocolError('缺少本次 SDK 设备登记信息')
        sauth = {}
        extra = ext.get('extra_unisdk_data')
        if isinstance(extra, str) and extra:
            try:
                encoded = json.loads(extra).get('SAUTH_JSON', '')
                if encoded:
                    sauth = json.loads(base64.b64decode(urllib.parse.unquote_plus(encoded)))
            except (ValueError, TypeError, AttributeError):
                raise ProtocolError('扫码携带的 UniSDK 授权格式不受支持') from None
        if not isinstance(sauth, dict):
            raise ProtocolError('扫码携带的 UniSDK 授权类型不受支持')
        # LoginManager keeps additional signed fields but supplies this new
        # client's account ID and freshly exchanged token itself. Do not invent
        # real-name, age, verification, or server-signature fields.
        reserved = {'gameid', 'login_channel', 'app_channel', 'platform', 'sdkuid',
                    'udid', 'sessionid', 'sdk_version', 'is_unisdk_guest', 'ip',
                    'aim_info', 'source_app_channel', 'source_platform', 'client_login_sn'}
        sauth = {k: v for k, v in sauth.items() if k not in reserved}
        sauth.update({'gameid': 'g37', 'login_channel': channel, 'app_channel': app_channel,
                      'platform': platform_name, 'sdkuid': user['id'], 'udid': udid,
                      'sessionid': user['token'], 'sdk_version': sdk_version,
                      'deviceid': device_id})
        fields = ('uid', 'full_uid', 'session', 'cpid', 'appid', 'channel_gameid',
                  'timestamp', 'sauth_str', 'auth_type', 'old_accountid', 'engine_version',
                  'device_name', 'device_model', 'device', 'real_ip', 'ip_country')
        info = dict.fromkeys(fields, '')
        info.update({'uid': user['id'], 'full_uid': f'{user["id"]}@{platform_name}.netease.win.163.com',
                     'session': user['token'], 'udid': udid, 'first_udid': udid,
                     'device_id': device_id, 'sdk_version': sdk_version, 'version': sdk_version,
                     'sdk_init': 1, 'platform': platform_name, 'app_channel': app_channel,
                     'pay_channel': pay_channel,
                     'login_channel': channel, 'app_version': CONFIG['app_version'],
                     'appid': CONFIG['game_id'], 'cpid': 'g37', 'channel_gameid': 'g37',
                     'auth_type': 'netease', 'sauth_str': '&'.join(f'{k}={v}' for k, v in sauth.items()),
                     'patch_version': CONFIG['patch_version'],
                     'res_version': CONFIG['patch_version'], 'script_version': CONFIG['patch_version'],
                     'serverid': str(server_id), 'client_cloud': False, 'is_simulator': False,
                     'root_tag': 0, 'sys_version': 'Windows',
                     'open_info': '', 'developer_name': '', 'is_change': 0,
                     # UserInfoMgr.getExtraInfo:644 uses this fixed fallback
                     # when the desktop client has no push-token provider.
                     'NgPush': 'aad55fa6cd692593d4b92820d0e27f6cca62a273caefc810cfae3c5d8e8a2129',
                     'network': {'use_ipv6': False, 'use_3xian': False, 'ip_errcode': 0,
                                 'reconn_count': 0, 'platform': 'win32', 'py': 3, 'network': 'wifi'}})
        info['versions'] = '0#0#0'
        if ext.get('src_client_type') in (5, '5'):
            info['is_login_in_pc'] = True
            info['pc_app_channel'] = ext.get('src_app_channel') or 'netease'
        info['new_engine_info'] = {'package_ver': CONFIG['app_version'], 'ver': CONFIG['patch_version']}
        self.rpc('login_with_sdk', {'account_info': info})
        seen = []
        for name, data in self.wait_events(seconds=120):
            if name not in seen:
                seen.append(name)
            if name == 'on_login_result':
                if not isinstance(data, dict):
                    raise ProtocolError('账号登录回调格式不受支持')
                # The wire decorator uses the compact field `ec`; the Python
                # callback's first argument is named errorCode.
                if 'errorCode' not in data and 'ec' in data:
                    data['errorCode'] = data['ec']
                if type(data.get('errorCode')) is int:
                    print(f'[protocol] account login result code={data["errorCode"]}', flush=True)
                self.login_result = data
                self.server_id = str(server_id)
                return data
        raise ProtocolError('未收到账号登录结果；已收到事件：' + ', '.join(seen[:8]))

    def select_role(self, avatar_id):
        aid = role_id(avatar_id)
        if aid not in {r['avatar_id'] for r in account_avatars(self.login_result)}:
            raise ProtocolError('所选角色不在当前服务器的账号登录返回中')
        if self.avatar_id and self.selected_role == aid:
            return
        if self.avatar_id:
            raise ProtocolError('切换角色需要重新连接并扫码登录')
        # ClientEntities.py:385 stores the static-map digest INSIDE the cache map.
        self.rpc('select_role', {'id': 10, 'avatar_id': aid,
                                'client_cache_data_md5': {'rpc_static_index_map_md5': CONFIG['static_rpc_md5']}})
        seen = []
        for name, data in self.wait_events(45):
            if name not in seen:
                seen.append(name)
            if name == 'create_entity' and data.get('entity_type') == 'ClientAvatar':
                entity = data.get('entity_id')
                if not isinstance(entity, bytes) or len(entity) != 12 or entity == self.account_id:
                    raise ProtocolError('角色连接对象格式不匹配')
                self.avatar_id, self.selected_role = entity, aid
                return
            if name == 'notify_error_cb' or (name == 'on_lose_server' and data.get('entity_id') == self.account_id):
                raise ProtocolError('服务器未建立角色会话，请重新扫码或检查角色状态')
        raise ProtocolError('未收到角色连接对象；已收到事件：' + ', '.join(seen[:8]))

    def query_lineup(self, share_key):
        if not self.avatar_id:
            raise ProtocolError('请先建立所选角色的会话')
        if not isinstance(share_key, str) or not 1 <= len(share_key) <= 4096 or any(c.isspace() or c == '|' or ord(c) < 32 or ord(c) == 127 or c in '\u200b\u200c\u200d\u2060\ufeff' for c in share_key):
            raise ProtocolError('TA 阵容码格式不合法')
        self.rpc('lineup_assisant_logic.get_share_lineup_data',
                 {'share_key': share_key}, entity_id=self.avatar_id)
        for name, data in self.wait_events(20):
            if name == 'lineup_assisant_logic_get_share_lineup_data_cb':
                if not isinstance(data, dict):
                    raise ProtocolError('阵容查询回调格式不匹配')
                if data.get('share_key') != share_key:
                    continue
                return data
            if name in ('on_lose_server', 'destroy_entity') and data.get('entity_id') == self.avatar_id:
                raise ProtocolError('角色连接已结束，请重新扫码登录')
        raise ProtocolError('阵容查询超时（20秒内未收到对应回包）；已跳过，可稍后重试')


def query_own_roles(account: str):
    """Invoke the same account role-list request as ServerManager.py:1128.

    Caller supplies the current authenticated account, never an arbitrary ID.
    """
    if not account or '@' not in account:
        raise ProtocolError('登录结果尚未提供角色查询所需的账号标识')
    stamp = str(time.time())
    sign = hashlib.sha1((account + stamp + CONFIG['role_query_client_key']).encode('utf-8')).hexdigest()
    query = urllib.parse.urlencode({'account': account, 'timestr': stamp, 'sign': sign})
    reply = http_get(ROLE_QUERY_URL + '?' + query)
    if not isinstance(reply, dict) or not reply.get('success') or not isinstance(reply.get('data'), list):
        raise ProtocolError('官方角色列表接口未返回成功结果')
    return reply['data']
