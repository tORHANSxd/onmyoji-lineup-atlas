# 御契 v0.7.1 客户端补全

本地开发构建，未创建、更新或发布 GitHub Release。

## 补全结果

从用户指定客户端快照 `20260912_211558_280259` 中取得全部 48 个契灵术印原图，并整理真实名称与 1 / 2 / 3 级效果，共 144 条说明。原有 932 张补充素材增加到 980 张，式神原有立绘与头像另行保留。

阵容详情在契灵旁显示术印卡片。同 ID 重复出现时显示数量与原码中的位置；点击卡片展开等级说明。不同 ID 即使同名也保留独立图标，例如三种「术印·占卜」。未知 ID 保留待核对提示，不使用其他对象图片代替。

客户端 `hunling_logic` 将 `marks` 中每一项作为全局术印 ID 查询。它没有证明重复数量等于技能等级，故界面只列各等级参考效果，不推定实际生效等级。账号导出缺少契灵库存，仍须在游戏内核对是否拥有及配置正确。

## 提取与校验

读取范围是 APK 解出的资源、下载资源索引与容器、必要的静态脚本常量及原生格式信息，没有运行提取的游戏代码，没有读取账号数据库或 `private_ce`。

1. 用 `icon.thx` 的 THFB 名称索引匹配 `skill/77800.png` 至 `skill/77847.png`，保留名称大小写，按文件中提供的种子计算 XXH64。IDX 的摘要标识内容，不是文件名摘要。
2. IDX 的外部文件卷号 `255` 也必须读取。忽略这类条目会漏掉实际的 `com/data/cdata/skill.nxs3` 大表；此前的 `new_skill.py` 不能代替它。
3. 对每个取出的资源校验内容 MD5 与索引一致，再解码 KTX1 / ASTC 5x5 为原尺寸 PNG。48 张全部完整解码并查看合成检视图；保存源纹理和 PNG 的 SHA-256。
4. 技能数据的稀疏记录按 `ProtoedDict` 的 `_proto_key` 继承规则取得字段，以 `combatDesc` 保留各等级效果。变体键的 `1101` 编码只作不透明引用匹配，不推断其游戏语义。

成品事实在 `data/qiling-marks.json`，素材来源在 `data/game-assets.json`；两者汇入发行包的 `data/bundle.json`。研究缓存与提取的代码不进入安装包。重复导入已核验 PNG / 事实可用 `node tools/import-client-marks.cjs <本地核验输出目录>`。

格式参考：[Khronos KTX1 规范](https://registry.khronos.org/KTX/specs/1.0/ktxspec.v1.html)、[xxHash 官方规范](https://github.com/Cyan4973/xxHash/blob/dev/doc/xxhash_spec.md)、[texture2ddecoder 解码接口](https://pypi.org/project/texture2ddecoder/)。

## 算法核验

- 当前 THFB 索引中的 `TACalcMgr`、`TACalcHelper`、`auto_yuhun_helpers`、8 个 `auto_yuhun` 数据表、御魂套装表及术印表/逻辑共 15 个资源，与已核验 APK 的内容摘要一致。
- 新旧 `AttrCalc.py` 递归比较 359 个代码对象，包括数值常量、参数、闭包与异常表。变化集中于活动专用属性表及十周年活动模式选择，基础面板、御魂属性叠加与常规套装公式没有变化。顶层差异是嵌套代码变化的传递。
- 按原有字段映射复核当前支持的 278 个式神，名称、素材标记、模型、基础命中/抵抗、觉醒加成及已使用成长字段均无差异。没有把 `awakeAttr` 的键值对漏读为零加成。
- 这些核验不等于客户端提供了服务器实战状态，也不扩大软件的最优性证明范围。活动专用属性、主角、契灵及战斗配置仍待核对。既有完整搜索、同队实例不重用及未知条件不伪装成无解的约束保留。

逐项内容摘要与核验范围见 [客户端核验报告](../verification/client-resources-v071.json)。

## 验收

134 项 Node 测试通过；Electron 回归中的 155 次合成查询得到 150 成功 / 5 失败，详情页 30 个御魂位置与新增术印卡片均通过。4 张不同术印卡片正确汇总 5 枚术印，展开 3 级说明，未知 ID 保留提示，页面错误为 0。

最终 Setup 中 224 个文件与构建逐项哈希一致；离线启动、主动获取官方二维码、157 个服务器目录及登出清理通过。没有安装或卸载用户现有版本，已有安装元数据、快捷方式与用户资料保持原样。包内 1022 项源码/素材、149 项运行时文件和 7 项协议源文件与当前源码一致，禁止打包的文件为 0。

本地安装包：`release/Yuqi-Setup-0.7.1-Windows-x64.exe`，293,885,068 字节，未数字签名。SHA-256：`739f4b5a2a4139eb23e6133e189fb7082a523d9e4ebbbc4cbbee8f24abbab28c`。运行此安装包后生效，本次没有替用户安装。

见 [Node 测试](../verification/node-tests-v071.txt)、[Electron 界面回归](../verification/revision-ui-v071.json)、[最终安装包验收](../verification/installer-v071.json) 与 [打包源码核对](../verification/package-audit-v071.json)。真实 155 条在线原码仍需用户扫码后的会话；本次回归使用合成服务器响应，不声称已完成真实查询。
