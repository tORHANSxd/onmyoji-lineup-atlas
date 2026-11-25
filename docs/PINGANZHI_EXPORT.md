# 平安志库存解析依据

库存解析依据平安志 0.2.8-beta 的 Windows x64 程序。经 REA 标识的 `yys-analysis.exe` SHA-256 为 `4f88390d48510bf9b22d7c3a2affd55ae74076116cf6b36bd61fcb464dba18a4`。以下地址按镜像基址 `0x140000000` 记录。程序已剥离符号，使用 PE 展开表定位函数，再用 Ghidra 定点反编译核对数据流。

| 程序位置 | 核对结果 |
| --- | --- |
| `0x1405bc302` | Tauri 的 `export_character_archive` 命令入口，读取请求，返回记录数与输出目录。 |
| `0x14043d89a` | `CurrentDataDocument` JSON 序列化。独立写入版本、来源、完整度、`rawSha256`、`normalizedSouls`、`normalizedShikigami`、`normalizedItems`、`normalizedRealmCards` 和 `sourcePayload`，另有条件写入的 `integrityMac` 字段。 |
| `0x1404ccb0c` | 当前数据处理路径检查文档版本为 2 后调用上述序列化函数。 |
| `0x14040f786` | 对 `desktop`、`mumu`、`ldplayer`、`bluestacks` 读取 `sourcePayload` 的来源与契灵信息。另有独立的藏宝阁分支。 |
| `0x140427a68` | 构造桌面快照，写入 `yys-desktop-cache-v1`、`souls`、`heroesBagEntries` 和 `hunlings` 等字段。 |
| `0x140424eca` | 一条载荷转换路径先调用桌面快照构造函数，再改写格式为 `mumu-snapshot-v1`，将 `souls` 移入 `hero_equips`。 |
| `0x1404e966c` | 原始库存解析分支识别 `mumu-snapshot-v1` 并读取 `hero_equips`，桌面分支识别 `yys-desktop-cache-v1` 并走 `souls`。此函数还处理其他导入来源，其格式需逐个追踪。 |

御契使用已识别的原始快照读取式神实例、御魂、契灵和采集范围。对版本 2 缓存，先检查来源属于角色采集，再按 `sourcePayload.format` 选择结构校验，不从采集平台推定快照结构。缓存的 `normalized*` 是平安志的派生数据，文件的原始快照字段会保留到御契备份。当前对 `rawSha256` 只校验字段格式，未验证平安志内部 MAC。缺失原始快照、来源不符、格式未知时，界面提示改用角色档案的 JSON 导出。

版本 2 MuMu 缓存已用两份真实本机库存测试，并验证了备份恢复。桌面、雷电和蓝叠封装分支使用合成记录验收。未来版本与其他导入来源需有对应的程序证据和回归样本。
