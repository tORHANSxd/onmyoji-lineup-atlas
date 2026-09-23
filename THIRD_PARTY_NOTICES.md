# 第三方素材与计算来源

本项目不是网易官方软件。

官方式神立绘、头像、书签及角色名称的权利归网易和相关权利人；仅作为个人学习与本地阵容查询资料，不声称获得商业素材授权。每个文件的官方URL、采集时间、尺寸与SHA-256保留在数据中。

阵容原码来自用户提供的Excel和公开攻略。公开来源按作者、链接、日期保留，仅整理可验证的成员和配置事实；没有转载完整攻略正文或视频。

御魂套装映射、指标含义和面板公式参考 FiresChain/onmyoji-yuhun（MIT）：
https://github.com/FiresChain/onmyoji-yuhun

方法A服务为第三方 https://api.fireschain.org/onmyoji/v1/team-code/decode ，不是网易官方解析器。v0.2.0 已停止向该服务发送阵容码，旧探测结果仅作历史记录。御魂计算指标是社区实现，不是网易认证计算结果。

晴明、神乐、源博雅、八百比丘尼的补充形象来自网易繁中官网 https://www.onmyojigame.com/zh/m/onmyoji/index.html ，原始页面、CSS关联、头像alt、图片URL和校验值保留在记录中，仅用于形象展示。

源赖光与藤原道长的立绘分别来自 BWiki 同名角色页： https://wiki.biligame.com/yys/源赖光 和 https://wiki.biligame.com/yys/藤原道长 。图片以原始字节本地保存，来源标记为社区百科，不声称取得商业授权，也不声称其为网易官网发布地址。未移除原图文字或其他标记。

TA解析参考用户指定研究任务的协议说明与测试向量，未分发APK或字节码；这不表示取得网易官方支持。协议范围和限制见 docs/TA_PROTOCOL.md。

v0.4.0 的独立登录模块改编自同一研究任务验证过的 MPay、网关与选服实现；安装包包含协议常量、Protobuf描述和公开服务器元数据，不包含APK、游戏启动入口、个人令牌或账号数据库。仅通过用户本次扫码授权查询阵容。

安装包中的 `resources/ta-runtime/` 包含冻结Python运行时、MessagePack、Protocol Buffers、PyCryptodome及被打包的辅助库。原始许可证保留于其 `licenses/` 目录，具体版本和文件列表在 `runtime-manifest.json` 中；Python、库代码与PyInstaller引导程序的许可证独立于本项目MIT许可证。PyInstaller许可证含分发所生成应用的例外条款，原文随包保留。

本机二维码识别使用 jsQR 1.4.0（Apache-2.0），发行文件 app/vendor/jsQR.js 未作修改，许可证保存在 app/vendor/jsQR.LICENSE.txt。MessagePack解码使用 @msgpack/msgpack 3.1.3（ISC），许可证保存在 app/vendor/msgpack.LICENSE.txt 及依赖目录。相关依赖未被本项目MIT许可证覆盖。

Electron、Chromium与electron-builder的许可证归各自权利人。发行包保留运行时自带的LICENSE与LICENSES.chromium.html。

以下保留参考项目许可证：

MIT License

Copyright (c) 2026 FiresChain

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## v0.7.0 新增素材

- 70 种御魂图标来自网易藏宝阁 `https://cbg-yys.res.netease.com/game_res/suit/{suitId}.png`。模板在官方 `https://yys.cbg.163.com/yuhun-collocation` 动态页面的御魂组件中直接使用；空御魂图也来自该页面的官方 CSS 资源。未重新绘制或修改画面。
- 794 张式神技能图标来自网易官方 `get_hero_skill` 返回的 icon 字段及 `yys.res.netease.com`。下载脚本及每项来源、哈希均保留。
- 5 种达摩形象来自 BWiki 对应角色页，6 位主角头像、48 张主角技能、8 张契灵来自 FiresChain 游戏素材目录。这些镜像来源标为社区资料，不冒称网易官方发布地址。游戏图像权利仍归原权利人。
- 「御契」名称及应用 logo 为本项目本次设计；logo 通过 OpenAI 图像生成工具创作，与网易官方标识无关联。
- 686 条关卡分类事实来自用户提供的 APK 指定 cdata，只有必要映射数据随包提供，不分发游戏代码或APK。

## v0.7.1 客户端补全

48 张契灵术印原图及对应名称、各等级效果来自用户提供的网易客户端快照 `20260912_211558_280259`。原始资源通过客户端 THFB 名称索引、IDX 内容摘要与 WPK 数据定位，KTX1 / ASTC 5x5 纹理解码为 PNG，保留原始尺寸和像素方向，未重新绘制或用相似图替换。逐项资源名、源摘要及输出 SHA-256 记录在 `data/game-assets.json`。

客户端只用于本机静态资料核验；安装包不包含 APK、客户端字节码、原资源容器或账号私有目录。图像及描述权利归网易和相关权利人，不属于本项目的 MIT 授权。

## 0.8.0 周年主题素材

「拾光永恒」十周年活动海报来自网易阴阳师官方账号「阴阳师手游扫地工」的 [TapTap 活动公告](https://www.taptap.cn/moment/844350039781280169?group_id=71)。原始字节保存在 `app/assets/anniversary-2026.jpg`；图片 URL、下载时间和 SHA-256 保存在相邻的 `anniversary-2026.source.json`。界面通过 CSS 显示海报局部，不改写原始图像。图像版权归网易及相关权利人，御契为非官方工具。

## 0.9.0 二维码生成

使用 [node-qrcode 1.5.4](https://github.com/soldair/node-qrcode)（MIT）在本地生成二维码，库及许可证随依赖提供。公开攻略测试图片仅用于本机识别核验，未放入软件素材；样本来源与摘要记录在 tests/fixtures/public-qr-samples.json。

## v0.9.3 技能与编辑器资料

新增从用户提供的同一客户端快照及其补丁静态提取的 1,026 张技能图标，按客户端角色、技能和觉醒／分支配置关联；图标包含与既有素材重复的对象。来源容器摘要、原始资源 SHA-256、转换后的 PNG SHA-256 与尺寸见 data/game-config.json（发布时合并到 data/bundle.json 的 gameConfig）。ASTC 解码保留原图像，不绘制替代品。技能名称、鬼火、各级效果、官方类型词条、契灵与术印配置同样来自该快照，权利归网易及相关权利人。
