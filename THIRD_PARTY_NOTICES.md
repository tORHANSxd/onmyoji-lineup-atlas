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
