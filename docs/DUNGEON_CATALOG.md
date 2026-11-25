# 全客户端副本资料

御契桌面版在「阵容库 → 全客户端副本与规则」按需读取本地资料。打包前将生成的目录放在 `data/dungeon-catalog`，即可随桌面版打开。运行时也可以在这个面板选择已有的副本资料目录。

《阴阳师》2.8.87 的 `0.0.816` 资源包中，已从 3,850 个客户端配置模块读取 3,846 张表，共 659,344 条记录。主要资料包括 17,617 条通用 PvE 关卡、17,563 条战斗编组、491 条场景站位、217 条通用战斗模式以及御魂、觉醒、秘闻、阴阳寮狭间暗域、活动组队等玩法专表。表项保留来源模块和校验值，读取资料表时核对压缩文件的 SHA-256。

`__init__`、`bindict_proxy`、`deco_skin_index` 和 `skin_bg_index` 的静态记录未提取。玩法筛选根据客户端表名归类，可在全部玩法中搜索每张表。客户端表含历史活动和内部记录，区服开放、入场资格和服务器结算须以实机为准。静态表可供核对规则与输入，100% 通关和动画耗时仍需战斗回放及可达分支证据。

## 御魂神罚规则核对

资源 `0.0.816` 的御魂神罚配置使用副本 ID 102、阵容码副本 ID 1001001、战斗场景 469055。离线调用同版本 `RuneFbEngine` 初始化得到 3 波敌人，我方初始鬼火 3，敌方初始鬼火 2。原版 `_adjustMonsterAttr` 在三波分别给敌方攻击加成率累加 2.0、2.4、2.2，其余四项配置为 0，随后以调整后的最大生命初始化当前生命。对应模块的 marshal SHA-256 为 `bde51d4ceee8fb08c0b5e265eb4bb9663d5a6efe207517b9d16b0dc968749f24`。

动画走客户端模型动作和事件。客户端同一条动作命令接收动作列表时累加列表内时长，多个实体实际是否重叠取决于播放事件及战斗推进时序。模型文件时长可以核对单段动作，需要同一对局的完整事件时间轴才能据此核验整局耗时。对应 `entities/BattleRender` 模块的 marshal SHA-256 为 `97cb2740eacbad47e7f44dd6dbf2033b76bb18af6f16721671f6fa4e8bb07a21`。

## 从本机解包资源生成

使用「阴阳师解包」导出的安装包及云资源，保留 `raw/extra/thd`、`raw/extra/script3.zip` 和 `raw/extra/update.ini`。从「阴阳师培育」的本地分析项目指定 `tools` 和含已验证 opcode 映射的目录。提取工具需要 CPython 3.11.6 及该分析项目的依赖。若原生库校验值与 opcode 证据不符，须使用该版本对应的证据。

```powershell
& $YuqiPython tools/extract-dungeon-catalog.py $YuqiSnapshot --game-tools $YuqiGameTools --opcode-proof $YuqiOpcodeProof --apk-version 2.8.87 --tables tmp/dungeon-tables --output data/dungeon-catalog
```

已提取的 JSON 表也可以直接打包。

```powershell
python tools/build_dungeon_catalog.py tmp/dungeon-tables data/dungeon-catalog
```

运行提取命令时可追加 `--battle-index output/battle-modules.json`，为本版本的 6,942 个战斗模块记录资源路径、偏移和校验值。该索引可定位同一版本的模块，客户端原始文件仍位于解包目录。
