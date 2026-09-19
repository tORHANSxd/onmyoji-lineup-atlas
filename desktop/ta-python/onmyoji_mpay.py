"""MPay device registration and QR exchange from the supplied Android SDK.

Only a code returned by an official QR confirmation may be exchanged. Device
keys and account tokens remain in memory; this module never writes them to disk.
"""
from __future__ import annotations

import json
import time
import uuid
import urllib.error
import urllib.parse
import urllib.request

from Crypto.Cipher import AES
from Crypto.Util.Padding import pad


class MpayError(RuntimeError):
    def __init__(self, message, http_status=None):
        super().__init__(message)
        self.http_status = http_status


class MpayClient:
    BASE = 'https://service.mkey.163.com/mpay'

    def __init__(self, game_id):
        self.game_id = game_id
        self.device_id = ''
        self.device_key = b''
        self.user = None

    def _post(self, path, parameters):
        return self._request(path, parameters, 'POST')

    def _request(self, path, parameters, method):
        params = {'game_id': self.game_id, 'gv': '260902', 'gvn': '2.8.84',
                  'cv': 'a5.18.0', 'sv': '32', 'app_type': 'games', 'app_mode': '2',
                  'jf_game_id': 'g37', 'pkg_channel': 'netease', 'app_channel': 'netease',
                  'sc': '0'}
        params.update(parameters)
        encoded = urllib.parse.urlencode(params)
        request = urllib.request.Request(
            self.BASE + path + ('?' + encoded if method == 'GET' else ''),
            data=encoded.encode('ascii') if method == 'POST' else None, method=method,
            headers={'Content-Type': 'application/x-www-form-urlencoded',
                     'User-Agent': 'NeteaseMobileGame/a5.18.0',
                     'Accept-Language': 'zh-CN'})
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                data = response.read(2 * 1024 * 1024 + 1)
        except urllib.error.HTTPError as exc:
            # Numeric API codes are diagnostic; response text may contain secrets.
            try:
                obj = json.loads(exc.read(65536))
                code = obj.get('code') if isinstance(obj, dict) else None
            except (ValueError, OSError):
                code = None
            detail = f'，接口代码 {code}' if isinstance(code, (int, float)) else ''
            raise MpayError(f'MPay 返回 HTTP {exc.code}{detail}', http_status=exc.code) from None
        except (urllib.error.URLError, TimeoutError, OSError):
            raise MpayError('MPay 接口连接失败') from None
        if len(data) > 2 * 1024 * 1024:
            raise MpayError('MPay 响应超出大小限制')
        try:
            obj = json.loads(data)
        except (ValueError, UnicodeError):
            raise MpayError('MPay 响应不是 JSON') from None
        if not isinstance(obj, dict):
            raise MpayError('MPay 响应类型不受支持')
        if 'code' in obj:
            code = obj['code']
            detail = str(code) if isinstance(code, (int, float)) else '未识别'
            raise MpayError(f'MPay 未完成操作，接口代码 {detail}')
        return obj

    def register(self):
        # A fresh app installation identifier; no identifiers are read from a
        # user's installed game, hardware, or existing account files.
        obj = self._post('/games/' + self.game_id + '/devices', {
            'unique_id': str(uuid.uuid4()) + str(int(time.time() * 1000)),
            'mac': '', 'init_urs_device': '0',
            'brand': '', 'device_name': 'Onmyoji Local Query',
            # These fields describe the emulated SDK environment, not hardware
            # identifiers taken from the user's phone or PC.
            'device_type': 'tablet', 'device_model': 'Independent protocol client',
            'resolution': '1280*720', 'system_name': 'Android', 'system_version': '12',
            'app_channel': 'netease', 'oaid': '', 'ext_ci': '', 'ci_code': ''})
        device = obj.get('device')
        if not isinstance(device, dict) or not isinstance(device.get('id'), str):
            raise MpayError('MPay 未返回设备登记信息')
        try:
            key = bytes.fromhex(device['key'])
        except (ValueError, TypeError, KeyError):
            raise MpayError('MPay 设备密钥格式不受支持') from None
        if len(key) not in (16, 24, 32):
            raise MpayError('MPay 设备密钥长度不受支持')
        self.device_id, self.device_key = device['id'], key

    def exchange(self, code):
        if not isinstance(code, str) or not code or len(code) > 16384:
            raise MpayError('缺少有效的官方扫码授权码')
        if not self.device_id or not self.device_key:
            self.register()
        # SDK request.login.p -> widget.k.c(bytes, key): AES/ECB/PKCS7Padding;
        # widget.M.a(bytes) converts the ciphertext to lowercase hexadecimal.
        encrypted = AES.new(self.device_key, AES.MODE_ECB).encrypt(pad(code.encode('utf-8'), 16)).hex()
        obj = self._post('/api/users/login/qrcode/exchange_token', {
            'device_id': self.device_id, 'encrypt_code': encrypted,
            'opt_fields': 'realname_status'})
        user = obj.get('user')
        if (not isinstance(user, dict) or not isinstance(user.get('id'), str)
                or not user['id'] or not isinstance(user.get('token'), str) or not user['token']):
            raise MpayError('MPay 未返回账号授权信息')
        self.user = user
        return user

    def close(self):
        self.device_id = ''
        self.device_key = b''
        self.user = None

    def resume(self, info):
        previous = info['mpay_user']
        self.device_id = info['mpay_device_id']
        # PC MPay 4.19.1.489, file 0x152db0-0x1535f8: GET the saved
        # device/user route through the common c4.19.1 parameter builder.
        # The phone's source platform remains in pc_ext_info; it is not the
        # login_for parameter used by the Android token-login request.
        # This client never performs SMS login; the other SDK condition is
        # login type 7, taken verbatim from the official response.
        verify = '1' if str(previous.get('login_type', 1)) == '7' else '0'
        route = '/games/{}/devices/{}/users/{}'.format(*(
            urllib.parse.quote(value, safe='') for value in (self.game_id, self.device_id, previous['id'])))
        obj = self._request(route, {'token': previous['token'], 'verify_status': verify,
                                   'cv': 'c4.19.1',
                                   'opt_fields': 'nickname,avatar,realname_status,mobile_bind_status'}, 'GET')
        user = obj.get('user')
        if not isinstance(user, dict):
            raise MpayError('MPay 未返回账号续用信息，请重新扫码')
        # O keeps the previous id/token when omitted. Keep optional QR context
        # when omitted too; an explicit is_remember=false revokes local saving.
        current = {**previous, **user}
        current['id'] = user.get('id') or previous['id']
        current['token'] = user.get('token') or previous['token']
        if current['id'] != previous['id'] or not isinstance(current['token'], str):
            raise MpayError('MPay 续用响应与保存账号不一致，请重新扫码')
        if 'pc_ext_info' in user and not isinstance(user['pc_ext_info'], dict):
            raise MpayError('MPay 续用授权格式不受支持，请重新扫码')
        current['pc_ext_info'] = {**previous.get('pc_ext_info', {}), **user.get('pc_ext_info', {})}
        self.user = current
        return current
