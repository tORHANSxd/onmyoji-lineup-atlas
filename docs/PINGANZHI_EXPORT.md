# 平安志库存解析依据

库存解析依据平安志 0.2.8-beta 的 Windows x64 程序。经 REA 标识的 `yys-analysis.exe` SHA-256 为 `4f88390d48510bf9b22d7c3a2affd55ae74076116cf6b36bd61fcb464dba18a4`。以下地址按镜像基址 `0x140000000` 记录。程序已剥离符号，使用 PE 展开表定位函数，再用 Ghidra 定点反编译核对数据流。

| 程序位置 | 核对结果 |
| --- | --- |
| `0x1405bc302` | Tauri 的 `export_character_archive` 命令入口，读取请求，返回记录数与输出目录。 |
| `0x1405bd70c` | 角色档案导出工作函数，校验所选快照归属并读取原始对象。原始对象缺失时走当前数据中的原始 JSON 分支，再交给文件写入路径。 |
| `0x14043d89a` | `CurrentDataDocument` JSON 序列化。独立写入版本、来源、完整度、`rawSha256`、`normalizedSouls`、`normalizedShikigami`、`normalizedItems`、`normalizedRealmCards` 和 `sourcePayload`，另有条件写入的 `integrityMac` 字段。 |
| `0x1404ccb0c` | 当前数据处理路径检查文档版本为 2 后调用上述序列化函数。 |
| `0x14040f786` | 对 `desktop`、`mumu`、`ldplayer`、`bluestacks` 读取 `sourcePayload` 的来源与契灵信息。另有独立的藏宝阁分支。 |
| `0x140427a68` | 构造桌面快照，写入 `yys-desktop-cache-v1`、`souls`、`heroesBagEntries` 和 `hunlings` 等字段。 |
| `0x140424eca` | 一条载荷转换路径先调用桌面快照构造函数，再改写格式为 `mumu-snapshot-v1`，将 `souls` 移入 `hero_equips`。 |
| `0x1404e86a1` | 按类别复制原始快照字段。式神、契灵、御魂及预设分别受导出类别条件控制。 |
| `0x1404e966c` | 原始库存解析分支识别 `mumu-snapshot-v1` 并读取 `hero_equips`，桌面分支识别 `yys-desktop-cache-v1` 并走 `souls`。此函数还处理其他导入来源，其格式需逐个追踪。 |
| `0x1405d4f3e` | 分类合并档案构造及保存路径，在顶层写入 `souls`、`format: yys-archive-merge-v1`、`source: archive-merge`、`schemaVersion: 1`、`mergeSources` 和 `scope`，保存时使用 `native` 来源。合并可分别为式神和御魂选择快照版本。 |

御契使用已识别的原始快照读取式神实例、御魂、契灵和采集范围。对版本 2 缓存，先检查来源属于角色采集，再按 `sourcePayload.format` 选择结构校验，不从采集平台推定快照结构。缓存的 `normalized*` 是平安志的派生数据，文件的原始快照字段会保留到御契备份。当前对 `rawSha256` 只校验字段格式，未验证平安志内部 MAC。缺失原始快照、来源不符、格式未知时，界面提示改用角色档案的 JSON 导出。

御契也支持分类合并档案中的已识别库存记录，保留各类别的来源并提示用户用同一次完整采集确认库存。导出明确将某类别标为未采集时，该类别可以省略。其他库存字段仍走原有的结构与实例 ID 校验。

平安志桌面快照构造函数 `0x140427a68` 读取 `hunlings` 数组，再将该数组写入新快照。御契保留这部分原始库存。魂王复跑使用客户端 `HunlingDataKey` 对应的 `uid`、`id`、`lv`、`star`、`shiny` 和 `marks` 字段。战斗用技能表按原版 `HunlingAttrCalc` 和 `get_battle_souls` 生成，实际库存的实例标识在复跑前换为临时标识。

同一构造函数在 `0x14042a2a9` 的字段组装路径写入式神 `equips`。客户端 `HeroData.initFromDict` 读取该列表，`HeroComp.initHeroData` 按实例 ID 在库存中取御魂。御契据此核对当前穿戴，检查引用存在、槽位唯一且每件御魂只有一个穿戴者。`equippedState` 保留用于显示。两份本机库存分别确认 98 件和 227 件已穿戴御魂。涉及的 90 个式神实例均通过保留穿戴的面板计算。

已用四份本机版本 2 MuMu 缓存验证导入与备份恢复。桌面、雷电、蓝叠、分类合并和按类别省略的语义使用合成记录验收。角色档案的其他导出物、旧格式别名及藏宝阁库存走不同路径，尚未完成兼容验证。
