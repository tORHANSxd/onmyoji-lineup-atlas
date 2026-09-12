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
    pass


class MpayClient:
    BASE = 'https://service.mkey.163.com/mpay'

    def __init__(self, game_id):
        self.game_id = game_id
        self.device_id = ''
        self.device_key = b''
        self.user = None

    def _post(self, path, parameters):
        params = {'game_id': self.game_id, 'gv': '260902', 'gvn': '2.8.84',
                  'cv': 'a5.18.0', 'sv': '32', 'app_type': 'games', 'app_mode': '2',
                  'jf_game_id': 'g37', 'pkg_channel': 'netease', 'app_channel': 'netease',
                  'sc': '0'}
        params.update(parameters)
        request = urllib.request.Request(
            self.BASE + path,
            data=urllib.parse.urlencode(params).encode('ascii'),
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
            raise MpayError(f'MPay 返回 HTTP {exc.code}{detail}') from None
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
