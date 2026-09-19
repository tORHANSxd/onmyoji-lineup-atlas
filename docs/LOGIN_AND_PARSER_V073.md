# v0.7.3 账号续用与阵容码验证

## 已实现的行为

- 手机服务端返回 `mpay_user.pc_ext_info.is_remember=true`（或字符串 `true`）才保存。缺失、false、数字 1 均不视为授权；同账号再次登录取消记住时删除旧保存。
- 多账号使用 Electron `safeStorage` 加密，文件为 `%APPDATA%/onmyoji-lineup-atlas/remembered-accounts.bin`。Windows 绑定当前用户；不提供明文降级。该文件独立于阵容库、导出与安装包。
- 启动恢复上次记住的账号；先请求 MPay 令牌登录，再收到游戏服务器认证成功和已有角色后开放查询。服务端可轮换令牌；失败不伪造登录状态。网络中断保留已有记录；明确认证拒绝提示重新扫码。
- 退出当前会话保留已记住账号；忘记指定账号删除其凭据，若为当前账号同时结束会话。切换和退出会废弃旧进程回包与未完成查询。
- 格式校验统一为 `|TA|` 后接非空不透明分享键，最长 4096 字符，拒绝空白、控制字符和第二个分隔符。不以样本的 32 位十六进制形式冒充完整官方规范。
- 自动修复首尾空白/BOM、明确的全角或大小写前缀，以及合并后恰好为 32 位十六进制键的排版空白。保留原码和修复记录，不补缺字、不猜分享键、不改键大小写。完整 `#TA#` 内容可合并确定的 Base64 换行。
- 成功且与原码严格关联的原始 `lineup_data` 单独原子保存到 `ta-responses/`。自动解析可用原始返回重新解码；显式重新查询绕过缓存。过期、拒绝、解码错误分别保留原因；写盘失败暂停批次。

## APK 静态证据

实际解包目录为 `D:\Personal\APK解析\MuMu_Onmyoji_Codex\mumu-onmyoji-extractor\exports\onmyoji\20260912_211558_280259`。

当前 `derived/apk_000/3ee843463afbf85e/classes.dex` SHA-256：
`e36d80a6634e7d4ea0aa9e3ebf9b0669dfe62795f9c618e0fc2fdd8416c95b33`。

| 契约 | 当前客户端依据 | 软件行为 |
|---|---|---|
| 手机记住选项 | `server.request.login.L` 的 `/api/qrcode/confirm_login` 发送 `is_remember=0/1`；`login.a` 解析 `user.pc_ext_info`；`storage.module.t.t()` 调用 `login.e.a(channel, ext)` 读取 `is_remember` | 以服务端交换结果为准；不把 `qrcode_remember` UI 文案当授权 |
| 令牌续用 | `MpayApi$V.tryTokenLoginImpl → task.I0 → request.login.O`；网络发送器 `widget.net.e` 将方法 0 映射为 GET | 路径与 GET 方法用于交叉核对；最终 PC 请求参数以下文 DLL 证据为准，不沿用 Android 的 `login_for` |
| 续用平台 | `t.j ← response.w.m ← pc_ext_info.src_client_type`；`server.b.a` 映射 2→ios、5→pc、其他→ad | 保留 SDK 返回的来源字段；游戏角色平台另从扫码时保存的账号完整标识恢复，不能把 PC 类型 5 当作安卓 |
| 续用验证类型 | `verify_status=1` 当 t.h==7 或 `t.C[login_by_sms]==1` | 本工具只走二维码；保留响应 login_type，类型 7 为 1，其他为 0 |
| 续用响应 | `O.b` 使用标准 user 解析，缺省 id/token 沿用请求值 | 验证账号 ID 一致，更新令牌；省略的二维码上下文沿用保存值，明确撤销记住则删除保存 |
| 文字分享查询 | `TeamCodeInputPanel.py:160` 去除 TXT_CODE_PREFIX；`avatarmembers\LineupAssisantMember.py:439` 调用 `lineup_assisant_logic.get_share_lineup_data`，`share_key`，`iscache=False` | 通过已认证且已选中本人角色的连接查询，核对返回键 |
| 完整内容 | `TAPacker.py:962` 的 MessagePack → zlib → Base64；`TAConst` 为 `|TA|` / `#TA#` | 沿用 V0–V3 解码器，数字形式官方编号单独分类 |

解析资源摘要：TeamCodeInputPanel marshal SHA-256 `bf1a64e292b5852bdf3f45ff45c026ee7a4a07c78dc9a9d592acd8ce24bb0054`；LineupAssisantMember `d8fc5529b82b1d578f9b6ea404ef160935cfabf0d5915c99861c354735a91c6b`；TAPacker `c779a1124cb90a0432de782b7b79fe125a455f83a00cc174b7568c6924862556`。只做静态读取与反编译，没有执行游戏代码。

## 更新后的官方 PC SDK 证据

本轮只读核对 `E:\Program Files\yys\bin`。用户更新桌面客户端后，两份登录 DLL 的哈希未改变，`bin_patch` 未发现替代副本：

| 文件 | PE 版本 | SHA-256 |
|---|---|---|
| `mpay.dll` | 4.19.1.489 | `8ce77658cdb1cc9fadbd133ce01c51f72fcfb8e77d41fdca257c26a89fcad7f1` |
| `NtUniSdkMpay.dll` | 4.19.1.0 | `b38367c85f8ad5c80fa9b426f543a03a8fb560f610cbfe0fc10a152fa15da4b2` |

`mpay.dll` 文件偏移 `0x14e1e0–0x14e6a3` 的创建函数调用 `/api/qrcode/create_login`，同函数写入 `device_id`、`qrcode_channel_type="2"` 和 `is_remember="2"`。两个 `"2"` 均指向文件偏移 `0x4e211c`，不是手机确认时的 0/1 授权值。

版本串 `c4.19.1` 位于文件偏移 `0x4c6ff0`，由版本表初始化与 getter 返回；创建函数在 `0x14e476` 调用公共参数构建器，该构建器在 `0x16539b` 取版本、`0x16540a` 写入 `cv`，中间未改写前缀。请求分派的参数 1 沿调用链进入 GET 分支。因此御契二维码请求已使用这三个经静态核实的参数，保留 GET 方法。

官方交换令牌函数仍使用 `/api/users/login/qrcode/exchange_token`，包含 `device_id`、`encrypt_code`；`is_remember` 在用户模型中按布尔值读取。发现 `remember_uiless_login_token`、`need_auto_token_login` 字符串及 `mpay.db` 存储线索，但尚未仅凭这些名称认定完整续用契约，也未提取官方客户端数据库中的账号凭据。

PC 令牌登录函数位于 `mpay.dll` 文件偏移 `0x152db0–0x1535f8`：路径为 `/games/{game_id}/devices/{device_id}/users/{user_id}`，`0x15320b` 调用同一公共构建器，`0x153226` 引用 `token`，`0x153381` 引用 `verify_status`，`0x1532a1` 的 `opt_fields` 为 `nickname,avatar,realname_status,mobile_bind_status`；`0x153511` 设置 GET 分派参数。该函数没有 Android 的 `login_for`。御契据此使用 `cv=c4.19.1`，轮换令牌仍按原账号保存。

游戏平台依据游戏脚本 `network/rpcentity/ClientEntities.py:275` 的 `ClientAccount.loginWithSdk`：PC 登录调用 `setUserPlatform` 选择 iOS/安卓，iOS 将 `APP_CHANNEL`、`PAY_CHANNEL` 设为 `app_store`；PC 登录还标记 `is_login_in_pc` 和 `pc_app_channel`。御契沿用扫码时已保存且与账号 ID 匹配的 `full_uid` 中的平台，不改写服务端返回的 `src_client_type=5`，也不把未知来源默认当作安卓。

`ClientAccount.on_login_result`（源行 524）将错误 25 解释为“当前渠道不能登录该服务器”，只有错误 5 且 `sauth_result.code=401` 的分支确认令牌过期。御契已按此区分：渠道错误结束当前认证但保留已记住账号，确认失效才要求重新扫码。

## 验证与实际结果

2026-09-19 实际查询：两份工作簿共 363 处引用、328 个唯一原码，均通过格式检查并取得有效官方内容。复用先前大肾表的 110 个结果，本轮新增查询洛天依表的 218 个码，全部解码成功。结果已写入 373 条预设库，保留文件、工作表、单元格、说明和分类；数据导出为 `verification/workbook-lineups-current.json`。

**已完成实际免扫码登录验收。** 最终验证于 2026-09-19 14:55（北京时间）另启 Electron 进程，使用 `--remember-only --resume-only`，没有创建二维码、没有手机再次确认，读取加密账号后完成 MPay 认证和游戏角色连接，并真实查询一个已解析码得到 `err=0`。记录为 `phoneConfirmed=false`、`remembered=true`、`restoredWithoutScan=true`、`restoredRoleQuery.success=true`，保存无错误。实验摘要见 `verification/login-pc-v073.json`；不记录令牌或账号标识。

此前使用 `cv=p2.0.0` 的扫码回包明确返回 `is_remember=false`，单加 `is_remember=2` 也未获得授权；改为官方 PC `cv=c4.19.1` 后，手机勾选保存得到布尔 true 并完成加密保存。随后修正 PC 令牌请求和游戏平台保留逻辑，解决了旧 Android 续用请求错误及游戏渠道错误 25。未获保存授权的临时凭据没有落盘；没有伪造服务端授权位。

早期功能性接口检查（未扫码、没有压测）：使用 APK 的公共参数 cv=a5.18.0 时，type=3、4 均返回 HTTP 400 / MPay 1344，type=2 返回 HTTP 400 / MPay 1001。APK 的 `server.b$h.a()` 按 `widget.K.a()` 模拟器判断返回 3/4；手机 checkbox `widget.a.c()` 直接传入 confirm_login，没有反向取值。该结果不代替上文 PC SDK 契约；这些早期失败不代表当前 PC 请求仍不可用，也不据此推断网易服务端的内部实现。

`verification/remembered-accounts-v073.json` 是真实 Windows Electron 加密测试，使用合成账号。`verification/revision-ui-v073.json` 是真实 Electron 页面和队列测试，服务器返回为合成数据，不能算实际阵容查询成功。

`verification/workbook-current.json` 记录两份工作簿的逐码实际状态、来源单元格、错误及已解码阵容；`workbook-v073.json` 保留早期单份工作簿记录。`not-queried` 表示未发起查询，不代表原码无效。每份工作簿 SHA-256 必须与 `data/excel.json` 一致，否则验证脚本停止。旧结果只有来源文件哈希和原码均匹配才可复用。

只读格式检查：`node_modules/electron/dist/electron.exe tools/verify-live-workbook.cjs`。

实际验证：`node_modules/electron/dist/electron.exe tools/verify-live-workbook.cjs --live`。窗口需要用户用手游扫码；若手机授权记住，接着验证无需第二次扫码的令牌续用。逐码保存结果，重复原码只请求一次。此命令使用本机软件的加密账号库和阵容原始返回缓存。

只验证登录可加 `--remember-only`，会在恢复后查询一个已解析码核验角色会话；另启新进程并加 `--remember-only --resume-only` 时，恢复失败会直接报错，不能回退到扫码冒充重启成功。

请求间隔至少 1.5 秒，同码重复查询冷却 60 秒，90011 最多重试两次，等待 3/6 秒。这些是本工具保守策略，**不是已测得的服务器阈值**。实际验证连续三个不同码暂时拒绝时停止本轮；没有对第三方服务做洪水阈值探测，也不声称能完全伪装官方客户端或保证过期码可恢复。

本次仅交付本地 v0.7.3 构建，不创建或更新 GitHub Release。
